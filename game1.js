/* ============================================================
   GAME 1 — PARKOUR ESCAPE CITY (Medium)
   FP movement, jump across platforms, sprint+stamina,
   moving platforms, a chaser AI, checkpoints, fall = respawn.
   Goal: reach the glowing exit gate.
   ============================================================ */
GameHub.register({
  title: 'هروب باركور المدينة',
  icon: '🏃', color: '#4fc3f7', shape: 'cube',
  diff: 'medium', diffLabel: 'متوسط',
  desc: 'اقفز فوق المنصات، تجنّب المُطارِد، وابلغ البوابة.',

  create(ctx) {
    const { THREE, scene, camera, H, Util } = ctx;
    scene.background = new THREE.Color(0x141a2e);
    scene.fog = new THREE.FogExp2(0x141a2e, 0.018);
    H.light();
    const moon = new THREE.PointLight(0x88aaff, 1.1, 120); moon.position.set(0, 40, -20); scene.add(moon);

    H.ground(160, 0x0c1020, { roughness: 1 });

    // ---- build a path of rooftops/platforms ----
    const platforms = [];
    const movers = [];
    let z = 0, y = 0, x = 0;
    const cps = []; // checkpoints
    const colors = [0x2a3550, 0x33405f, 0x3a4a6e];
    for (let i = 0; i < 16; i++) {
      const w = Util.rand(4, 6), d = Util.rand(4, 6);
      const top = y + 0.5;
      const p = H.addBox(x, y, z, w, 1, d, Util.pick(colors), { roughness: .8 });
      platforms.push({ mesh: p, top });
      // neon edge
      const edge = new THREE.Mesh(new THREE.BoxGeometry(w + .2, .12, d + .2),
        new THREE.MeshBasicMaterial({ color: 0x4fc3f7 }));
      edge.position.set(x, top + .06, z); scene.add(edge);

      if (i % 4 === 0) cps.push(new THREE.Vector3(x, top + 1.7, z));

      // moving platform every few steps
      if (i > 2 && i % 3 === 0) {
        const mp = H.addBox(x, y, z - 4, 3, .6, 3, 0xffb347, { roughness: .6 });
        movers.push({ mesh: mp, base: mp.position.clone(), axis: i % 2 ? 'x' : 'z', amp: 3, sp: Util.rand(.6, 1.1), ph: Util.rand(0, 6),
          col: { min: new THREE.Vector3(), max: new THREE.Vector3() } });
      }

      // next step
      z -= Util.rand(6, 8);
      x += Util.rand(-4, 4);
      y += Util.rand(-1, 2.2);
      y = Util.clamp(y, 0, 14);
    }

    // exit gate
    const gate = new THREE.Mesh(new THREE.TorusGeometry(1.6, .3, 10, 24),
      new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x1a7a3a, metalness: .6 }));
    gate.position.set(x, y + 2, z); scene.add(gate);
    const gateLight = new THREE.PointLight(0x5ef38c, 2, 14); gateLight.position.copy(gate.position); scene.add(gate, gateLight);
    const exitPos = new THREE.Vector3(x, y + 1.7, z);

    // background city blocks (non-solid, atmosphere)
    for (let i = 0; i < 50; i++) {
      const bh = Util.rand(6, 26);
      const b = H.addBox(Util.rand(-70, 70), bh / 2, Util.rand(-100, 30), Util.rand(4, 9), bh, Util.rand(4, 9),
        0x10162c, { solid: false, roughness: 1 });
      if (Math.random() < .5) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(.4, .4, .05),
          new THREE.MeshBasicMaterial({ color: Util.pick([0xffcc66, 0x66ccff]) }));
        win.position.set(b.position.x, Util.rand(2, bh - 1), b.position.z + b.geometry.parameters.depth / 2 + .03);
        scene.add(win);
      }
    }

    // ---- controller (FP) ----
    const c = ctx.makeController({ mode: 'fp', x: 0, y: 1.7, z: 0, speed: 6.4, sprintMul: 1.8, jumpV: 9.2 });
    let spawn = cps[0].clone();

    // ---- chaser AI ----
    const chaser = H.sphere(0, 1.2, 18, .9, 0xff5d6c, { emissive: 0x7a1020, roughness: .4 });
    const chEye = H.sphere(0, 0, 0, .25, 0xffffff, { emissive: 0xffffff }); chaser.add(chEye); chEye.position.set(0, .2, .8);
    let stamina = 100;

    ctx.hud.crosshair(true);
    ctx.hud.objective('🎯 اقفز عبر المنصات وابلغ <b style="color:#5ef38c">البوابة الخضراء</b>');
    ctx.hud.hint('<span class="keycap">المسافة</span> قفز · <span class="keycap">Shift</span> ركض · السقوط يعيدك لآخر نقطة');
    setTimeout(() => ctx.hud.hint(''), 5200);

    let won = false, lost = false, t = 0;

    function respawn() {
      c.pos.copy(spawn); c.vel.set(0, 0, 0);
      ctx.hud.toast('↺ نقطة تفتيش', '#4fc3f7');
    }

    return {
      update(dt) {
        if (won || lost) return;
        t += dt;

        // update movers + their colliders
        movers.forEach(m => {
          const o = Math.sin(t * m.sp + m.ph) * m.amp;
          if (m.axis === 'x') m.mesh.position.x = m.base.x + o; else m.mesh.position.z = m.base.z + o;
          // sync collider (last colliders pushed for addBox are in ctx.colliders; we move via direct find)
        });

        // stamina
        const sprinting = (ctx.input.buttons.alt) && (Math.abs(ctx.input.move.x) + Math.abs(ctx.input.move.y) > 0);
        if (sprinting && stamina > 0) stamina -= dt * 28; else stamina = Math.min(100, stamina + dt * 18);
        c.sprintMul = stamina > 5 ? 1.85 : 1.0;

        c.update(dt);

        // landing on moving platforms (manual top check)
        movers.forEach(m => {
          const mp = m.mesh.position, g = m.mesh.geometry.parameters;
          if (Math.abs(c.pos.x - mp.x) < g.width / 2 + .4 && Math.abs(c.pos.z - mp.z) < g.depth / 2 + .4) {
            const top = mp.y + g.height / 2 + c.height / 2;
            if (c.pos.y <= top + .3 && c.pos.y >= top - .6 && c.vel.y <= 0) {
              c.pos.y = top; c.vel.y = 0; c.grounded = true;
            }
          }
        });

        // platform-top landing (so player can stand on tops, since AABB blocks sides)
        platforms.forEach(p => {
          const g = p.mesh.geometry.parameters, pp = p.mesh.position;
          if (Math.abs(c.pos.x - pp.x) < g.width / 2 && Math.abs(c.pos.z - pp.z) < g.depth / 2) {
            const top = p.top + c.height / 2;
            if (c.pos.y <= top + .25 && c.pos.y >= top - 1 && c.vel.y <= 0) {
              c.pos.y = top; c.vel.y = 0; c.grounded = true;
            }
          }
        });

        // checkpoints
        cps.forEach(cp => { if (Util.dist2(c.pos.x, c.pos.z, cp.x, cp.z) < 6 && c.pos.y > cp.y - 2) { if (spawn.distanceTo(cp) > 1) { spawn = cp.clone(); ctx.hud.toast('🚩 نقطة تفتيش', '#5ef38c'); } } });

        // fall = respawn
        if (c.pos.y < -6) respawn();

        // chaser seeks player
        const dir = new THREE.Vector3(c.pos.x - chaser.position.x, 0, c.pos.z - chaser.position.z);
        const d = dir.length();
        if (d > 0.1) { dir.normalize(); chaser.position.addScaledVector(dir, dt * 4.2); }
        chaser.position.y = 1.2 + Math.sin(t * 4) * .15;
        chaser.lookAt(c.pos.x, 1.2, c.pos.z);
        if (d < 1.3) { lost = true; ctx.lose('أمسك بك المُطارِد! حاول أن تكون أسرع.'); return; }

        gate.rotation.z += dt; gateLight.intensity = 1.6 + Math.sin(t * 3) * .5;

        // win
        if (Util.dist2(c.pos.x, c.pos.z, exitPos.x, exitPos.z) < 5 && Math.abs(c.pos.y - exitPos.y) < 3) {
          won = true; ctx.win('وصلت للبوابة وهربت من المدينة!'); return;
        }

        // HUD
        const dToGate = Math.sqrt(Util.dist2(c.pos.x, c.pos.z, exitPos.x, exitPos.z)) | 0;
        ctx.hud.stats(`STAMINA ${stamina | 0}%<br>GATE ${dToGate}m`);
      },
      dispose() { ctx.hud.crosshair(false); }
    };
  }
});
