/* ============================================================
   GAME 9 — GRAVITY SHIFT CHALLENGE (Hard)
   FP platformer. Press E to flip gravity (up/down). Navigate
   platforms on floor AND ceiling to reach the exit. Timed
   gravity zones that auto-flip you. Fall off = restart checkpoint.
   ============================================================ */
GameHub.register({
  title: 'تحدي الجاذبية',
  icon: '🌀', color: '#c77dff', shape: 'ring',
  diff: 'hard', diffLabel: 'صعب',
  desc: 'اقلب الجاذبية بين الأرض والسقف لتصل إلى المخرج.',

  create(ctx) {
    const { THREE, scene, camera, H, Util } = ctx;
    scene.background = new THREE.Color(0x140a24);
    scene.fog = new THREE.FogExp2(0x140a24, 0.022);
    H.light();
    const p1 = new THREE.PointLight(0xc77dff, 1, 60); p1.position.set(0, 8, -10); scene.add(p1);

    const CEIL = 12;
    H.ground(120, 0x1a1030, { roughness: 1 });           // floor
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), H.mat(0x1a1030, { roughness: 1 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = CEIL; scene.add(ceil);

    // platforms alternate floor/ceiling along a corridor
    const plats = [];
    let z = 0;
    const cps = [new THREE.Vector3(0, 1.7, 0)];
    for (let i = 0; i < 12; i++) {
      const onCeil = i % 2 === 1;
      const y = onCeil ? CEIL - 0.5 : 0.5;
      const x = Util.rand(-3, 3);
      const p = H.addBox(x, y, z, 4, 1, 4, onCeil ? 0x5a3a8a : 0x3a2a6a, { solid: false });
      const edge = new THREE.Mesh(new THREE.BoxGeometry(4.2, .1, 4.2), new THREE.MeshBasicMaterial({ color: 0xc77dff }));
      edge.position.set(x, onCeil ? y - .55 : y + .55, z); scene.add(edge);
      plats.push({ x, y, z, onCeil, top: onCeil ? y - 0.5 : y + 0.5 });
      if (i % 3 === 0) cps.push(new THREE.Vector3(x, (onCeil ? y - 0.5 : y + 0.5) + (onCeil ? -1.7 : 1.7) * 0, 1.7, z));
      z -= 7;
    }
    // exit
    const exit = new THREE.Mesh(new THREE.TorusGeometry(1.4, .25, 10, 20), new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x1a7a3a }));
    exit.position.set(plats[plats.length - 1].x, plats[plats.length - 1].top + 1.4, z + 7); scene.add(exit);
    const exitPos = exit.position.clone();

    const c = ctx.makeController({ mode: 'fp', y: 1.7, z: 0, speed: 5.5, jumpV: 8, gravity: 26 });
    let spawn = new THREE.Vector3(0, 1.7, 0);

    let won = false, t = 0, flips = 0;

    ctx.hud.crosshair(true);
    ctx.hud.objective('🌀 اضغط <span style="color:#c77dff">E</span> لقلب الجاذبية · انتقل بين الأرض والسقف · صِل للحلقة الخضراء');
    ctx.hud.hint('<span class="keycap">E</span> اقلب الجاذبية · <span class="keycap">المسافة</span> قفز');
    setTimeout(() => ctx.hud.hint(''), 6000);

    function respawn() { c.pos.copy(spawn); c.vel.set(0, 0, 0); c.gravityDir = -1; ctx.hud.toast('↺ إعادة', '#c77dff'); }

    return {
      update(dt) {
        if (won) return;
        t += dt;

        // flip gravity
        if (ctx.input.consumeInteract()) {
          c.gravityDir *= -1; flips++; AudioManager.confirm();
          ctx.hud.toast(c.gravityDir < 0 ? '⬇ جاذبية للأسفل' : '⬆ جاذبية للأعلى', '#c77dff');
        }

        c.update(dt);

        // custom floor/ceiling clamp based on gravity dir
        if (c.gravityDir < 0) { // normal
          if (c.pos.y < c.height / 2) { c.pos.y = c.height / 2; c.vel.y = 0; c.grounded = true; }
        } else { // inverted -> stick to ceiling
          if (c.pos.y > CEIL - c.height / 2) { c.pos.y = CEIL - c.height / 2; c.vel.y = 0; c.grounded = true; }
        }

        // platform landing (both faces)
        plats.forEach(p => {
          if (Math.abs(c.pos.x - p.x) < 2.2 && Math.abs(c.pos.z - p.z) < 2.2) {
            if (c.gravityDir < 0) { // land on floor-platform top
              const top = p.top + c.height / 2;
              if (!p.onCeil && c.pos.y <= top + .3 && c.pos.y >= top - 1 && c.vel.y <= 0) { c.pos.y = top; c.vel.y = 0; c.grounded = true; }
            } else { // land on ceiling-platform underside
              const bot = p.top - c.height / 2;
              if (p.onCeil && c.pos.y >= bot - .3 && c.pos.y <= bot + 1 && c.vel.y >= 0) { c.pos.y = bot; c.vel.y = 0; c.grounded = true; }
            }
          }
        });

        // checkpoints (progress by z)
        cps.forEach(cp => { if (cp.isVector3 && Math.abs(c.pos.z - cp.z) < 2 && Util.dist2(c.pos.x, 0, cp.x, 0) < 6) { if (spawn.z !== cp.z) { spawn.copy(cp); spawn.y = c.pos.y; ctx.hud.toast('🚩 نقطة', '#5ef38c'); } } });

        // fell out of band
        if (c.pos.y < -4 || c.pos.y > CEIL + 4) respawn();

        exit.rotation.z += dt * 2;
        if (c.pos.distanceTo(exitPos) < 2.6) { won = true; ctx.win(`وصلت للمخرج بعد ${flips} قلبة!`); return; }

        ctx.hud.stats(`GRAVITY ${c.gravityDir < 0 ? '⬇' : '⬆'}<br>FLIPS ${flips}<br>DIST ${(c.pos.distanceTo(exitPos)) | 0}m`);
      },
      dispose() { ctx.hud.crosshair(false); }
    };
  }
});
