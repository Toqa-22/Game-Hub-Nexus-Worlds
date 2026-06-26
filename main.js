/* ============================================================
   NEXUS ARCADE — 3D GAME HUB
   main.js : Core engine + global managers
   - GameHub (registry + launcher + transitions)
   - SceneLoader (renderer + RAF loop + scene swap)
   - UIManager (HUD overlays)
   - AudioManager (synth music + sfx, no external files)
   - Input (keyboard / mouse / touch joystick)
   - Controller (shared FP/TP movement + gravity + AABB collisions)
   - Pool (object pooling), plus small helpers
   No backend. No tracking. Pure frontend.
   ============================================================ */
'use strict';

/* ---------- small math utils ---------- */
const Util = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + Math.random() * (b - a),
  randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: arr => arr[Math.floor(Math.random() * arr.length)],
  dist2: (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; },
};

/* ============================================================
   AUDIO MANAGER — procedural sound via WebAudio (no files)
   ============================================================ */
const AudioManager = {
  ctx: null, master: null, musicGain: null, enabled: true, volume: 0.5,
  _nodes: [],

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(this.master);
    } catch (e) { console.warn('Audio unavailable', e); }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = this.enabled ? v : 0; },
  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? this.volume : 0;
    return this.enabled;
  },

  tone(freq, type = 'sine', dur = 0.18, vol = 0.3, dest = null) {
    if (!this.ctx || !this.enabled) return;
    try {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
      o.connect(g); g.connect(dest || this.master);
      o.start(); o.stop(this.ctx.currentTime + dur);
    } catch (e) {}
  },
  noise(dur = 0.2, vol = 0.3) {
    if (!this.ctx || !this.enabled) return;
    try {
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(g); g.connect(this.master); src.start();
    } catch (e) {}
  },

  /* sfx shortcuts */
  ui() { this.tone(660, 'sine', 0.08, 0.25); },
  confirm() { this.tone(523, 'sine', 0.1, 0.3); setTimeout(() => this.tone(784, 'sine', 0.12, 0.3), 70); },
  shoot() { this.tone(880, 'sawtooth', 0.08, 0.2); this.tone(1400, 'square', 0.05, 0.12); },
  rocket() { this.noise(0.3, 0.25); this.tone(120, 'sawtooth', 0.4, 0.3); },
  hit() { this.noise(0.12, 0.3); this.tone(180, 'square', 0.1, 0.25); },
  pickup() { this.tone(784, 'sine', 0.1, 0.3); setTimeout(() => this.tone(1175, 'sine', 0.12, 0.3), 60); },
  jump() { this.tone(330, 'sine', 0.12, 0.2); },
  step() { this.tone(70 + Math.random() * 30, 'square', 0.04, 0.07); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 'sine', 0.25, 0.35), i * 110)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 'sawtooth', 0.25, 0.3), i * 120)); },
  scare() { this.noise(0.5, 0.4); this.tone(90, 'sawtooth', 0.6, 0.35); },

  /* simple looping ambient pad per palette */
  _amb: [],
  ambient(freqs) {
    this.stopAmbient();
    if (!this.ctx || !this.enabled) return;
    freqs.forEach((f, i) => {
      try {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
        lfo.frequency.value = 0.07 + i * 0.04; lg.gain.value = 4;
        lfo.connect(lg); lg.connect(o.frequency);
        o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.04;
        o.connect(g); g.connect(this.musicGain);
        o.start(); lfo.start(); this._amb.push(o, lfo);
      } catch (e) {}
    });
  },
  stopAmbient() { this._amb.forEach(o => { try { o.stop(); } catch (e) {} }); this._amb = []; },
};

/* ============================================================
   INPUT — keyboard, mouse-look (pointer lock), touch joystick
   ============================================================ */
const Input = {
  keys: {}, _justKeys: {},
  look: { dx: 0, dy: 0 }, locked: false,
  move: { x: 0, y: 0 },          // joystick / WASD normalized (-1..1)
  buttons: { jump: false, action: false, interact: false, alt: false },
  _justBtn: {},
  sensitivity: 1,

  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', e => {
      if (!this.keys[e.code]) this._justKeys[e.code] = true;
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    document.addEventListener('mousemove', e => {
      if (this.locked) { this.look.dx += e.movementX; this.look.dy += e.movementY; }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });

    this._initTouch();
  },

  requestLock() { if (this.canvas && this.canvas.requestPointerLock) this.canvas.requestPointerLock(); },
  exitLock() { if (document.exitPointerLock) document.exitPointerLock(); },

  _initTouch() {
    const zone = document.getElementById('joyZone'), knob = document.getElementById('joyKnob');
    this.joy = { active: false, id: null, cx: 0, cy: 0 };
    const start = e => {
      const t = e.changedTouches[0];
      this.joy.active = true; this.joy.id = t.identifier;
      const r = zone.getBoundingClientRect();
      this.joy.cx = r.left + r.width / 2; this.joy.cy = r.top + r.height / 2;
    };
    const move = e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joy.id) continue;
        const dx = t.clientX - this.joy.cx, dy = t.clientY - this.joy.cy;
        const d = Math.min(Math.hypot(dx, dy), 46), a = Math.atan2(dy, dx);
        this.move.x = Math.cos(a) * d / 46; this.move.y = Math.sin(a) * d / 46;
        knob.style.transform = `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px)`;
      }
    };
    const end = e => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          this.joy.active = false; this.move.x = 0; this.move.y = 0; knob.style.transform = '';
        }
      }
    };
    if (zone) {
      zone.addEventListener('touchstart', e => { e.preventDefault(); start(e); }, { passive: false });
      zone.addEventListener('touchmove', e => { e.preventDefault(); move(e); }, { passive: false });
      zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    }

    // right-half drag = look
    const gameLayer = document.getElementById('touchLook');
    let lid = null, lx = 0, ly = 0;
    if (gameLayer) {
      gameLayer.addEventListener('touchstart', e => {
        const t = e.changedTouches[0]; lid = t.identifier; lx = t.clientX; ly = t.clientY;
      }, { passive: true });
      gameLayer.addEventListener('touchmove', e => {
        for (const t of e.changedTouches) {
          if (t.identifier !== lid) continue;
          this.look.dx += (t.clientX - lx) * 1.4; this.look.dy += (t.clientY - ly) * 1.4;
          lx = t.clientX; ly = t.clientY;
        }
      }, { passive: true });
      gameLayer.addEventListener('touchend', e => {
        for (const t of e.changedTouches) if (t.identifier === lid) lid = null;
      });
    }

    // action buttons
    const bind = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('touchstart', e => { e.preventDefault(); if (!this.buttons[key]) this._justBtn[key] = true; this.buttons[key] = true; }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); this.buttons[key] = false; }, { passive: false });
    };
    bind('btnJump', 'jump'); bind('btnAction', 'action');
    bind('btnInteract', 'interact'); bind('btnAlt', 'alt');
  },

  /* read WASD into move each frame (call before games read move) */
  poll() {
    if (!this.joy || !this.joy.active) {
      let x = 0, y = 0;
      if (this.keys['KeyW'] || this.keys['ArrowUp']) y -= 1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) y += 1;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1;
      const m = Math.hypot(x, y) || 1; this.move.x = x / m; this.move.y = y / m;
    }
    // unified button/key edges
    this.buttons.jump = this.buttons.jump || this.keys['Space'];
    this.buttons.interact = this.buttons.interact || this.keys['KeyE'];
    this.buttons.alt = this.buttons.alt || this.keys['ShiftLeft'] || this.keys['ShiftRight'];
  },

  justKey(code) { if (this._justKeys[code]) { this._justKeys[code] = false; return true; } return false; },
  justBtn(name) { if (this._justBtn[name]) { this._justBtn[name] = false; return true; } return false; },
  /* interact edge across key+touch */
  consumeInteract() {
    let hit = this.justKey('KeyE') || this.justBtn('interact');
    return hit;
  },
  consumeAction() { return this.justKey('Space') || this.justBtn('action'); },
  takeLook() { const d = { dx: this.look.dx, dy: this.look.dy }; this.look.dx = 0; this.look.dy = 0; return d; },
  reset() { this.keys = {}; this._justKeys = {}; this._justBtn = {}; this.look.dx = this.look.dy = 0; this.move.x = this.move.y = 0; for (const k in this.buttons) this.buttons[k] = false; },
};

/* ============================================================
   SHARED CONTROLLER — FP/TP movement, gravity, AABB collision
   ============================================================ */
class Controller {
  constructor(THREE, camera, opts = {}) {
    this.THREE = THREE; this.camera = camera;
    this.mode = opts.mode || 'fp';          // 'fp' | 'tp'
    this.pos = new THREE.Vector3(opts.x || 0, opts.y || 1.7, opts.z || 0);
    this.vel = new THREE.Vector3();
    this.yaw = opts.yaw || 0; this.pitch = 0;
    this.speed = opts.speed || 6;
    this.sprintMul = opts.sprintMul || 1.7;
    this.gravity = opts.gravity ?? 22;
    this.jumpV = opts.jumpV || 8.5;
    this.radius = opts.radius || 0.4;
    this.height = opts.height || 1.7;
    this.grounded = false;
    this.colliders = opts.colliders || [];   // array of {min,max} THREE.Vector3
    this.bounds = opts.bounds || null;       // {x,z} half-extents
    this.tpDist = opts.tpDist || 6;
    this.tpHeight = opts.tpHeight || 2.4;
    this.mesh = opts.mesh || null;           // optional player body for TP
    this.canFly = opts.canFly || false;
    this.gravityDir = -1;                     // for gravity-shift game
  }

  update(dt) {
    const T = this.THREE;
    const look = Input.takeLook();
    const sens = 0.0023 * Input.sensitivity;
    this.yaw -= look.dx * sens;
    this.pitch -= look.dy * sens;
    this.pitch = Util.clamp(this.pitch, -1.4, 1.4);

    // movement basis from yaw
    const fwd = new T.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new T.Vector3(fwd.z, 0, -fwd.x);
    const mv = Input.move;
    let spd = this.speed * (Input.buttons.alt ? this.sprintMul : 1);
    const wish = new T.Vector3();
    wish.addScaledVector(fwd, -mv.y).addScaledVector(right, mv.x);
    if (wish.lengthSq() > 0) wish.normalize();

    if (this.canFly) {
      // drone flying: vertical via buttons
      this.vel.x = wish.x * spd; this.vel.z = wish.z * spd;
      let vy = 0;
      if (Input.buttons.jump || Input.keys['Space']) vy += 1;
      if (Input.buttons.action || Input.keys['ControlLeft']) vy -= 1;
      this.vel.y = vy * spd * 0.8;
    } else {
      this.vel.x = wish.x * spd; this.vel.z = wish.z * spd;
      this.vel.y += this.gravity * this.gravityDir * dt;
      if (this.grounded && (Input.consumeAction())) {
        this.vel.y = this.jumpV * (-this.gravityDir); this.grounded = false; AudioManager.jump();
      }
    }

    // integrate + collide axis by axis
    this._moveAxis('x', this.vel.x * dt);
    this._moveAxis('z', this.vel.z * dt);
    this._moveAxis('y', this.vel.y * dt);

    // ground plane
    const floor = this.height * 0.5;
    if (this.gravityDir < 0 && this.pos.y < floor) { this.pos.y = floor; this.vel.y = 0; this.grounded = true; }
    if (this.gravityDir < 0 && this.pos.y > floor + 0.01) this.grounded = false;

    if (this.bounds) {
      this.pos.x = Util.clamp(this.pos.x, -this.bounds.x, this.bounds.x);
      this.pos.z = Util.clamp(this.pos.z, -this.bounds.z, this.bounds.z);
    }

    this._applyCamera();
  }

  _moveAxis(axis, amt) {
    if (amt === 0) return;
    this.pos[axis] += amt;
    const r = this.radius, h = this.height;
    const pmin = { x: this.pos.x - r, y: this.pos.y - h * 0.5, z: this.pos.z - r };
    const pmax = { x: this.pos.x + r, y: this.pos.y + h * 0.5, z: this.pos.z + r };
    for (const c of this.colliders) {
      if (pmax.x > c.min.x && pmin.x < c.max.x &&
          pmax.y > c.min.y && pmin.y < c.max.y &&
          pmax.z > c.min.z && pmin.z < c.max.z) {
        if (amt > 0) this.pos[axis] -= (pmax[axis] - c.min[axis]);
        else this.pos[axis] += (c.max[axis] - pmin[axis]);
        if (axis === 'y') { if (amt < 0) this.grounded = true; this.vel.y = 0; }
      }
    }
  }

  _applyCamera() {
    const cam = this.camera;
    if (this.mode === 'fp') {
      cam.position.copy(this.pos);
      cam.rotation.order = 'YXZ';
      cam.rotation.y = this.yaw; cam.rotation.x = this.pitch; cam.rotation.z = 0;
    } else {
      // third person orbit
      const off = new this.THREE.Vector3(
        Math.sin(this.yaw) * this.tpDist,
        this.tpHeight + this.pitch * -3,
        Math.cos(this.yaw) * this.tpDist
      );
      cam.position.copy(this.pos).add(off);
      cam.lookAt(this.pos.x, this.pos.y + 0.6, this.pos.z);
      if (this.mesh) { this.mesh.position.copy(this.pos); this.mesh.rotation.y = this.yaw + Math.PI; }
    }
  }
}

/* ============================================================
   POOL — generic object pool
   ============================================================ */
class Pool {
  constructor(factory, reset) { this.factory = factory; this.reset = reset; this.free = []; this.active = []; }
  get() {
    let o = this.free.pop() || this.factory();
    this.reset && this.reset(o); this.active.push(o); return o;
  }
  release(o) {
    const i = this.active.indexOf(o); if (i >= 0) this.active.splice(i, 1);
    this.free.push(o);
  }
  forEach(fn) { for (let i = this.active.length - 1; i >= 0; i--) fn(this.active[i], i); }
}

/* ============================================================
   SCENE HELPERS — quick low-poly builders + collider registry
   ============================================================ */
function makeHelpers(THREE, scene, colliders) {
  const std = (color, opt = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0.05 }, opt));
  const H = {
    mat: std,
    addBox(x, y, z, w, h, d, color, opt = {}) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std(color, opt));
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
      if (opt.solid !== false) colliders.push({
        min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
        max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)
      });
      m.userData.isCollider = opt.solid !== false;
      return m;
    },
    ground(size, color, opt = {}) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), std(color, Object.assign({ roughness: 0.95 }, opt)));
      m.rotation.x = -Math.PI / 2; m.receiveShadow = true; scene.add(m); return m;
    },
    cyl(x, y, z, rt, rb, h, color, opt = {}) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, opt.seg || 10), std(color, opt));
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
    },
    sphere(x, y, z, r, color, opt = {}) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, opt.seg || 12, opt.seg || 10), std(color, opt));
      m.position.set(x, y, z); m.castShadow = true; scene.add(m); return m;
    },
    light(scene2, color, fog) {
      const amb = new THREE.AmbientLight(0x6677aa, 0.55); scene.add(amb);
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(12, 22, 8); dir.castShadow = true;
      dir.shadow.mapSize.set(1024, 1024);
      dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 120;
      const s = 45; dir.shadow.camera.left = -s; dir.shadow.camera.right = s;
      dir.shadow.camera.top = s; dir.shadow.camera.bottom = -s;
      scene.add(dir);
      return { amb, dir };
    }
  };
  return H;
}

/* ============================================================
   UI MANAGER — HUD overlay control
   ============================================================ */
const UIManager = {
  el: {},
  init() {
    ['hud', 'hudObjective', 'hudStats', 'hint', 'crosshair', 'overlayEnd',
     'endTitle', 'endMsg', 'touchControls', 'flashVignette'].forEach(id => this.el[id] = document.getElementById(id));
  },
  showHUD(on) { this.el.hud.classList.toggle('show', on); },
  objective(t) { this.el.hudObjective.innerHTML = t; },
  stats(t) { this.el.hudStats.innerHTML = t; },
  hint(t) { if (!t) { this.el.hint.classList.remove('show'); } else { this.el.hint.innerHTML = t; this.el.hint.classList.add('show'); } },
  crosshair(on) { this.el.crosshair.classList.toggle('show', !!on); },
  touch(on) { this.el.touchControls.classList.toggle('show', on && GameHub.isMobile); },
  toast(msg, color) {
    const c = document.getElementById('toasts');
    const n = document.createElement('div'); n.className = 'toast'; n.textContent = msg;
    if (color) n.style.borderColor = color, n.style.color = color;
    c.appendChild(n); setTimeout(() => n.remove(), 2600);
  },
  end(win, title, msg) {
    AudioManager[win ? 'win' : 'lose']();
    this.el.endTitle.textContent = title;
    this.el.endTitle.style.color = win ? 'var(--c-win)' : 'var(--c-lose)';
    this.el.endMsg.textContent = msg;
    this.el.overlayEnd.classList.add('show');
  },
  hideEnd() { this.el.overlayEnd.classList.remove('show'); },
  flash(on) { this.el.flashVignette.classList.toggle('show', !!on); },
};

/* ============================================================
   NARRATOR — AI voice narration (Web Speech API) + subtitles
   Self-contained: injects its own subtitle bar into <body>.
   ============================================================ */
const Narrator = {
  bar: null, txt: null, voice: null, ready: false, queue: [], speaking: false,
  enabled: true,
  init() {
    // subtitle bar
    const bar = document.createElement('div');
    bar.id = 'subBar';
    bar.innerHTML = '<div id="subTxt"></div>';
    document.body.appendChild(bar);
    this.bar = bar; this.txt = bar.querySelector('#subTxt');
    // load voices (async on most browsers)
    const pick = () => {
      const vs = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
      // prefer an Arabic voice, then any
      this.voice = vs.find(v => /ar/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || vs[0] || null;
      this.ready = true;
    };
    if (window.speechSynthesis) {
      pick();
      speechSynthesis.onvoiceschanged = pick;
    }
  },
  // speak one line; shows subtitle for `hold` ms even if TTS unavailable
  say(text, opt = {}) {
    if (!text) return Promise.resolve();
    return new Promise(resolve => {
      this._show(text);
      const done = () => { resolve(); };
      const useTTS = this.enabled && AudioManager.enabled && window.speechSynthesis;
      if (useTTS) {
        try {
          speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(text);
          if (this.voice) u.voice = this.voice;
          u.lang = (this.voice && this.voice.lang) || 'ar-SA';
          u.rate = opt.rate || 0.96; u.pitch = opt.pitch != null ? opt.pitch : 1;
          u.volume = AudioManager.volume != null ? Math.min(1, AudioManager.volume + 0.4) : 1;
          let settled = false;
          u.onend = () => { if (!settled) { settled = true; done(); } };
          u.onerror = () => { if (!settled) { settled = true; done(); } };
          speechSynthesis.speak(u);
          // safety timeout in case onend never fires
          const est = Math.max(1400, text.length * 80);
          setTimeout(() => { if (!settled) { settled = true; done(); } }, est + 1500);
        } catch (e) { setTimeout(done, opt.hold || Math.max(1600, text.length * 70)); }
      } else {
        setTimeout(done, opt.hold || Math.max(1600, text.length * 70));
      }
    });
  },
  _show(text) {
    if (!this.txt) return;
    this.txt.textContent = text;
    this.bar.classList.add('show');
    clearTimeout(this._h);
    this._h = setTimeout(() => this.bar && this.bar.classList.remove('show'), 4200);
  },
  hide() { if (this.bar) this.bar.classList.remove('show'); },
  stop() {
    try { window.speechSynthesis && speechSynthesis.cancel(); } catch (e) {}
    this.hide();
  },
};

/* ============================================================
   CINEMATIC — cutscene director: camera keyframes + letterbox
   Each "shot" = { pos:[x,y,z], look:[x,y,z], dur, say?, sfx? }
   Player update() must early-return while .active is true and
   instead call .update(dt). Tap / Esc / Enter skips.
   ============================================================ */
function makeCinematic(THREE, camera) {
  let box = document.getElementById('cineBox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'cineBox';
    box.innerHTML = '<div class="bar top"></div><div class="bar bot"></div>' +
                    '<button id="cineSkip">تخطّي ⏩</button>';
    document.body.appendChild(box);
  }
  const skipBtn = box.querySelector('#cineSkip');

  const C = {
    active: false, shots: [], i: 0, t: 0, onDone: null,
    from: new THREE.Vector3(), to: new THREE.Vector3(),
    lookFrom: new THREE.Vector3(), lookTo: new THREE.Vector3(),
    curLook: new THREE.Vector3(), saidThisShot: false,

    play(shots, onDone) {
      this.shots = shots; this.i = 0; this.t = 0; this.onDone = onDone;
      this.active = true; this.saidThisShot = false;
      box.classList.add('show');
      Input.reset();
      this._begin(0);
    },
    _begin(idx) {
      const s = this.shots[idx];
      // start from current camera position for the first shot for a smooth in
      if (idx === 0) { this.from.copy(camera.position); this.lookFrom.copy(this.curLook.lengthSq() ? this.curLook : new THREE.Vector3(s.look[0], s.look[1], s.look[2])); }
      else { const p = this.shots[idx - 1]; this.from.set(p.pos[0], p.pos[1], p.pos[2]); this.lookFrom.set(p.look[0], p.look[1], p.look[2]); }
      this.to.set(s.pos[0], s.pos[1], s.pos[2]);
      this.lookTo.set(s.look[0], s.look[1], s.look[2]);
      this.t = 0; this.saidThisShot = false;
      if (s.sfx) { try { AudioManager[s.sfx] && AudioManager[s.sfx](); } catch (e) {} }
    },
    update(dt) {
      if (!this.active) return;
      const s = this.shots[this.i];
      if (!s) { this.end(); return; }
      this.t += dt;
      const k = Util.clamp(this.t / s.dur, 0, 1);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOut
      camera.position.lerpVectors(this.from, this.to, e);
      this.curLook.lerpVectors(this.lookFrom, this.lookTo, e);
      camera.lookAt(this.curLook);
      if (!this.saidThisShot && s.say) { this.saidThisShot = true; Narrator.say(s.say); }
      if (this.t >= s.dur) {
        this.i++;
        if (this.i >= this.shots.length) this.end();
        else this._begin(this.i);
      }
    },
    skip() { if (this.active) this.end(); },
    end() {
      if (!this.active) return;
      this.active = false;
      box.classList.remove('show');
      Narrator.stop();
      const cb = this.onDone; this.onDone = null;
      if (cb) cb();
    },
  };
  skipBtn.onclick = () => C.skip();
  C._skipKey = (ev) => { if (C.active && (ev.key === 'Escape' || ev.key === 'Enter')) C.skip(); };
  addEventListener('keydown', C._skipKey);
  C._dispose = () => { removeEventListener('keydown', C._skipKey); box.classList.remove('show'); };
  return C;
}

/* ============================================================
   SCENE LOADER — owns renderer + RAF; runs the active game
   ============================================================ */
const SceneLoader = {
  renderer: null, THREE: null, raf: null, last: 0, current: null, running: false,

  init() {
    this.THREE = window.THREE;
    const canvas = document.getElementById('glCanvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    Input.init(canvas);
    addEventListener('resize', () => this.resize());
  },
  resize() {
    if (!this.current) return;
    this.renderer.setSize(innerWidth, innerHeight);
    const cam = this.current.camera;
    if (cam) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
  },

  load(gameDef) {
    this.unload();
    const THREE = this.THREE;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(GameHub.isMobile ? 80 : 72, innerWidth / innerHeight, 0.1, 400);
    const colliders = [];
    const cleanups = [];
    const helpers = makeHelpers(THREE, scene, colliders);

    const ctx = {
      THREE, scene, camera, renderer: this.renderer,
      input: Input, hud: UIManager, audio: AudioManager,
      narrator: Narrator,
      H: helpers, colliders, Util, Pool, Controller,
      isMobile: GameHub.isMobile,
      addCleanup: fn => cleanups.push(fn),
      makeController: (opts = {}) => new Controller(THREE, camera, Object.assign({ colliders }, opts)),
      makeCinematic: () => { const c = makeCinematic(THREE, camera); cleanups.push(() => c._dispose && c._dispose()); return c; },
      // win/lose accept an optional custom title for multiple endings:
      win: (msg, title) => GameHub.gameEnd(true, msg, title),
      lose: (msg, title) => GameHub.gameEnd(false, msg, title),
    };

    const inst = gameDef.create(ctx);   // each game returns { update(dt), dispose() }
    this.current = { def: gameDef, ctx, scene, camera, inst, cleanups };
    this.resize();
    UIManager.showHUD(true);
    UIManager.touch(true);
    this.start();
  },

  unload() {
    if (!this.current) return;
    this.stop();
    const c = this.current;
    try { c.inst && c.inst.dispose && c.inst.dispose(); } catch (e) {}
    c.cleanups.forEach(fn => { try { fn(); } catch (e) {} });
    this._disposeScene(c.scene);
    AudioManager.stopAmbient();
    Narrator.stop();
    Input.exitLock(); Input.reset();
    UIManager.showHUD(false); UIManager.touch(false);
    UIManager.crosshair(false); UIManager.hint(''); UIManager.flash(false);
    this.current = null;
  },

  _disposeScene(scene) {
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
  },

  start() { this.running = true; this.last = performance.now(); cancelAnimationFrame(this.raf); this._loop(); },
  stop() { this.running = false; cancelAnimationFrame(this.raf); },
  pause() { this.running = false; },
  resume() { if (this.current) { this.running = true; this.last = performance.now(); this._loop(); } },

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    let dt = (now - this.last) / 1000; this.last = now;
    dt = Math.min(dt, 0.05);
    Input.poll();
    const c = this.current;
    if (c) {
      try { c.inst.update(dt); } catch (e) { console.error(e); }
      this.renderer.render(c.scene, c.camera);
    }
    this.raf = requestAnimationFrame(() => this._loop());
  },
};

/* ============================================================
   GAME HUB — registry, launcher UI, transitions, pause
   ============================================================ */
const GameHub = {
  games: [], isMobile: false, state: 'launcher', paused: false,
  unlocked: new Set([0,1,2,3,4,5,6,7,8,9]),  // all unlocked; lock system ready

  register(def) { this.games.push(def); },

  init() {
    this.isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    AudioManager.init(); UIManager.init(); SceneLoader.init(); Narrator.init();
    this.buildCards();
    this.bindUI();
    // launcher 3D ambient backdrop
    LauncherFX.init();
    this.fade(false);
  },

  buildCards() {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = '';
    this.games.forEach((g, i) => {
      const locked = !this.unlocked.has(i);
      const card = document.createElement('div');
      card.className = 'game-card' + (locked ? ' locked' : '');
      card.style.setProperty('--accent', g.color);
      card.innerHTML = `
        <div class="thumb">
          <div class="thumb-shape ${g.shape}" style="--accent:${g.color}">
            <span class="thumb-icon">${g.icon}</span>
          </div>
          <div class="diff diff-${g.diff.toLowerCase().replace(/[^a-z]/g,'')}">${g.diffLabel}</div>
        </div>
        <div class="card-body">
          <h3>${g.title}</h3>
          <p>${g.desc}</p>
          <button class="play-btn">${locked ? '🔒 مقفلة' : '▶ العب الآن'}</button>
        </div>`;
      if (!locked) {
        card.querySelector('.play-btn').addEventListener('click', e => { e.stopPropagation(); this.launch(i); });
        card.addEventListener('click', () => this.launch(i));
        card.addEventListener('mouseenter', () => AudioManager.ui());
      }
      grid.appendChild(card);
    });
  },

  bindUI() {
    document.getElementById('btnExit').addEventListener('click', () => this.backToHub());
    document.getElementById('btnPause').addEventListener('click', () => this.togglePause());
    document.getElementById('btnResume').addEventListener('click', () => this.togglePause());
    document.getElementById('btnRestart').addEventListener('click', () => this.restart());
    document.getElementById('btnQuit').addEventListener('click', () => this.backToHub());
    document.getElementById('endRetry').addEventListener('click', () => { UIManager.hideEnd(); this.restart(); });
    document.getElementById('endHub').addEventListener('click', () => { UIManager.hideEnd(); this.backToHub(); });
    document.getElementById('volSlider').addEventListener('input', e => AudioManager.setVolume(e.target.value / 100));
    document.getElementById('sensSlider').addEventListener('input', e => Input.sensitivity = e.target.value / 5);
    document.getElementById('audioToggle').addEventListener('click', e => e.target.textContent = AudioManager.toggle() ? '🔊 الصوت: مفعّل' : '🔇 الصوت: مغلق');
    window.addEventListener('keydown', e => {
      if (e.code === 'Escape' && this.state === 'playing') this.togglePause();
    });
    // start audio on first gesture (autoplay policy)
    const unlock = () => { AudioManager.resume(); document.removeEventListener('pointerdown', unlock); };
    document.addEventListener('pointerdown', unlock);
  },

  currentIndex: -1,
  launch(i) {
    if (this.state !== 'launcher') return;
    AudioManager.resume(); AudioManager.confirm();
    this.currentIndex = i;
    const g = this.games[i];
    this.fade(true, () => {
      document.getElementById('launcher').classList.add('hidden');
      LauncherFX.stop();
      this.showLoading(g, () => {
        document.getElementById('gameTitle').textContent = g.title;
        document.getElementById('glCanvas').classList.add('show');
        SceneLoader.load(g);
        this.state = 'playing';
        this.fade(false);
        UIManager.toast('🎮 ' + g.title, g.color);
      });
    });
  },

  showLoading(g, done) {
    const ov = document.getElementById('loadScreen');
    const bar = document.getElementById('loadBar');
    const txt = document.getElementById('loadGame');
    txt.textContent = g.title;
    document.getElementById('loadIcon').textContent = g.icon;
    ov.classList.add('show'); bar.style.width = '0%';
    let p = 0;
    const tick = () => {
      p += Util.rand(8, 22);
      bar.style.width = Math.min(p, 100) + '%';
      if (p < 100) setTimeout(tick, 90);
      else setTimeout(() => { ov.classList.remove('show'); done(); }, 250);
    };
    setTimeout(tick, 120);
  },

  gameEnd(win, msg, title) {
    if (this.state !== 'playing') return;
    SceneLoader.pause();
    Input.exitLock();
    Narrator.stop();
    UIManager.end(win, title || (win ? '🏆 فوز!' : '💀 خسارة'), msg || (win ? 'أحسنت!' : 'حاول مرة أخرى'));
  },

  restart() {
    if (this.currentIndex < 0) return;
    UIManager.hideEnd();
    SceneLoader.unload();
    const g = this.games[this.currentIndex];
    document.getElementById('glCanvas').classList.add('show');
    SceneLoader.load(g);
    this.state = 'playing';
    if (this.paused) this.togglePause();
  },

  backToHub() {
    UIManager.hideEnd();
    SceneLoader.unload();
    document.getElementById('glCanvas').classList.remove('show');
    document.getElementById('pauseMenu').classList.remove('show');
    this.paused = false;
    this.fade(true, () => {
      document.getElementById('launcher').classList.remove('hidden');
      LauncherFX.start();
      this.state = 'launcher';
      this.fade(false);
    });
  },

  togglePause() {
    if (this.state !== 'playing') return;
    this.paused = !this.paused;
    document.getElementById('pauseMenu').classList.toggle('show', this.paused);
    if (this.paused) { SceneLoader.pause(); Input.exitLock(); }
    else { SceneLoader.resume(); }
  },

  fade(toBlack, cb) {
    const f = document.getElementById('fader');
    f.classList.toggle('show', toBlack);
    if (cb) setTimeout(cb, 480);
  },
};

/* ============================================================
   LAUNCHER FX — animated 3D backdrop behind the cards
   ============================================================ */
const LauncherFX = {
  raf: null, running: false,
  init() {
    const THREE = window.THREE;
    const canvas = document.getElementById('bgCanvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0a0a1f, 0.035);
    this.cam = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
    this.cam.position.set(0, 2, 12);

    this.scene.add(new THREE.AmbientLight(0x4455aa, 0.6));
    const p1 = new THREE.PointLight(0x4fc3f7, 1.2, 40); p1.position.set(-8, 6, 4); this.scene.add(p1);
    const p2 = new THREE.PointLight(0xc77dff, 1.0, 40); p2.position.set(8, -2, 6); this.scene.add(p2);

    // floating low-poly shapes
    this.shapes = [];
    const geos = [new THREE.IcosahedronGeometry(1, 0), new THREE.OctahedronGeometry(1, 0),
                  new THREE.TorusGeometry(0.8, 0.3, 8, 16), new THREE.TetrahedronGeometry(1, 0),
                  new THREE.BoxGeometry(1.4, 1.4, 1.4)];
    const cols = [0x4fc3f7, 0xc77dff, 0xffb347, 0x5ef38c, 0xff6b9d];
    for (let i = 0; i < 22; i++) {
      const m = new THREE.Mesh(geos[i % geos.length],
        new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.4, metalness: 0.5,
          transparent: true, opacity: 0.85, flatShading: true }));
      m.position.set(Util.rand(-18, 18), Util.rand(-8, 10), Util.rand(-20, 4));
      const s = Util.rand(0.4, 1.5); m.scale.setScalar(s);
      m.userData = { rx: Util.rand(-0.4, 0.4), ry: Util.rand(-0.4, 0.4), fy: Util.rand(0.3, 0.9), ph: Util.rand(0, 6) };
      this.scene.add(m); this.shapes.push(m);
    }
    // grid floor
    const grid = new THREE.GridHelper(60, 30, 0x4fc3f7, 0x222244);
    grid.position.y = -8; grid.material.opacity = 0.25; grid.material.transparent = true;
    this.scene.add(grid); this.grid = grid;

    addEventListener('resize', () => {
      if (!this.renderer) return;
      this.renderer.setSize(innerWidth, innerHeight);
      this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    });
    this.start();
    AudioManager.ambient([130, 196, 261, 329]);
  },
  start() {
    if (this.running) return;
    this.running = true; this.t = 0; this.last = performance.now();
    AudioManager.ambient([130, 196, 261, 329]);
    this._loop();
  },
  stop() { this.running = false; cancelAnimationFrame(this.raf); },
  _loop() {
    if (!this.running) return;
    const now = performance.now(); const dt = (now - this.last) / 1000; this.last = now; this.t += dt;
    this.shapes.forEach(m => {
      m.rotation.x += m.userData.rx * dt; m.rotation.y += m.userData.ry * dt;
      m.position.y += Math.sin(this.t * m.userData.fy + m.userData.ph) * dt * 0.4;
    });
    this.cam.position.x = Math.sin(this.t * 0.1) * 2;
    this.cam.lookAt(0, 0, -6);
    this.renderer.render(this.scene, this.cam);
    this.raf = requestAnimationFrame(() => this._loop());
  },
};

/* boot */
window.addEventListener('load', () => {
  if (!window.THREE) { document.body.innerHTML = '<p style="color:#fff;padding:2rem">تعذّر تحميل Three.js</p>'; return; }
  GameHub.init();
});
