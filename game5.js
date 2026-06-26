/* ============================================================
   GAME 5 — NEON DRIFT RACING (Easy-Medium)
   Third-person car with drift physics, checkpoint laps,
   boost pads, neon cyberpunk track. Beat the timer / finish laps.
   Controls: W accel, S brake/reverse, A/D steer, Space/handbrake drift.
   ============================================================ */
GameHub.register({
  title: 'سباق النيون',
  icon: '🚗', color: '#c77dff', shape: 'diamond',
  diff: 'easy', diffLabel: 'سهل-متوسط',
  desc: 'انجرف عبر حلبة نيون، اجمع نقاط التفتيش، أنهِ اللفات.',

  create(ctx) {
    const { THREE, scene, camera, H, Util } = ctx;
    scene.background = new THREE.Color(0x0a0a1e);
    scene.fog = new THREE.FogExp2(0x0a0a1e, 0.014);
    H.light();
    H.ground(300, 0x0c0c1c, { roughness: 1 });
    const grid = new THREE.GridHelper(300, 100, 0xc77dff, 0x1a1a3a); grid.material.opacity = .35; grid.material.transparent = true; scene.add(grid);

    // oval-ish track via checkpoints (waypoints)
    const wps = [
      [0, -40], [30, -36], [44, -16], [44, 16], [30, 36], [0, 40], [-30, 36], [-44, 16], [-44, -16], [-30, -36]
    ].map(([x, z]) => new THREE.Vector3(x, 0, z));

    // track ribbon (visual) + neon posts as checkpoints
    const checkpoints = [];
    wps.forEach((w, i) => {
      const post = new THREE.Mesh(new THREE.TorusGeometry(3.5, .2, 8, 20), new THREE.MeshStandardMaterial({ color: i === 0 ? 0x5ef38c : 0xc77dff, emissive: i === 0 ? 0x1a7a3a : 0x4a1a7a }));
      post.position.copy(w).setY(2.5); post.rotation.y = Math.atan2(wps[(i + 1) % wps.length].x - w.x, wps[(i + 1) % wps.length].z - w.z);
      scene.add(post); checkpoints.push({ pos: w.clone(), mesh: post });
      const light = new THREE.PointLight(0xc77dff, .8, 16); light.position.copy(w).setY(3); scene.add(light);
    });
    // boost pads (between some waypoints)
    const boosts = [];
    [1, 4, 7].forEach(i => {
      const a = wps[i], b = wps[(i + 1) % wps.length], mid = a.clone().lerp(b, .5);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), new THREE.MeshStandardMaterial({ color: 0x5ef38c, emissive: 0x2a8a4a, transparent: true, opacity: .8 }));
      pad.rotation.x = -Math.PI / 2; pad.position.copy(mid).setY(.05); scene.add(pad);
      boosts.push(mid);
    });

    // car
    const car = new THREE.Group();
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.6, .5, 3), new THREE.MeshStandardMaterial({ color: 0xc77dff, emissive: 0x3a1a5a, metalness: .6, roughness: .3 })); chassis.position.y = .5; chassis.castShadow = true; car.add(chassis);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.3, .5, 1.4), new THREE.MeshStandardMaterial({ color: 0x222244, metalness: .5 })); cabin.position.set(0, .95, -.2); car.add(cabin);
    [[-.9, -1.1], [.9, -1.1], [-.9, 1.1], [.9, 1.1]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .3, 12), new THREE.MeshStandardMaterial({ color: 0x111122 })); w.rotation.z = Math.PI / 2; w.position.set(x, .4, z); car.add(w); });
    const glow = new THREE.PointLight(0xc77dff, 1, 8); glow.position.set(0, .5, 0); car.add(glow);
    car.position.set(0, 0, -40); scene.add(car);

    // car physics state
    let speed = 0, heading = 0, drift = 0;
    let nextCp = 1, lap = 0, totalLaps = 2, won = false, lost = false, t = 0, raceTime = 0;
    const TIME_LIMIT = 75;

    ctx.hud.crosshair(false);
    ctx.hud.objective(`🏁 أكمل <b>${totalLaps}</b> لفّة عبر الحلقات · مرّ بها بالترتيب · خط أخضر = البداية`);
    ctx.hud.hint('<span class="keycap">W</span> تسارع · <span class="keycap">A/D</span> توجيه · <span class="keycap">Space</span> انجراف');
    setTimeout(() => ctx.hud.hint(''), 5000);

    return {
      update(dt) {
        if (won || lost) return;
        t += dt; raceTime += dt;
        // input
        const accel = (ctx.input.keys['KeyW'] || ctx.input.move.y < -.3) ? 1 : 0;
        const brake = (ctx.input.keys['KeyS'] || ctx.input.move.y > .3) ? 1 : 0;
        let steer = 0;
        if (ctx.input.keys['KeyA'] || ctx.input.move.x < -.3) steer += 1;
        if (ctx.input.keys['KeyD'] || ctx.input.move.x > .3) steer -= 1;
        const handbrake = ctx.input.buttons.action || ctx.input.keys['Space'];

        // physics
        const maxSpeed = 32;
        speed += accel * 26 * dt - brake * 30 * dt;
        speed -= speed * 0.6 * dt; // drag
        speed = Util.clamp(speed, -10, maxSpeed);
        const steerAmt = steer * (1.6 + (handbrake ? 1.4 : 0)) * Util.clamp(Math.abs(speed) / 8, 0, 1);
        heading += steerAmt * dt;
        // drift visual offset
        drift = Util.lerp(drift, handbrake && Math.abs(speed) > 8 ? steer * .5 : 0, dt * 4);

        car.position.x += Math.sin(heading) * speed * dt;
        car.position.z += Math.cos(heading) * speed * dt;
        car.rotation.y = heading + drift;
        car.position.x = Util.clamp(car.position.x, -70, 70); car.position.z = Util.clamp(car.position.z, -70, 70);

        // chase camera
        const camOff = new THREE.Vector3(-Math.sin(heading) * 9, 5, -Math.cos(heading) * 9);
        camera.position.lerp(car.position.clone().add(camOff), Util.clamp(dt * 5, 0, 1));
        camera.lookAt(car.position.x + Math.sin(heading) * 6, car.position.y + 1, car.position.z + Math.cos(heading) * 6);

        // boost pads
        boosts.forEach(b => { if (Util.dist2(car.position.x, car.position.z, b.x, b.z) < 9) { speed = Math.min(maxSpeed * 1.5, speed + 18 * dt); ctx.hud.flash(false); } });

        // checkpoints
        checkpoints.forEach(cp => cp.mesh.rotation.z += dt * 2);
        const cp = checkpoints[nextCp];
        if (Util.dist2(car.position.x, car.position.z, cp.pos.x, cp.pos.z) < 16) {
          cp.mesh.material.emissive.setHex(0x5ef38c); AudioManager.pickup();
          nextCp = (nextCp + 1) % checkpoints.length;
          if (nextCp === 1) { // passed start line
            lap++; ctx.hud.toast(`🏁 لفّة ${lap}/${totalLaps}`, '#c77dff');
            if (lap >= totalLaps) { won = true; ctx.win(`أنهيت السباق في ${raceTime.toFixed(1)} ثانية!`); return; }
          }
        }

        if (raceTime >= TIME_LIMIT) { lost = true; ctx.lose('انتهى الوقت! حاول أن تكون أسرع.'); return; }

        ctx.hud.stats(`SPEED ${Math.abs(speed * 6) | 0} km/h<br>LAP ${lap}/${totalLaps}<br>CP ${nextCp}/${checkpoints.length}<br>TIME ${(TIME_LIMIT - raceTime).toFixed(0)}s`);
      },
      dispose() {}
    };
  }
});
