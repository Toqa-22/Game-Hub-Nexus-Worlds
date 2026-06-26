/* ============================================================
   GAME 8 — ARENA BATTLE SIMULATOR (Medium)
   Third-person. Waves of enemies in an arena with lava hazards.
   Melee (Space, close range) + ranged bolt (E). Sprint to dodge.
   Survive 4 waves. Score tracking.
   ============================================================ */
GameHub.register({
  title: 'حلبة القتال',
  icon: '⚔️', color: '#ffb347', shape: 'diamond',
  diff: 'medium', diffLabel: 'متوسط',
  desc: 'قاتل موجات الأعداء بالسيف والسهام وتجنّب الحمم.',

  create(ctx) {
    const { THREE, scene, camera, H, Util, Pool } = ctx;
    scene.background = new THREE.Color(0x1a0e08);
    scene.fog = new THREE.FogExp2(0x1a0e08, 0.02);
    H.light();
    const fireL = new THREE.PointLight(0xff6622, 1.2, 50); fireL.position.set(0, 12, 0); scene.add(fireL);

    H.ground(50, 0x2a1a12, { roughness: 1 });
    // arena walls (circular-ish via boxes)
    const R = 16;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      H.addBox(Math.cos(a) * R, 2, Math.sin(a) * R, 3, 4, 3, 0x3a2a1a, { roughness: .9 });
    }
    // lava hazard pools
    const lavas = [];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + .4, r = 8;
      const lava = new THREE.Mesh(new THREE.CircleGeometry(2.6, 18), new THREE.MeshStandardMaterial({ color: 0xff4400, emissive: 0xcc2200 }));
      lava.rotation.x = -Math.PI / 2; lava.position.set(Math.cos(a) * r, .03, Math.sin(a) * r); scene.add(lava);
      lavas.push({ x: lava.position.x, z: lava.position.z, r: 2.6 });
    }

    // player
    const body = new THREE.Group();
    const torso = H.sphere(0, 1, 0, .5, 0x4fc3f7, { emissive: 0x1a5a7a }); torso.scale.set(.8, 1.2, .6); body.add(torso);
    const head = H.sphere(0, 1.9, 0, .3, 0xffd2a0); body.add(head);
    const sword = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.4, .1), new THREE.MeshStandardMaterial({ color: 0xddddff, emissive: 0x4444aa, metalness: .8 }));
    sword.position.set(.6, 1.2, .3); body.add(sword);
    scene.add(body);
    const c = ctx.makeController({ mode: 'tp', y: 1.2, speed: 6, sprintMul: 1.7, mesh: body, tpDist: 7, tpHeight: 3, bounds: { x: R - 2, z: R - 2 } });

    const bolts = new Pool(() => { const m = H.sphere(0, 0, 0, .15, 0x4fc3f7, { emissive: 0x4fc3f7 }); m.visible = false; return m; }, m => m.visible = true);

    const enemies = [];
    function spawnEnemy() {
      const a = Util.rand(0, 6.28), r = R - 3;
      const g = new THREE.Group();
      const b = H.sphere(0, 1, 0, .5, 0xff5d6c, { emissive: 0x5a1015 }); b.scale.set(.8, 1.1, .6); g.add(b);
      const h = H.sphere(0, 1.8, 0, .28, 0x8a3a3a); g.add(h);
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); scene.add(g);
      enemies.push({ g, body: b, hp: 3, speed: Util.rand(2.2, 3.6), atk: 0 });
    }

    let wave = 0, score = 0, hp = 100, meleeCd = 0, rangeCd = 0, won = false, lost = false, t = 0;

    function startWave() { wave++; const n = 2 + wave * 2; for (let i = 0; i < n; i++) setTimeout(() => !lost && spawnEnemy(), i * 350); ctx.hud.toast(`⚔️ الموجة ${wave}/4`, '#ffb347'); }

    ctx.hud.crosshair(false);
    ctx.hud.objective('⚔️ انجُ ٤ موجات · <span style="color:#4fc3f7">المسافة</span> ضربة سيف · <span style="color:#ffb347">E</span> سهم · <span>Shift</span> تفادي');
    setTimeout(startWave, 800);

    const tmp = new THREE.Vector3();

    return {
      update(dt) {
        if (won || lost) return;
        t += dt; c.update(dt);
        fireL.intensity = 1 + Math.sin(t * 8) * .3;

        meleeCd -= dt; rangeCd -= dt;
        // melee
        if ((ctx.input.keys['Space'] || ctx.input.buttons.action) && meleeCd <= 0) {
          meleeCd = .5; sword.rotation.x = -1.2; AudioManager.shoot();
          enemies.forEach(e => { if (e.g.position.distanceTo(c.pos) < 2.6) { e.hp -= 2; e.body.material.emissive.setHex(0xffffff); AudioManager.hit(); } });
        }
        sword.rotation.x = Util.lerp(sword.rotation.x, 0, dt * 6);
        // ranged
        if (ctx.input.consumeInteract() && rangeCd <= 0) {
          rangeCd = .35; const m = bolts.get(); m.position.copy(c.pos).setY(1.3);
          const dir = camera.getWorldDirection(tmp).clone(); m.userData = { v: dir.multiplyScalar(40), life: 1.4 }; AudioManager.shoot();
        }
        bolts.forEach(m => {
          m.position.addScaledVector(m.userData.v, dt); m.userData.life -= dt;
          for (const e of enemies) if (m.position.distanceTo(e.g.position.clone().setY(1)) < 1) { e.hp -= 2; e.body.material.emissive.setHex(0xffffff); m.userData.life = 0; AudioManager.hit(); break; }
          if (m.userData.life <= 0) { m.visible = false; bolts.release(m); }
        });

        // lava damage
        for (const l of lavas) if (Util.dist2(c.pos.x, c.pos.z, l.x, l.z) < l.r * l.r) { hp -= dt * 22; ctx.hud.flash(true); }
        if (!lavas.some(l => Util.dist2(c.pos.x, c.pos.z, l.x, l.z) < l.r * l.r)) ctx.hud.flash(false);

        // enemy AI
        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          e.body.material.emissive.lerp(new THREE.Color(0x5a1015), .12);
          const dir = tmp.set(c.pos.x - e.g.position.x, 0, c.pos.z - e.g.position.z); const d = dir.length(); dir.normalize();
          e.g.position.addScaledVector(dir, e.speed * dt); e.g.rotation.y = Math.atan2(dir.x, dir.z);
          e.g.position.y = Math.abs(Math.sin(t * 6 + i)) * .12;
          e.atk -= dt;
          if (d < 1.6 && e.atk <= 0) { e.atk = 1; hp -= 8; ctx.hud.toast('💥 -٨', '#ff5d6c'); AudioManager.hit(); }
          if (e.hp <= 0) { scene.remove(e.g); enemies.splice(i, 1); score += 100; AudioManager.pickup(); }
        }

        if (hp <= 0) { lost = true; ctx.lose(`سقطت في الموجة ${wave}. النقاط: ${score}`); return; }
        if (enemies.length === 0 && !this._w) {
          if (wave >= 4) { won = true; ctx.win(`انتصرت! النقاط النهائية: ${score}`); return; }
          this._w = true; setTimeout(() => { this._w = false; startWave(); }, 1500);
        }

        ctx.hud.stats(`HP ${hp | 0}<br>SCORE ${score}<br>WAVE ${wave}/4<br>ENEMIES ${enemies.length}`);
      },
      dispose() { ctx.hud.flash(false); }
    };
  }
});
