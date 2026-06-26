/* ============================================================
   GAME 4 — SURVIVAL ISLAND (Medium)
   FP gathering. Collect wood, stone, food. Hunger + stamina.
   Craft an axe (needs wood+stone), then build a shelter
   (needs wood). Passive + aggressive wildlife.
   Goal: build the shelter before hunger kills you.
   ============================================================ */
GameHub.register({
  title: 'جزيرة النجاة',
  icon: '🏝️', color: '#ffb347', shape: 'pyramid',
  diff: 'medium', diffLabel: 'متوسط',
  desc: 'اجمع الموارد، اصنع الأدوات، وابنِ ملجأً للنجاة.',

  create(ctx) {
    const { THREE, scene, camera, H, Util } = ctx;
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x9fd0e8, 0.012);
    H.light();
    // sea
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x1a6a9a, roughness: .2, metalness: .3, transparent: true, opacity: .9 }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -0.4; scene.add(sea);
    // island sand
    const island = new THREE.Mesh(new THREE.CircleGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0xd8c890, roughness: 1 }));
    island.rotation.x = -Math.PI / 2; island.receiveShadow = true; scene.add(island);
    // grass patch
    const grass = new THREE.Mesh(new THREE.CircleGeometry(28, 32), new THREE.MeshStandardMaterial({ color: 0x4a8a3a, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; grass.position.y = .01; scene.add(grass);

    const bounds = { x: 36, z: 36 };
    const c = ctx.makeController({ mode: 'fp', y: 1.7, speed: 5.2, sprintMul: 1.6, bounds });

    // resource nodes
    const nodes = [];
    function addNode(kind, x, z) {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      if (kind === 'wood') { // tree
        H.cyl(0, 1.5, 0, .25, .35, 3, 0x6a4a2a).position && g.add(H.cyl(0, 1.5, 0, .25, .35, 3, 0x6a4a2a));
        const t = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3, 7), new THREE.MeshStandardMaterial({ color: 0x2a6a2a, roughness: .9 })); t.position.y = 3.4; t.castShadow = true; g.add(t);
      } else if (kind === 'stone') {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(.9, 0), new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 1 })); r.position.y = .7; r.castShadow = true; g.add(r);
      } else { // food bush
        const b = new THREE.Mesh(new THREE.SphereGeometry(.7, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3a8a3a, roughness: 1 })); b.position.y = .7; g.add(b);
        for (let i = 0; i < 5; i++) { const berry = new THREE.Mesh(new THREE.SphereGeometry(.1, 6, 6), new THREE.MeshStandardMaterial({ color: 0xff4466, emissive: 0x5a1020 })); berry.position.set(Util.rand(-.5, .5), .7 + Util.rand(0, .5), Util.rand(-.5, .5)); g.add(berry); }
      }
      scene.add(g);
      nodes.push({ g, kind, hp: kind === 'stone' ? 3 : 2 });
    }
    for (let i = 0; i < 12; i++) addNode('wood', Util.rand(-24, 24), Util.rand(-24, 24));
    for (let i = 0; i < 8; i++) addNode('stone', Util.rand(-24, 24), Util.rand(-24, 24));
    for (let i = 0; i < 6; i++) addNode('food', Util.rand(-24, 24), Util.rand(-24, 24));

    // wildlife
    const animals = [];
    function addAnimal(aggressive) {
      const g = new THREE.Group();
      const body = H.sphere(0, .6, 0, .5, aggressive ? 0x8a3a2a : 0xc8a878, { roughness: 1 }); body.scale.set(1.4, .9, .9); g.add(body);
      const head = H.sphere(.6, .8, 0, .3, aggressive ? 0x8a3a2a : 0xc8a878, { roughness: 1 }); g.add(head);
      g.position.set(Util.rand(-22, 22), 0, Util.rand(-22, 22)); scene.add(g);
      animals.push({ g, aggressive, dir: Util.rand(0, 6.28), timer: 0, speed: aggressive ? 3.4 : 1.6 });
    }
    for (let i = 0; i < 3; i++) addAnimal(false);
    for (let i = 0; i < 2; i++) addAnimal(true);

    // inventory & state
    let inv = { wood: 0, stone: 0, food: 0 };
    let hunger = 100, stamina = 100, hp = 100;
    let hasAxe = false, shelterBuilt = false, won = false, lost = false, t = 0;
    const SHELTER_WOOD = 8;

    ctx.hud.crosshair(true);
    updateObjective();
    ctx.hud.hint('<span class="keycap">E</span> اجمع/اصنع · اقترب من الموارد · اصنع فأساً ثم ملجأً');
    setTimeout(() => ctx.hud.hint(''), 5500);

    function updateObjective() {
      if (!hasAxe) ctx.hud.objective(`🪓 اصنع فأساً: تحتاج <b>٣ خشب + ٢ حجر</b> (اضغط E بعيداً عن الموارد للصناعة)`);
      else if (!shelterBuilt) ctx.hud.objective(`🏠 ابنِ الملجأ: تحتاج <b>${SHELTER_WOOD} خشب</b> ثم اضغط E في المنتصف`);
    }

    const tmp = new THREE.Vector3();
    function nearestNode() {
      let best = null, bd = 3.2;
      nodes.forEach(n => { const d = Math.sqrt(Util.dist2(c.pos.x, c.pos.z, n.g.position.x, n.g.position.z)); if (d < bd) { bd = d; best = n; } });
      return best;
    }

    let shelter = null;
    function buildShelter() {
      shelter = new THREE.Group();
      H.addBox(0, 1.2, 0, 4, .2, 4, 0x6a4a2a).position.set(0, .1, 0);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(4, .2, 4), new THREE.MeshStandardMaterial({ color: 0x6a4a2a })); floor.position.y = .1; shelter.add(floor);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2, 4), new THREE.MeshStandardMaterial({ color: 0x8a5a2a })); roof.position.y = 2.4; roof.rotation.y = Math.PI / 4; shelter.add(roof);
      for (const dx of [-1.8, 1.8]) for (const dz of [-1.8, 1.8]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 2.4), new THREE.MeshStandardMaterial({ color: 0x6a4a2a })); post.position.set(dx, 1.2, dz); shelter.add(post); }
      shelter.position.set(0, 0, 0); scene.add(shelter);
    }

    return {
      update(dt) {
        if (won || lost) return;
        t += dt;
        const moving = Math.abs(ctx.input.move.x) + Math.abs(ctx.input.move.y) > 0;
        const sprint = ctx.input.buttons.alt && moving && stamina > 5;
        c.sprintMul = sprint ? 1.6 : 1;
        c.update(dt);
        sea.position.y = -0.4 + Math.sin(t) * .05;

        if (sprint) stamina -= dt * 22; else stamina = Math.min(100, stamina + dt * 12);
        hunger -= dt * 1.6;
        if (hunger <= 0) { hp -= dt * 8; ctx.hud.flash(true); } else ctx.hud.flash(false);

        // interact
        if (ctx.input.consumeInteract()) {
          const n = nearestNode();
          if (n) {
            if ((n.kind === 'wood' || n.kind === 'stone') && !hasAxe && n.kind !== 'food') { ctx.hud.toast('🪓 تحتاج فأساً أولاً (أو اجمع التوت)', '#ffb347'); }
            n.hp--; AudioManager.hit();
            if (n.kind === 'food') { inv.food++; n.hp = 0; }
            if (n.hp <= 0) {
              if (n.kind !== 'food' && hasAxe) { inv[n.kind] += n.kind === 'wood' ? 2 : 1; }
              else if (n.kind === 'food') { hunger = Math.min(100, hunger + 30); ctx.hud.toast('🍓 +٣٠ طعام', '#5ef38c'); }
              scene.remove(n.g); nodes.splice(nodes.indexOf(n), 1); AudioManager.pickup();
            }
          } else {
            // crafting (away from nodes)
            if (!hasAxe && inv.wood >= 3 && inv.stone >= 2) { inv.wood -= 3; inv.stone -= 2; hasAxe = true; AudioManager.confirm(); ctx.hud.toast('🪓 صنعت فأساً!', '#5ef38c'); updateObjective(); }
            else if (hasAxe && !shelterBuilt && inv.wood >= SHELTER_WOOD && Util.dist2(c.pos.x, c.pos.z, 0, 0) < 25) { inv.wood -= SHELTER_WOOD; shelterBuilt = true; buildShelter(); AudioManager.win(); won = true; setTimeout(() => ctx.win('بنيت ملجأك ونجوت في الجزيرة!'), 600); }
            else if (!hasAxe) ctx.hud.toast(`تحتاج ٣ خشب و ٢ حجر (لديك ${inv.wood}/${inv.stone})`, '#ffb347');
            else if (!shelterBuilt) ctx.hud.toast(Util.dist2(c.pos.x, c.pos.z, 0, 0) < 25 ? `تحتاج ${SHELTER_WOOD} خشب (لديك ${inv.wood})` : 'اقترب من وسط الجزيرة للبناء', '#ffb347');
          }
        }

        // wildlife
        for (const a of animals) {
          a.timer -= dt;
          if (a.aggressive) {
            const dir = tmp.set(c.pos.x - a.g.position.x, 0, c.pos.z - a.g.position.z);
            const d = dir.length(); dir.normalize();
            if (d < 14) { a.g.position.addScaledVector(dir, a.speed * dt); a.g.rotation.y = Math.atan2(dir.x, dir.z); if (d < 1.4) { hp -= dt * 14; ctx.hud.flash(true); } }
          } else {
            if (a.timer <= 0) { a.dir = Util.rand(0, 6.28); a.timer = Util.rand(2, 4); }
            a.g.position.x += Math.cos(a.dir) * a.speed * dt; a.g.position.z += Math.sin(a.dir) * a.speed * dt; a.g.rotation.y = -a.dir + Math.PI / 2;
            a.g.position.x = Util.clamp(a.g.position.x, -24, 24); a.g.position.z = Util.clamp(a.g.position.z, -24, 24);
          }
          a.g.position.y = Math.abs(Math.sin(t * 6)) * .08;
        }

        if (hp <= 0) { lost = true; ctx.lose('لم تنجُ في الجزيرة. اجمع الطعام أسرع!'); return; }

        ctx.hud.stats(`🪵 ${inv.wood}  🪨 ${inv.stone}  🍓 ${inv.food}<br>HUNGER ${hunger | 0}%  STAMINA ${stamina | 0}%<br>HP ${hp | 0}  ${hasAxe ? '🪓AXE' : ''}`);
      },
      dispose() { ctx.hud.crosshair(false); ctx.hud.flash(false); }
    };
  }
});
