/* ============================================================
   GAME 10 — الدهليز: مهرب الرعب  (HORROR ESCAPE)
   Showcases: 🎥 cinematic cutscenes · 🧠 AI voice narration
   🧩 randomized puzzle · 🏆 multiple endings · clear player role
   ------------------------------------------------------------
   You are المحقق نور (Inspector Noor). Trapped in an abandoned
   crypt. Find 3 glowing relic shards (randomized each run) to
   unseal the gate and escape — while THE ENTITY hunts you.
   ============================================================ */
GameHub.register({
  title: 'الدهليز: مهرب الرعب',
  icon: '👁️',
  color: '#c77dff',
  shape: 'pyramid',
  diff: 'very-hard',
  diffLabel: 'صعب جداً',
  desc: 'محقق عالق في قبو مظلم. اجمع 3 شظايا مضيئة وافتح البوابة قبل أن يمسك بك الكيان.',

  create(ctx) {
    const { THREE, scene, camera, H, Util, hud, audio, input, narrator } = ctx;
    const cine = ctx.makeCinematic();

    // ---- atmosphere: heavy darkness + fog ----
    scene.background = new THREE.Color(0x04040a);
    scene.fog = new THREE.FogExp2(0x05050c, 0.085);
    const amb = new THREE.AmbientLight(0x222233, 0.35); scene.add(amb);
    const moon = new THREE.DirectionalLight(0x445588, 0.18);
    moon.position.set(6, 18, -4); scene.add(moon);

    const HALL = 46, WALL_H = 7, half = HALL / 2;
    H.ground(HALL + 8, 0x111118, { roughness: 1 });
    // ceiling (non-solid visual)
    H.addBox(0, WALL_H, 0, HALL, 0.4, HALL, 0x0a0a12, { solid: false, roughness: 1 });
    // outer walls
    H.addBox(0, WALL_H / 2, -half, HALL, WALL_H, 0.8, 0x14141d);
    H.addBox(0, WALL_H / 2, half, HALL, WALL_H, 0.8, 0x14141d);
    H.addBox(-half, WALL_H / 2, 0, 0.8, WALL_H, HALL, 0x14141d);
    H.addBox(half, WALL_H / 2, 0, 0.8, WALL_H, HALL, 0x14141d);

    // interior pillars + partial walls for cover / navigation
    const pillarSpots = [
      [-12, -12], [12, -12], [-12, 12], [12, 12],
      [0, -6], [0, 6], [-16, 0], [16, 0],
    ];
    pillarSpots.forEach(([x, z]) => H.cyl(x, WALL_H / 2, z, 0.9, 1.1, WALL_H, 0x191922, { seg: 7 }));
    // a few short divider walls
    H.addBox(-6, 1.6, -16, 0.6, 3.2, 12, 0x16161f);
    H.addBox(6, 1.6, 16, 0.6, 3.2, 12, 0x16161f);
    H.addBox(-16, 1.6, 8, 10, 3.2, 0.6, 0x16161f);

    // dim braziers (point lights) for eerie pools of light
    const braziers = [];
    [[-14, -14, 0x6a3d1a], [14, 14, 0x6a3d1a], [14, -14, 0x3d2a6a], [-14, 14, 0x3d2a6a]].forEach(([x, z, c]) => {
      const pl = new THREE.PointLight(c, 0.9, 16, 2); pl.position.set(x, 3.2, z); scene.add(pl);
      H.cyl(x, 1.1, z, 0.35, 0.5, 2.2, 0x0d0d12, { seg: 6 });
      braziers.push(pl);
    });

    // ---- the sealed gate (exit) ----
    const gateX = 0, gateZ = half - 0.6;
    const gate = new THREE.Group();
    const gMat = new THREE.MeshStandardMaterial({ color: 0x2a2030, emissive: 0x140a1e, roughness: 0.7, metalness: 0.3 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(5, 5.4, 0.5), gMat);
    door.position.set(0, 2.7, 0); gate.add(door);
    // glowing seal runes
    const seal = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.18, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0x6a2a8a, emissive: 0x5a1a8a, emissiveIntensity: 1.2 }));
    seal.position.set(0, 2.9, 0.3); gate.add(seal);
    const sealLight = new THREE.PointLight(0xaa44ff, 1.2, 9, 2); sealLight.position.set(0, 2.9, 0.6); gate.add(sealLight);
    gate.position.set(gateX, 0, gateZ); scene.add(gate);

    // ---- 🧩 RANDOMIZED PUZZLE: 3 shards from a candidate pool ----
    const candidates = [
      [-17, -17], [17, -10], [-9, 16], [16, 6],
      [-18, 9], [3, -18], [10, 17], [-3, -3], [18, -18],
    ];
    // shuffle + take 3 (random each run)
    const shuffled = candidates.slice();
    for (let i = shuffled.length - 1; i > 0; i--) { const j = Util.randi(0, i);[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    const shardSpots = shuffled.slice(0, 3);

    const shards = [];
    shardSpots.forEach(([x, z]) => {
      const g = new THREE.Group();
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.45),
        new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x39c6ff, emissiveIntensity: 1.6, roughness: 0.2 }));
      crystal.position.y = 1.2; g.add(crystal);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 18),
        new THREE.MeshStandardMaterial({ color: 0x39c6ff, emissive: 0x39c6ff, emissiveIntensity: 1.2 }));
      halo.position.y = 1.2; halo.rotation.x = Math.PI / 2; g.add(halo);
      const beacon = new THREE.PointLight(0x4fc3ff, 1.4, 7, 2); beacon.position.y = 1.4; g.add(beacon);
      // tall faint guide beam so the player can spot it from afar with the flashlight
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0x4fc3ff, transparent: true, opacity: 0.18 }));
      beam.position.y = 3.4; g.add(beam);
      g.position.set(x, 0, z); scene.add(g);
      shards.push({ grp: g, crystal, halo, x, z, taken: false });
    });

    // ---- 👁️ THE ENTITY (monster) ----
    const mon = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 7),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x110011, roughness: 1 }));
    body.position.y = 1.2; mon.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 7),
      new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 1 }));
    head.position.y = 2.5; mon.add(head);
    // glowing eyes
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 2 });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat); eyeL.position.set(-0.14, 2.55, 0.36); mon.add(eyeL);
    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat); eyeR.position.set(0.14, 2.55, 0.36); mon.add(eyeR);
    const monGlow = new THREE.PointLight(0xff1133, 0.0, 6, 2); monGlow.position.y = 2.5; mon.add(monGlow);
    mon.position.set(0, 0, -half + 4); scene.add(mon);

    const monWaypoints = [[-15, -15], [15, -15], [15, 15], [-15, 15], [0, 0]];
    let monWP = 0;

    // ---- 🔦 flashlight ----
    const spot = new THREE.SpotLight(0xfff4d6, 0, 26, Math.PI / 7, 0.45, 1.4);
    spot.castShadow = false; scene.add(spot); scene.add(spot.target);
    let flashOn = true, battery = 100, flicker = 0;

    // ---- player controller (FP) — you ARE Inspector Noor ----
    const ctrl = ctx.makeController({ mode: 'fp', speed: 4.0, sprintMul: 1.85, height: 1.7, jumpV: 0 });
    ctrl.pos.set(0, 0.85, -half + 4.5); ctrl.yaw = 0;
    let health = 100, stamina = 100, hits = 0, hurtCD = 0;

    // ---- relabel mobile buttons to make the role clear ----
    const btnJump = document.getElementById('btnJump');
    const btnInt = document.getElementById('btnInteract');
    const btnAlt = document.getElementById('btnAlt');
    const btnAct = document.getElementById('btnAction');
    const orig = { jump: btnJump && btnJump.innerHTML, int: btnInt && btnInt.innerHTML, alt: btnAlt && btnAlt.innerHTML, act: btnAct && btnAct.style.display };
    if (btnJump) btnJump.innerHTML = '🔦';
    if (btnInt) btnInt.innerHTML = '✋<br>التقاط';
    if (btnAlt) btnAlt.innerHTML = '🏃<br>ركض';
    if (btnAct) btnAct.style.display = 'none';
    ctx.addCleanup(() => {
      if (btnJump) btnJump.innerHTML = orig.jump;
      if (btnInt) btnInt.innerHTML = orig.int;
      if (btnAlt) btnAlt.innerHTML = orig.alt;
      if (btnAct) btnAct.style.display = orig.act || '';
    });

    // ---- HUD ----
    hud.crosshair(true);
    hud.objective('🎬 ...المشهد الافتتاحي');
    const drawStats = () => {
      const took = shards.filter(s => s.taken).length;
      hud.stats(
        `❤️ الصحة: <b style="color:${health > 60 ? '#7CFFB0' : health > 30 ? '#ffb347' : '#ff5555'}">${Math.max(0, Math.round(health))}</b>` +
        ` &nbsp;|&nbsp; 💠 الشظايا: <b style="color:#4fc3ff">${took}/3</b>` +
        ` &nbsp;|&nbsp; 🔦 البطارية: <b style="color:${battery > 25 ? '#dfe9ff' : '#ff5555'}">${Math.round(battery)}%</b>`
      );
    };

    // ============================================================
    //  🎥 OPENING CUTSCENE  +  🧠 AI VOICE NARRATION
    // ============================================================
    let phase = 'intro'; // intro -> play -> ending
    let ended = false;
    flashOn = false; spot.intensity = 0;

    cine.play([
      { pos: [0, 5, -half + 1], look: [0, 3, 0], dur: 4.2,
        say: 'أنتَ المحقق نور. تتبّعتَ الأنفاسَ المفقودة إلى هذا الدهليز المهجور.' },
      { pos: [-10, 3, -6], look: [gateX, 2.9, gateZ], dur: 4.0,
        say: 'البوابةُ مختومةٌ بتعويذةٍ قديمة. لن تُفتح إلا بثلاثِ شظايا مضيئة.' },
      { pos: [8, 2.6, 6], look: [mon.position.x, 2.4, mon.position.z], dur: 3.8, sfx: 'scare',
        say: 'لكنّك لستَ وحدك... شيءٌ يسكنُ الظلام، ويتبعُ ضوءَك. اجمع الشظايا الثلاث، ثم اهرب.' },
    ], () => {
      // hand control to the player
      phase = 'play';
      flashOn = true;
      camera.position.copy(ctrl.pos);
      hud.objective('💠 اعثر على 3 شظايا مضيئة، ثم توجّه إلى <b>البوابة المختومة</b>');
      const el = document.getElementById('hudObjective'); el && el.classList.add('obj-pulse');
      hud.hint('<span class="keycap">F</span> الكشّاف · <span class="keycap">E</span> التقاط · <span class="keycap">Shift</span> ركض · تتبّع الأعمدة الزرقاء');
      audio.ambient && audio.ambient([40, 55, 73]);
      narrator.say('ابدأ البحث. تتبّع الوهجَ الأزرق... وأبقِ الكشّافَ مضيئاً، لكن احذر أن يراك.');
      drawStats();
    });

    // ---- helpers ----
    const fwd = new THREE.Vector3();
    let scareTimer = Util.rand(8, 14);

    function triggerScare() {
      audio.scare && audio.scare();
      hud.flash(true); setTimeout(() => hud.flash(false), 220);
      braziers.forEach(b => { const o = b.intensity; b.intensity = 0; setTimeout(() => b.intensity = o, 120); });
      narrator.say(Util.pick([
        'هل سمعتَ ذلك؟', 'إنه قريب...', 'لا تلتفت.', 'الظلامُ يتنفّس.',
      ]));
    }

    function endGame(kind) {
      if (ended) return;
      ended = true;
      phase = 'ending';
      input.reset();
      spot.intensity = 0; flashOn = false;
      // 🏆 MULTIPLE ENDINGS — each with its own cutscene + narration
      if (kind === 'death') {
        cine.play([
          { pos: [mon.position.x, 2.5, mon.position.z], look: [ctrl.pos.x, 1.4, ctrl.pos.z], dur: 2.6, sfx: 'scare',
            say: 'الكيانُ أمسكَ بك. ابتلعَكَ الظلام...' },
        ], () => ctx.lose('لم تنجُ من الدهليز. لقد ابتلعك الكيان قبل أن تكمل التعويذة.', '💀 الظلام يبتلعك'));
      } else if (kind === 'perfect') {
        cine.play([
          { pos: [gateX, 3, gateZ - 4], look: [gateX, 2.9, gateZ], dur: 3.2, sfx: 'win',
            say: 'انفتحت البوابة. خرجتَ سالماً تماماً، حاملاً الشظايا الثلاث. لقد تغلّبتَ على الدهليز.' },
        ], () => ctx.win('نجاةٌ مثالية! خرجتَ دون أن يمسّك الكيان. أنتَ محقّقٌ أسطوري.', '🏆 النجاة الكاملة'));
      } else { // narrow
        cine.play([
          { pos: [gateX, 3, gateZ - 4], look: [gateX, 2.9, gateZ], dur: 3.2, sfx: 'win',
            say: 'انفتحت البوابة بالكاد. خرجتَ مثخناً بالجراح، لكنّك خرجتَ حيّاً.' },
        ], () => ctx.win('نجاةٌ بأعجوبة! جراحُك عميقة، لكنّك هربتَ من الكيان وأكملتَ التعويذة.', '🩸 نجاة بأعجوبة'));
      }
    }

    // ============================================================
    //  UPDATE LOOP
    // ============================================================
    function update(dt) {
      // during any cutscene (intro OR ending), the director drives the camera
      if (cine.active) { cine.update(dt); return; }
      if (phase !== 'play') return;

      // --- stamina gates sprint ---
      if (input.buttons.alt && stamina > 0) { stamina = Math.max(0, stamina - dt * 28); }
      else { stamina = Math.min(100, stamina + dt * 16); }
      if (stamina <= 0) input.buttons.alt = false; // exhausted → can't sprint this frame

      ctrl.update(dt);
      camera.position.copy(ctrl.pos);

      // --- 🔦 flashlight toggle (F / 🔦 button) ---
      if (input.justKey('KeyF') || input.justBtn('jump')) { flashOn = !flashOn; audio.ui && audio.ui(); }
      if (battery <= 0) flashOn = false;
      if (flashOn) { battery = Math.max(0, battery - dt * 3.2); } else { battery = Math.min(100, battery + dt * 1.4); }

      camera.getWorldDirection(fwd);
      spot.position.copy(camera.position);
      spot.target.position.copy(camera.position).addScaledVector(fwd, 8);
      // flicker when battery low
      let targetI = 0;
      if (flashOn) {
        targetI = battery < 25 ? (Math.random() < 0.12 ? 0 : 2.4) : 2.4;
      }
      spot.intensity += (targetI - spot.intensity) * Math.min(1, dt * 14);

      // --- animate shards + 💠 pickup (clear, glowing, not "just a box") ---
      let nearestD = Infinity, nearest = null;
      shards.forEach(s => {
        if (s.taken) return;
        s.crystal.rotation.y += dt * 1.5; s.halo.rotation.z += dt * 1.2;
        s.crystal.position.y = 1.2 + Math.sin(performance.now() * 0.003) * 0.12;
        const d2 = Util.dist2(ctrl.pos.x, ctrl.pos.z, s.x, s.z);
        if (d2 < nearestD) { nearestD = d2; nearest = s; }
      });
      const took = shards.filter(s => s.taken).length;
      if (nearest && nearestD < 4.2) {
        hud.hint('<span class="keycap">E</span> التقط الشظية المضيئة');
        if (input.consumeInteract()) {
          nearest.taken = true; scene.remove(nearest.grp);
          audio.pickup && audio.pickup();
          const n = shards.filter(s => s.taken).length;
          drawStats();
          if (n < 3) {
            narrator.say(`شظيةٌ ${n} من 3. ابحث عن الباقي.`);
            hud.objective(`💠 الشظايا: ${n}/3 — تابع البحث في الظلام`);
          } else {
            narrator.say('اكتملت الشظايا الثلاث! انكسر الختم. اهرب إلى البوابة الآن!');
            hud.objective('🚪 البوابة فُتحت — اهرب إليها بسرعة!');
            seal.material.emissiveIntensity = 0.1; sealLight.color.set(0x44ff88);
            const el = document.getElementById('hudObjective'); el && el.classList.add('obj-pulse');
          }
        }
      } else if (took >= 3) {
        const dg = Util.dist2(ctrl.pos.x, ctrl.pos.z, gateX, gateZ);
        hud.hint(dg < 25 ? '<span class="keycap">E</span> اعبر البوابة' : 'توجّه إلى <b>البوابة المختومة</b> 🚪');
      } else {
        hud.hint('🔦 تتبّع الوهجَ الأزرق لإيجاد الشظايا');
      }

      // pulse the seal / shard guide
      seal.rotation.z += dt * 0.6;

      // --- 🚪 reach the gate (multiple endings branch on health) ---
      if (took >= 3) {
        const dg = Util.dist2(ctrl.pos.x, ctrl.pos.z, gateX, gateZ);
        if (dg < 9 || (dg < 16 && input.consumeInteract())) {
          endGame(hits === 0 && health >= 90 ? 'perfect' : 'narrow');
          return;
        }
      }

      // --- 👁️ ENTITY AI: patrol vs chase ---
      const mx = mon.position.x, mz = mon.position.z;
      const toP = Util.dist2(mx, mz, ctrl.pos.x, ctrl.pos.z);
      const distP = Math.sqrt(toP);
      // detection: hears you when close (more if sprinting), or sees your light when you face it
      const toMon = new THREE.Vector3(mx - camera.position.x, 0, mz - camera.position.z).normalize();
      const facing = fwd.clone(); facing.y = 0; facing.normalize();
      const lit = flashOn && spot.intensity > 0.5 && facing.dot(toMon) > 0.55 && distP < 22;
      const heard = distP < (input.buttons.alt ? 11 : 6.5);
      let chasing = lit || heard;
      // sticky chase: keep chasing a bit once alerted
      if (chasing) mon._alert = 2.4; else mon._alert = Math.max(0, (mon._alert || 0) - dt);
      const active = chasing || mon._alert > 0;

      let mSpeed;
      if (active) {
        mSpeed = 3.35; // a touch slower than your sprint, faster than your walk
        const dx = ctrl.pos.x - mx, dz = ctrl.pos.z - mz, L = Math.hypot(dx, dz) || 1;
        mon.position.x += (dx / L) * mSpeed * dt;
        mon.position.z += (dz / L) * mSpeed * dt;
        mon.rotation.y = Math.atan2(dx, dz);
        monGlow.intensity = 1.4; eyeMat.emissiveIntensity = 3.2;
        if (lit && Math.random() < 0.02) narrator.say('إنه يراك! اطفئ الكشّاف واهرب!');
      } else {
        mSpeed = 1.6;
        const [wx, wz] = monWaypoints[monWP];
        const dx = wx - mx, dz = wz - mz, L = Math.hypot(dx, dz) || 1;
        mon.position.x += (dx / L) * mSpeed * dt;
        mon.position.z += (dz / L) * mSpeed * dt;
        mon.rotation.y = Math.atan2(dx, dz);
        if (L < 1.2) monWP = (monWP + 1) % monWaypoints.length;
        monGlow.intensity = 0.3; eyeMat.emissiveIntensity = 1.6;
      }
      // keep entity inside the hall
      mon.position.x = Util.clamp(mon.position.x, -half + 1.5, half - 1.5);
      mon.position.z = Util.clamp(mon.position.z, -half + 1.5, half - 1.5);

      // --- contact damage / death ---
      hurtCD = Math.max(0, hurtCD - dt);
      if (distP < 1.6 && hurtCD === 0) {
        hits++; health -= 34; hurtCD = 1.3;
        audio.hit && audio.hit(); hud.flash(true); setTimeout(() => hud.flash(false), 300);
        narrator.say(Util.pick(['آخ! لمسَك!', 'لقد جرحَك!', 'ابتعد عنه!']));
        // knockback
        const dx = ctrl.pos.x - mx, dz = ctrl.pos.z - mz, L = Math.hypot(dx, dz) || 1;
        ctrl.pos.x += (dx / L) * 1.6; ctrl.pos.z += (dz / L) * 1.6;
        drawStats();
        if (health <= 0) { endGame('death'); return; }
      }

      // --- 🧩 random scares ---
      scareTimer -= dt;
      if (scareTimer <= 0) { triggerScare(); scareTimer = Util.rand(10, 18); }

      // low-battery warning
      if (battery < 20 && battery > 0 && Math.random() < dt) narrator.say('البطارية تنفد...');

      if (Math.floor(performance.now() / 250) % 2 === 0) drawStats();
    }

    function dispose() {
      // cleanups (button labels) handled via ctx.addCleanup; nothing else persistent
      narrator.stop();
    }

    return { update, dispose };
  },
});
