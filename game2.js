/* ============================================================
   GAME 2 — DRONE SURVIVAL SHOOTER (Medium-Hard)
   Third-person flying drone. Wave-based enemies:
   fast small drones + heavy slow tanks. Laser (rapid) +
   Rocket (cooldown, splash). Survive all waves.
   ============================================================ */
GameHub.register({
  title: 'دفاع الدرون',
  icon: '🔫', color: '#ff6b9d', shape: 'diamond',
  diff: 'medium', diffLabel: 'متوسط-صعب',
  desc: 'طائرة درون تصدّ موجات الأعداء بالليزر والصواريخ.',

  create(ctx) {
    const { THREE, scene, camera, H, Util, Pool } = ctx;
    scene.background = new THREE.Color(0x0a0a1e);
    scene.fog = new THREE.FogExp2(0x0a0a1e, 0.012);
    H.light();
    H.ground(180, 0x101030, { roughness: 1 });
    const grid = new THREE.GridHelper(180, 60, 0xff6b9d, 0x222244);
    grid.material.opacity = .3; grid.material.transparent = true; scene.add(grid);

    // pillars for cover/atmosphere
    for (let i = 0; i < 14; i++)
      H.cyl(Util.rand(-60, 60), 8, Util.rand(-60, 60), 1.2, 1.6, 16, 0x1a1a3a, { roughness: .7 });

    // player drone (third person, flying)
    const body = new THREE.Group();
    const core = H.sphere(0, 0, 0, .5, 0x4fc3f7, { emissive: 0x1a5a7a, metalness: .6 }); body.add(core);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, 1), new THREE.MeshStandardMaterial({ color: 0x333355 }));
      arm.position.set(Math.cos(i * Math.PI / 2) * .7, 0, Math.sin(i * Math.PI / 2) * .7);
      arm.lookAt(0, 0, 0); body.add(arm);
      const rotor = H.sphere(Math.cos(i * Math.PI / 2) * 1.1, 0, Math.sin(i * Math.PI / 2) * 1.1, .25, 0x222244);
      body.add(rotor);
    }
    scene.add(body);

    const c = ctx.makeController({ mode: 'tp', y: 8, speed: 11, canFly: true, mesh: body, tpDist: 8, tpHeight: 3, gravity: 0 });

    // projectile pools
    const lasers = new Pool(
      () => { const m = H.sphere(0, 0, 0, .18, 0x4fc3f7, { emissive: 0x4fc3f7 }); m.visible = false; return m; },
      m => { m.visible = true; });
    const rockets = new Pool(
      () => { const m = H.cyl(0, 0, 0, .12, .2, .7, 0xffb347, { emissive: 0x7a4a10 }); m.visible = false; return m; },
      m => { m.visible = true; });

    // enemy pool
    const enemies = [];
    function spawnEnemy(type) {
      const isTank = type === 'tank';
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: isTank ? 0xff5d6c : 0xffcc66, emissive: isTank ? 0x5a1015 : 0x5a4010, metalness: .4 });
      const mesh = new THREE.Mesh(isTank ? new THREE.IcosahedronGeometry(1.4, 0) : new THREE.OctahedronGeometry(.7, 0), mat);
      g.add(mesh);
      const a = Util.rand(0, Math.PI * 2), r = Util.rand(45, 65);
      g.position.set(Math.cos(a) * r, Util.rand(4, 12), Math.sin(a) * r);
      scene.add(g);
      enemies.push({ g, mesh, type, hp: isTank ? 6 : 2, speed: isTank ? 2.4 : 6.5, fire: Util.rand(1, 3) });
    }

    let wave = 0, alive = 0, won = false, lost = false, t = 0;
    let hp = 100, fireCd = 0, rocketCd = 0;
    let upgrades = { dmg: 1, fireRate: 1 };

    function startWave() {
      wave++;
      const tanks = Math.floor(wave / 2);
      const fast = 3 + wave;
      for (let i = 0; i < fast; i++) setTimeout(() => !lost && spawnEnemy('fast'), i * 300);
      for (let i = 0; i < tanks; i++) setTimeout(() => !lost && spawnEnemy('tank'), i * 600 + 800);
      alive = fast + tanks;
      ctx.hud.toast(`🌊 الموجة ${wave}` + (wave > 1 ? ' — ترقية الأسلحة!' : ''), '#ff6b9d');
      if (wave > 1) { upgrades.dmg += .5; upgrades.fireRate += .15; }
    }

    ctx.hud.crosshair(true);
    ctx.hud.objective('🌊 صُدّ ٥ موجات · <span style="color:#4fc3f7">المسافة</span> ليزر · <span style="color:#ffb347">تفاعل/E</span> صاروخ');
    setTimeout(startWave, 900);

    const tmp = new THREE.Vector3();
    function fireLaser() {
      const m = lasers.get();
      m.position.copy(camera.position);
      camera.getWorldDirection(tmp);
      m.userData = { v: tmp.clone().multiplyScalar(60), life: 1.6, dmg: 1 * upgrades.dmg };
      AudioManager.shoot();
    }
    function fireRocket() {
      if (rocketCd > 0) return;
      rocketCd = 1.6;
      const m = rockets.get();
      m.position.copy(camera.position);
      camera.getWorldDirection(tmp);
      m.userData = { v: tmp.clone().multiplyScalar(38), life: 2.2, dmg: 4 * upgrades.dmg, rocket: true };
      AudioManager.rocket();
    }

    function explode(pos) {
      enemies.forEach(e => { if (e.g.position.distanceTo(pos) < 5) { e.hp -= 4 * upgrades.dmg; e.mesh.material.emissive.setHex(0xffffff); } });
      const fl = H.sphere(pos.x, pos.y, pos.z, .5, 0xffb347, { emissive: 0xffb347 });
      let s = 0; const grow = () => { s += .4; fl.scale.setScalar(1 + s); fl.material.opacity = Math.max(0, 1 - s / 5); fl.material.transparent = true; if (s < 5) requestAnimationFrame(grow); else scene.remove(fl); };
      grow();
    }

    return {
      update(dt) {
        if (won || lost) return;
        t += dt;
        c.update(dt);
        // keep drone above floor
        if (c.pos.y < 2) c.pos.y = 2;
        if (c.pos.y > 30) c.pos.y = 30;
        body.children.forEach((ch, i) => { if (i > 0) ch.rotation.y += dt * 20; });

        fireCd -= dt; rocketCd -= dt;
        if ((ctx.input.buttons.action || ctx.input.keys['Space']) && fireCd <= 0) { fireLaser(); fireCd = 0.12 / upgrades.fireRate; }
        if (ctx.input.consumeInteract()) fireRocket();

        // projectiles
        lasers.forEach(m => {
          m.position.addScaledVector(m.userData.v, dt); m.userData.life -= dt;
          for (const e of enemies) { if (m.position.distanceTo(e.g.position) < (e.type === 'tank' ? 1.6 : 1)) { e.hp -= m.userData.dmg; e.mesh.material.emissive.setHex(0xffffff); m.userData.life = 0; AudioManager.hit(); break; } }
          if (m.userData.life <= 0) { m.visible = false; lasers.release(m); }
        });
        rockets.forEach(m => {
          m.position.addScaledVector(m.userData.v, dt); m.userData.life -= dt; m.rotation.x += dt * 8;
          let hitE = null;
          for (const e of enemies) if (m.position.distanceTo(e.g.position) < 2) { hitE = e; break; }
          if (hitE || m.userData.life <= 0) {
            explode(m.position.clone()); m.visible = false; rockets.release(m);
          }
        });

        // enemies AI
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          e.mesh.rotation.x += dt; e.mesh.rotation.y += dt * 1.4;
          e.mesh.material.emissive.lerp(new THREE.Color(e.type === 'tank' ? 0x5a1015 : 0x5a4010), .12);
          const dir = tmp.set(c.pos.x - e.g.position.x, c.pos.y - e.g.position.y, c.pos.z - e.g.position.z);
          const d = dir.length(); dir.normalize();
          // keep some distance, orbit
          if (d > 8) e.g.position.addScaledVector(dir, e.speed * dt);
          else e.g.position.x += Math.cos(t + i) * dt * e.speed * .5;
          // enemy fire
          e.fire -= dt;
          if (e.fire <= 0 && d < 40) { e.fire = e.type === 'tank' ? 2.4 : 1.6; hp -= e.type === 'tank' ? 8 : 4; ctx.hud.toast('⚠ تضرر الدرون', '#ff5d6c'); AudioManager.hit(); }
          if (e.hp <= 0) { scene.remove(e.g); enemies.splice(i, 1); alive--; AudioManager.pickup(); }
        }

        if (hp <= 0) { lost = true; ctx.lose(`دُمّر الدرون في الموجة ${wave}.`); return; }

        if (alive <= 0 && enemies.length === 0) {
          if (wave >= 5) { won = true; ctx.win('نجوت من كل الموجات الخمس!'); return; }
          else if (!this._waiting) { this._waiting = true; setTimeout(() => { this._waiting = false; startWave(); }, 1800); }
        }

        ctx.hud.stats(`HP ${Math.max(0, hp | 0)}<br>WAVE ${wave}/5<br>ENEMIES ${enemies.length}<br>ROCKET ${rocketCd > 0 ? (rocketCd.toFixed(1)) : 'READY'}`);
      },
      dispose() { ctx.hud.crosshair(false); }
    };
  }
});
