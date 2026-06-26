/* ============================================================
   GAME 6 — 3D PUZZLE ESCAPE ROOMS (Medium)
   FP. Multi-step room: step on 3 pressure plates in the right
   order to reveal a key; grab the key; unlock the door.
   Hint system + clear on-screen guidance.
   ============================================================ */
GameHub.register({
  title: 'غرف الهروب',
  icon: '🧩', color: '#4fc3f7', shape: 'cube',
  diff: 'medium', diffLabel: 'متوسط',
  desc: 'حلّ ألغاز الضغط بالترتيب الصحيح، خذ المفتاح، واهرب.',

  create(ctx) {
    const { THREE, scene, camera, H, Util } = ctx;
    scene.background = new THREE.Color(0x0d0f1a);
    scene.fog = new THREE.FogExp2(0x0d0f1a, 0.03);
    H.light();
    const torch = new THREE.PointLight(0xffaa55, 1.2, 24); torch.position.set(0, 4, 0); scene.add(torch);

    // room
    H.ground(40, 0x1a1c2a, { roughness: 1 });
    const W = 14;
    H.addBox(0, 3, -W / 2, W, 6, .5, 0x2a2c3e); // back
    H.addBox(0, 3, W / 2, W, 6, .5, 0x2a2c3e);   // front
    H.addBox(-W / 2, 3, 0, .5, 6, W, 0x2a2c3e);  // left
    H.addBox(W / 2, 3, 0, .5, 6, W, 0x2a2c3e);   // right
    H.addBox(0, 6, 0, W, .5, W, 0x222436, { solid: false }); // ceiling

    const bounds = { x: 6.4, z: 6.4 };
    const c = ctx.makeController({ mode: 'fp', y: 1.7, z: 4, bounds });

    // pressure plates with order numbers
    const order = [2, 0, 1]; // correct stepping order
    const plates = [];
    const positions = [[-4, -4], [4, -4], [0, -3]];
    positions.forEach(([x, z], i) => {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(2, .2, 2), new THREE.MeshStandardMaterial({ color: 0x445, emissive: 0x111122, roughness: .6 }));
      plate.position.set(x, .1, z); scene.add(plate);
      const numMat = new THREE.MeshBasicMaterial({ color: 0x4fc3f7 });
      // small marker ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.6, .06, 8, 16), numMat); ring.rotation.x = -Math.PI / 2; ring.position.set(x, .25, z); scene.add(ring);
      plates.push({ mesh: plate, ring, i, x, z, lit: false });
    });

    // clue on wall: shows correct order as glyph count
    const clue = document.createElement('div');
    // (kept in HUD instead) — show order hint

    // door (locked)
    const door = H.addBox(0, 2.5, -W / 2 + .3, 3, 5, .4, 0x6a4a2a, { solid: true });
    door.material.emissive.setHex(0x1a0f00);
    const doorLight = new THREE.PointLight(0xffb347, 0, 8); doorLight.position.set(0, 2.5, -W / 2 + 1); scene.add(doorLight);

    // key (hidden until plates solved)
    const key = new THREE.Group();
    const kr = new THREE.Mesh(new THREE.TorusGeometry(.25, .08, 8, 16), new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0x7a5a10, metalness: .8 })); kr.rotation.x = Math.PI / 2; key.add(kr);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(.1, .6, .1), new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0x7a5a10, metalness: .8 })); kb.position.y = -.4; key.add(kb);
    key.position.set(0, 1.4, -3); key.visible = false; scene.add(key);
    const keyLight = new THREE.PointLight(0xffd24a, 0, 6); keyLight.position.copy(key.position); scene.add(keyLight);

    let step = 0, solved = false, hasKey = false, won = false, t = 0;
    let standing = -1, hintTimer = 0;

    ctx.hud.crosshair(true);
    ctx.hud.objective(`🔢 الترتيب الصحيح: <b style="color:#5ef38c">الوسط → اليسار → اليمين</b> · قف على المنصات بالترتيب`);
    ctx.hud.hint('قف على المنصة الصحيحة لإضاءتها · ترتيب خاطئ = إعادة');
    setTimeout(() => ctx.hud.hint(''), 6000);

    function resetPlates() {
      plates.forEach(p => { p.lit = false; p.mesh.material.emissive.setHex(0x111122); p.ring.material.color.setHex(0x4fc3f7); });
      step = 0; AudioManager.lose && AudioManager.hit();
      ctx.hud.toast('❌ ترتيب خاطئ — أعد المحاولة', '#ff5d6c');
    }

    return {
      update(dt) {
        if (won) return;
        t += dt;
        c.update(dt);
        torch.intensity = 1.1 + Math.sin(t * 3) * .15;

        // which plate is the player standing on?
        let on = -1;
        plates.forEach((p, idx) => { if (Util.dist2(c.pos.x, c.pos.z, p.x, p.z) < 1.2) on = idx; });

        if (on !== standing) {
          standing = on;
          if (on >= 0 && !solved) {
            const p = plates[on];
            if (!p.lit) {
              const expected = order[step];
              if (on === expected) {
                p.lit = true; p.mesh.material.emissive.setHex(0x1a5a3a); p.ring.material.color.setHex(0x5ef38c);
                step++; AudioManager.confirm();
                if (step >= order.length) {
                  solved = true; key.visible = true; keyLight.intensity = 1.5; AudioManager.win();
                  ctx.hud.toast('🔑 ظهر المفتاح! خذه', '#ffd24a');
                  ctx.hud.objective('🔑 خذ المفتاح (اقترب واضغط E) ثم افتح الباب');
                }
              } else {
                resetPlates();
              }
            }
          }
        }

        // animate key/door
        if (key.visible) { key.rotation.y += dt * 2; key.position.y = 1.4 + Math.sin(t * 2) * .15; keyLight.position.copy(key.position); }

        // pick up key
        if (solved && !hasKey && Util.dist2(c.pos.x, c.pos.z, key.position.x, key.position.z) < 3) {
          ctx.hud.hint('<span class="keycap">E</span> خذ المفتاح');
          if (ctx.input.consumeInteract()) { hasKey = true; key.visible = false; keyLight.intensity = 0; AudioManager.pickup(); ctx.hud.hint(''); ctx.hud.objective('🚪 اقترب من الباب واضغط E لفتحه'); ctx.hud.toast('🔑 معك المفتاح', '#ffd24a'); }
        } else if (hasKey && Util.dist2(c.pos.x, c.pos.z, 0, -W / 2 + .3) < 6) {
          ctx.hud.hint('<span class="keycap">E</span> افتح الباب بالمفتاح');
          if (ctx.input.consumeInteract()) {
            won = true; doorLight.intensity = 2; door.material.emissive.setHex(0x5a4010);
            AudioManager.win(); ctx.win('فتحت الباب وهربت من الغرفة!');
          }
        } else ctx.hud.hint('');

        ctx.hud.stats(`PLATES ${step}/${order.length}<br>KEY ${hasKey ? '✔' : '✘'}`);
      },
      dispose() { ctx.hud.crosshair(false); }
    };
  }
});
