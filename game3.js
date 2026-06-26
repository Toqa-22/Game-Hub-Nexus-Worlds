/* ============================================================
   GAME 3 — ZOMBIE SURVIVAL CITY (Hard)
   FP shooter. Small city, day/night cycle, zombies that seek
   the player, ammo + reload, a safe zone that heals, rising
   aggression over time. Survive until dawn (timer).
   ============================================================ */
GameHub.register({
  title: 'نجاة من الزومبي',
  icon: '🧟', color: '#5ef38c', shape: 'cube',
  diff: 'hard', diffLabel: 'صعب',
  desc: 'انجُ من زحف الزومبي في المدينة حتى الفجر.',

  create(ctx) {
    const { THREE, scene, camera, H, Util, Pool } = ctx;
    H.light();
    const sky = new THREE.Color(0x10203a); scene.background = sky;
    scene.fog = new THREE.FogExp2(0x10203a, 0.02);
    const sun = new THREE.DirectionalLight(0xffeecc, 0.6); sun.position.set(20, 30, 10); scene.add(sun);
    const moonL = new THREE.PointLight(0x6688cc, 0.6, 200); moonL.position.set(0, 50, 0); scene.add(moonL);

    H.ground(140, 0x1a1a22, { roughness: 1 });

    // city blocks (solid)
    const bounds = { x: 55, z: 55 };
    for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++) {
      if (Math.abs(gx) + Math.abs(gz) < 2) continue; // open center
      if (Math.random() < .55) {
        const h = Util.rand(5, 16);
        H.addBox(gx * 12 + Util.rand(-2, 2), h / 2, gz * 12 + Util.rand(-2, 2), Util.rand(5, 8), h, Util.rand(5, 8), 0x232336, { roughness: .9 });
      }
    }
    // safe zone (heal pad)
    const safe = new THREE.Mesh(new THREE.CircleGeometry(4, 24), new THREE.MeshStandardMaterial({ color: 0x1a5a3a, emissive: 0x0a3a1a, transparent: true, opacity: .7 }));
    safe.rotation.x = -Math.PI / 2; safe.position.set(0, .02, 0); scene.add(safe);
    const safeLight = new THREE.PointLight(0x5ef38c, 1.4, 12); safeLight.position.set(0, 3, 0); scene.add(safeLight);

    const c = ctx.makeController({ mode: 'fp', y: 1.7, speed: 5.4, sprintMul: 1.5, bounds });

    // gun
    const lasers = new Pool(() => { const m = H.sphere(0, 0, 0, .12, 0x5ef38c, { emissive: 0x5ef38c }); m.visible = false; return m; }, m => m.visible = true);

    // zombies
    const zombies = [];
    function spawnZombie() {
      const a = Util.rand(0, Math.PI * 2), r = Util.rand(35, 50);
      const g = new THREE.Group();
      const torso = H.sphere(0, 1, 0, .5, 0x3a5a3a, { roughness: 1 }); torso.scale.set(.8, 1.3, .6); g.add(torso);
      const head = H.sphere(0, 1.9, 0, .32, 0x4a6a4a, { roughness: 1 }); g.add(head);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
      [-.13, .13].forEach(dx => { const e = new THREE.Mesh(new THREE.SphereGeometry(.06, 6, 6), eyeMat); e.position.set(dx, 1.95, .28); g.add(e); });
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      scene.add(g);
      zombies.push({ g, torso, hp: 3, speed: Util.rand(1.6, 2.6), wob: Util.rand(0, 6) });
    }

    let hp = 100, ammo = 12, maxAmmo = 12, reserve = 60, reloading = 0, fireCd = 0;
    let dayT = 0, survived = 0, won = false, lost = false, t = 0, aggression = 1, spawnTimer = 0;
    const DAY_LEN = 90; // seconds to survive

    ctx.hud.crosshair(true);
    ctx.hud.objective('🌅 انجُ ٩٠ ثانية حتى الفجر · <span style="color:#5ef38c">المسافة</span> إطلاق · <span style="color:#ffb347">R</span> تعبئة · المنطقة الخضراء تشفي');
    ctx.hud.hint('<span class="keycap">R</span> لإعادة التعبئة · ابقَ متحركاً!');
    setTimeout(() => ctx.hud.hint(''), 4500);
    for (let i = 0; i < 6; i++) spawnZombie();

    const tmp = new THREE.Vector3();
    function shoot() {
      if (reloading > 0 || ammo <= 0) { if (ammo <= 0) ctx.hud.toast('🔃 اضغط R للتعبئة', '#ffb347'); return; }
      ammo--; AudioManager.shoot();
      const m = lasers.get(); m.position.copy(camera.position); camera.getWorldDirection(tmp);
      m.userData = { v: tmp.clone().multiplyScalar(70), life: 1.2 };
    }
    function reload() {
      if (reloading > 0 || ammo === maxAmmo || reserve <= 0) return;
      reloading = 1.3; AudioManager.ui();
    }

    return {
      update(dt) {
        if (won || lost) return;
        t += dt; dayT += dt; survived = dayT;
        c.update(dt);

        // day/night tint + aggression rises
        const phase = dayT / DAY_LEN;
        aggression = 1 + phase * 2.2;
        const nightCol = new THREE.Color(0x10203a).lerp(new THREE.Color(0x2a3a55), Math.sin(phase * Math.PI));
        scene.background = nightCol; scene.fog.color = nightCol;

        fireCd -= dt;
        if ((ctx.input.buttons.action || ctx.input.keys['Space']) && fireCd <= 0) { shoot(); fireCd = 0.22; }
        if (ctx.input.justKey('KeyR') || ctx.input.justBtn('interact') || ctx.input.consumeInteract()) reload();
        if (reloading > 0) { reloading -= dt; if (reloading <= 0) { const need = maxAmmo - ammo, take = Math.min(need, reserve); ammo += take; reserve -= take; AudioManager.confirm(); } }

        // lasers vs zombies
        lasers.forEach(m => {
          m.position.addScaledVector(m.userData.v, dt); m.userData.life -= dt;
          for (const z of zombies) { if (m.position.distanceTo(z.g.position.clone().setY(1.2)) < .8) { z.hp--; z.torso.material.emissive.setHex(0x5ef38c); m.userData.life = 0; AudioManager.hit(); break; } }
          if (m.userData.life <= 0) { m.visible = false; lasers.release(m); }
        });

        // spawn over time
        spawnTimer -= dt;
        if (spawnTimer <= 0 && zombies.length < 4 + aggression * 5) { spawnZombie(); spawnTimer = Math.max(.6, 2.2 / aggression); }

        // zombie AI seek
        const inSafe = Util.dist2(c.pos.x, c.pos.z, 0, 0) < 16;
        for (let i = zombies.length - 1; i >= 0; i--) {
          const z = zombies[i];
          z.torso.material.emissive.lerp(new THREE.Color(0x000000), .1);
          const dir = tmp.set(c.pos.x - z.g.position.x, 0, c.pos.z - z.g.position.z);
          const d = dir.length(); dir.normalize();
          z.g.position.addScaledVector(dir, z.speed * aggression * .6 * dt);
          z.g.rotation.y = Math.atan2(dir.x, dir.z);
          z.g.position.y = Math.abs(Math.sin(t * 4 + z.wob)) * .12;
          if (d < 1.2 && !inSafe) { hp -= dt * 16; ctx.hud.flash(true); } 
          if (z.hp <= 0) { scene.remove(z.g); zombies.splice(i, 1); AudioManager.pickup(); }
        }
        if (!zombies.some(z => Util.dist2(c.pos.x, c.pos.z, z.g.position.x, z.g.position.z) < 1.6) || inSafe) ctx.hud.flash(false);

        // safe zone heal
        if (inSafe) { hp = Math.min(100, hp + dt * 10); safeLight.intensity = 1.6 + Math.sin(t * 5) * .4; }

        if (hp <= 0) { lost = true; ctx.lose(`سقطت بعد ${survived | 0} ثانية.`); return; }
        if (dayT >= DAY_LEN) { won = true; ctx.win('طلع الفجر ونجوت من الليل!'); return; }

        ctx.hud.stats(`HP ${hp | 0}<br>AMMO ${reloading > 0 ? '...' : ammo}/${reserve}<br>TIME ${(DAY_LEN - dayT) | 0}s<br>ZOMBIES ${zombies.length}`);
      },
      dispose() { ctx.hud.crosshair(false); ctx.hud.flash(false); }
    };
  }
});
