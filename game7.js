/* ============================================================
   GAME 7 — DRONE EXPLORATION (Easy)
   Free-flying drone. Collect all glowing orbs scattered in a
   canyon. Wind zones push the drone. Camera zoom control.
   Relaxed, no fail state — collect all 10 to win.
   ============================================================ */
GameHub.register({
  title: 'استكشاف بالدرون',
  icon: '🚁', color: '#5ef38c', shape: 'ring',
  diff: 'easy', diffLabel: 'سهل',
  desc: 'حلّق بحرية واجمع كل الكرات المتوهجة عبر الوادي.',

  create(ctx) {
    const { THREE, scene, camera, H, Util } = ctx;
    scene.background = new THREE.Color(0x9ec8e8);
    scene.fog = new THREE.FogExp2(0xbfd8ec, 0.008);
    H.light();
    H.ground(300, 0x6a7a4a, { roughness: 1 });

    // canyon mesas
    for (let i = 0; i < 24; i++) {
      const h = Util.rand(8, 30);
      H.cyl(Util.rand(-90, 90), h / 2, Util.rand(-90, 90), Util.rand(4, 10), Util.rand(6, 12), h, Util.pick([0x8a5a3a, 0x9a6a4a, 0x7a4a2a]), { roughness: 1, seg: 7 });
    }

    // drone body (flying controller)
    const body = new THREE.Group();
    H.sphere(0, 0, 0, .4, 0x222244, { metalness: .6 }).position && body.add(H.sphere(0, 0, 0, .4, 0x333355, { metalness: .6 }));
    for (let i = 0; i < 4; i++) { const r = H.sphere(Math.cos(i * 1.57) * .9, .1, Math.sin(i * 1.57) * .9, .22, 0x5ef38c, { emissive: 0x1a5a2a }); body.add(r); }
    scene.add(body);
    const c = ctx.makeController({ mode: 'tp', y: 14, speed: 10, canFly: true, mesh: body, tpDist: 7, tpHeight: 2.5, gravity: 0 });

    // collectible orbs
    const orbs = [];
    for (let i = 0; i < 10; i++) {
      const o = H.sphere(Util.rand(-80, 80), Util.rand(6, 30), Util.rand(-80, 80), .6, 0x5ef38c, { emissive: 0x2a8a4a });
      const halo = new THREE.Mesh(new THREE.TorusGeometry(1.1, .08, 8, 18), new THREE.MeshBasicMaterial({ color: 0x5ef38c, transparent: true, opacity: .6 }));
      o.add(halo); halo.rotation.x = Math.PI / 2;
      const l = new THREE.PointLight(0x5ef38c, .8, 8); o.add(l);
      orbs.push({ mesh: o, got: false, ph: Util.rand(0, 6) });
    }

    // wind zones (visual columns)
    const winds = [];
    for (let i = 0; i < 4; i++) {
      const wx = Util.rand(-60, 60), wz = Util.rand(-60, 60);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: .12, side: THREE.DoubleSide }));
      col.position.set(wx, 20, wz); scene.add(col);
      winds.push({ x: wx, z: wz, r: 7, dir: new THREE.Vector3(Util.rand(-1, 1), Util.rand(.2, .6), Util.rand(-1, 1)).normalize(), force: Util.rand(6, 10) });
    }

    let got = 0, won = false, t = 0, zoom = 7;

    ctx.hud.crosshair(true);
    ctx.hud.objective('🟢 اجمع كل الكرات العشر · <span style="color:#5ef38c">المسافة</span> صعود · <span style="color:#ffb347">إطلاق/Ctrl</span> هبوط');
    ctx.hud.hint('على الكمبيوتر: عجلة الفأرة للتقريب · تجنّب أعمدة الرياح الزرقاء أو استغلّها');
    setTimeout(() => ctx.hud.hint(''), 6000);

    const onWheel = e => { zoom = Util.clamp(zoom + Math.sign(e.deltaY) * .8, 4, 16); c.tpDist = zoom; };
    addEventListener('wheel', onWheel, { passive: true });
    ctx.addCleanup(() => removeEventListener('wheel', onWheel));

    return {
      update(dt) {
        if (won) return;
        t += dt;
        c.update(dt);
        if (c.pos.y < 1.5) c.pos.y = 1.5;
        body.children.forEach((ch, i) => { if (i > 0) ch.rotation.y += dt * 18; });

        // wind influence
        for (const w of winds) {
          if (Util.dist2(c.pos.x, c.pos.z, w.x, w.z) < w.r * w.r) {
            c.pos.addScaledVector(w.dir, w.force * dt);
          }
        }

        // orbs
        for (const o of orbs) {
          if (o.got) continue;
          o.mesh.rotation.y += dt; o.mesh.position.y += Math.sin(t * 1.5 + o.ph) * dt * .3;
          if (c.pos.distanceTo(o.mesh.position) < 2) { o.got = true; o.mesh.visible = false; got++; AudioManager.pickup(); ctx.hud.toast(`🟢 ${got}/10`, '#5ef38c'); }
        }

        if (got >= 10) { won = true; ctx.win('جمعت كل الكرات! استكشاف مكتمل.'); return; }

        // guide arrow toward nearest orb (compass)
        let near = null, nd = 1e9;
        orbs.forEach(o => { if (!o.got) { const d = c.pos.distanceTo(o.mesh.position); if (d < nd) { nd = d; near = o; } } });
        ctx.hud.stats(`ORBS ${got}/10<br>ALT ${c.pos.y | 0}m<br>NEAREST ${nd < 1e8 ? (nd | 0) + 'm' : '-'}`);
      },
      dispose() { ctx.hud.crosshair(false); }
    };
  }
});
