import Phaser from 'phaser';

// ══════════════════════════════════════════════════════════════════════
// CHAPTER 6 — SIGNAL
// Flow:  Ch6PreloadScene → ClimbScene → ControlRoomScene → VictoryScene
//
// New model (replaces the old calculate-and-submit GameScene):
//   The survivor climbs the tower and finds 3 documents. To fire the beam
//   they must enter a PASSCODE made of 1–3 values they derive from the docs:
//     1) firing ANGLE      (E-Math: maps & scales → trig)   — always
//     2) WAVELENGTH         (Physics: v = fλ)                — physics G2/G3
//     3) EM BAND            (Physics: EM spectrum)           — physics G2/G3
//   Each correct value LOCKS in. All locked → the beam fires to Sector 7.
// ══════════════════════════════════════════════════════════════════════

const API = 'http://localhost:8000';
const ASSET_PATH = 'assets/ch6/';
const FONT  = { title: 'Orbitron', body: 'Share Tech Mono, monospace' };

// ─── Self-contained audio (no files) ─────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let _ctx = null;
const ctx = () => (_ctx ||= new AudioCtx());
function tone(freq, dur, type = 'sine', vol = 0.22) {
  try {
    const c = ctx(), o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.start(); o.stop(c.currentTime + dur);
  } catch (_) {}
}
const sfx = {
  key:     () => tone(420 + Math.random() * 60, 0.04, 'square', 0.08),
  click:   () => tone(660, 0.05, 'square', 0.1),
  lock:    () => { tone(523, 0.08); setTimeout(() => tone(784, 0.22), 80); setTimeout(() => tone(1046, 0.18), 180); },
  wrong:   () => { tone(180, 0.16, 'sawtooth', 0.18); setTimeout(() => tone(140, 0.22, 'sawtooth', 0.14), 160); },
  hint:    () => tone(440, 0.08, 'triangle', 0.12),
  charge:  () => {
    // Rising build-up — pitch sweeps up over 1.2s
    [0,120,240,360,480,600,720,900,1100].forEach((d, i) =>
      setTimeout(() => tone(80 + i * 60, 0.18, 'sawtooth', 0.1 + i * 0.01), d));
  },
  fire: () => {
    // Deep thud + high energy burst
    tone(60, 0.3, 'sawtooth', 0.3);
    setTimeout(() => tone(120, 0.25, 'sawtooth', 0.2), 80);
    [0,60,120,200,300,420,560].forEach((d, i) =>
      setTimeout(() => tone(800 + i * 220, 0.18, 'sine', 0.18), d));
  },
  impact: () => {
    tone(55, 0.4, 'sawtooth', 0.35);
    setTimeout(() => tone(110, 0.3, 'sawtooth', 0.25), 100);
    setTimeout(() => tone(880, 0.2, 'sine', 0.2), 200);
    setTimeout(() => tone(1320, 0.15, 'sine', 0.15), 350);
  },
};

// ─── Drawing helpers ──────────────────────────────────────────────────
function dot(scene) {
  if (!scene.textures.exists('p_dot')) {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4);
    g.generateTexture('p_dot', 8, 8); g.destroy();
  }
}
function burst(scene, x, y, color = 0x00ff88, count = 26, depth = 72) {
  dot(scene);
  const e = scene.add.particles(x, y, 'p_dot', {
    speed: { min: 80, max: 280 }, angle: { min: 0, max: 360 },
    scale: { start: 1.1, end: 0 }, lifespan: { min: 400, max: 900 },
    quantity: count, tint: color, emitting: false, blendMode: 'ADD',
  }).setDepth(depth);
  e.explode(count);
  scene.time.delayedCall(1000, () => e.destroy());
}
function shockwave(scene, x, y, color = 0x00ff88, depth = 72) {
  // Three expanding rings with decreasing opacity
  for (let i = 0; i < 3; i++) {
    scene.time.delayedCall(i * 100, () => {
      const ring = scene.add.graphics().setDepth(depth);
      let r = 4;
      const t = scene.time.addEvent({ delay: 14, repeat: 30, callback: () => {
        r += 7; ring.clear();
        const a = Math.max(0, 0.9 - r / 200);
        ring.lineStyle(3 - i * 0.8, color, a);
        ring.strokeCircle(x, y, r);
      }});
      scene.time.delayedCall(500, () => { scene.time.removeEvent(t); ring.destroy(); });
    });
  }
}
function hexGrid(scene, W, H, depth = 0) {
  const g = scene.add.graphics().setDepth(depth);
  g.lineStyle(1, 0x00aaff, 0.05);
  const s = 28;
  for (let row = 0; row < Math.ceil(H / (s * 1.5)) + 2; row++)
    for (let col = 0; col < Math.ceil(W / (s * 1.75)) + 2; col++) {
      const x = col * s * 1.75 + (row % 2 ? s * 0.875 : 0), y = row * s * 1.5;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        g.lineTo(x + s * Math.cos(a), y + s * Math.sin(a));
      }
      g.closePath(); g.strokePath();
    }
  return g;
}
function panel(scene, x, y, w, h, depth = 2, accent = 0x00aaff) {
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(0x0b1c2e, 0.96); g.lineStyle(1, accent, 0.6);
  g.fillRoundedRect(x, y, w, h, 4); g.strokeRoundedRect(x, y, w, h, 4);
  const s = 12; g.lineStyle(2, accent, 0.9);
  g.lineBetween(x, y + s, x, y); g.lineBetween(x, y, x + s, y);
  g.lineBetween(x + w - s, y, x + w, y); g.lineBetween(x + w, y, x + w, y + s);
  g.lineBetween(x, y + h - s, x, y + h); g.lineBetween(x, y + h, x + s, y + h);
  g.lineBetween(x + w - s, y + h, x + w, y + h); g.lineBetween(x + w, y + h, x + w, y + h - s);
  return g;
}
function btn(scene, x, y, w, h, label, fs, depth, onClick, accent = 0x00aaff) {
  const g = scene.add.graphics().setDepth(depth);
  const draw = (hover) => {
    g.clear();
    g.fillStyle(hover ? 0x123a55 : 0x001a2e, 1);
    g.lineStyle(1, hover ? 0x00ccff : accent, 0.9);
    g.fillRoundedRect(x, y, w, h, 3); g.strokeRoundedRect(x, y, w, h, 3);
  };
  draw(false);
  const t = scene.add.text(x + w / 2, y + h / 2, label, {
    fontFamily: FONT.body, fontSize: `${fs}px`, color: '#ffffff', letterSpacing: 2,
  }).setOrigin(0.5).setDepth(depth + 1);
  g.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
  g.on('pointerover', () => draw(true));
  g.on('pointerout', () => draw(false));
  g.on('pointerdown', () => { sfx.click(); onClick(); });
  return { g, t, setLabel: (s) => t.setText(s) };
}

// ─── Puzzle generator ─────────────────────────────────────────────────
function generatePuzzle(subject, difficulty) {
  const D = difficulty;

  // Map & scale → real horizontal distance
  // Smaller scale so heights and distance are comparable → meaningful angles
  const scalePools = { G1: [5, 6], G2: [4, 6, 8], G3: [3, 5, 7] };
  const cmPools    = { G1: [6, 8], G2: [7, 9, 11], G3: [6.5, 8.5, 10.5] };
  const kmPerCm = pick(scalePools[D] || scalePools.G1);
  const mapCm   = pick(cmPools[D] || cmPools.G1);
  const dist    = +(kmPerCm * mapCm).toFixed(1);   // horizontal distance, km

  // Blueprint → tower height and beam emitter height (tower is always taller)
  const beamHPools    = { G1: [30, 40], G2: [25, 35, 45], G3: [20, 30, 40, 50] };
  const towerOffPools = { G1: [10, 15], G2: [8, 12, 18], G3: [6, 10, 14, 20] };
  const beamH  = pick(beamHPools[D] || beamHPools.G1);           // km
  const towerH = beamH + pick(towerOffPools[D] || towerOffPools.G1); // km, always > beamH

  // Map → receptor height at Sector 7 (can be higher or lower than beamH)
  // Height difference sized to give a clean angle (15°–55°)
  const minDiff = Math.round(dist * 0.27);   // tan(15°) ≈ 0.27
  const maxDiff = Math.round(dist * 1.0);    // tan(45°) = 1.0
  const step    = Math.round(dist * 0.15) || 1;
  const diffs   = [];
  for (let d = minDiff; d <= maxDiff; d += step) diffs.push(d);
  const heightDiff = pick(diffs.length ? diffs : [minDiff]);
  const elevate    = Math.random() > 0.5;   // elevation or depression
  const receptorH  = elevate ? beamH + heightDiff : Math.max(1, beamH - heightDiff);
  const actualDiff = Math.abs(receptorH - beamH);
  const theta      = +(Math.atan(actualDiff / dist) * 180 / Math.PI).toFixed(1);
  const angleType  = receptorH > beamH ? 'elevation' : 'depression';

  // Manual → beam speed + frequency (Physics: v = fλ)
  const freqPools = {
    G1: [{ f: 5e6,   label: '5 MHz'   }, { f: 10e6, label: '10 MHz'  }],
    G2: [{ f: 7.5e6, label: '7.5 MHz' }, { f: 15e6, label: '15 MHz'  }],
    G3: [{ f: 6e6,   label: '6 MHz'   }, { f: 12e6, label: '12 MHz'  }],
  };
  const v  = 3e8;
  const fp = pick(freqPools[D] || freqPools.G1);
  const lambda = +(v / fp.f).toFixed(1);

  // Locks
  const physics = subject === 'physics' && D !== 'G1';
  const locks = [
    {
      id: 'angle', label: 'FIRING ANGLE', unit: '°', type: 'num',
      answer: theta, tol: 0.5,
      syllabus: 'E-Math: Maps & Scales + Trigonometry',
    },
  ];
  if (physics) {
    locks.push({
      id: 'lambda', label: 'WAVELENGTH', unit: 'm', type: 'num',
      answer: lambda, tol: 2,
      syllabus: 'Physics: Wave Equation v = fλ',
    });
    locks.push({
      id: 'band', label: 'EM BAND', unit: '', type: 'choice',
      options: ['Radio', 'Microwave', 'Infrared', 'X-ray'],
      answer: 0,
      syllabus: 'Physics: Electromagnetic Spectrum',
    });
  }

  return { kmPerCm, mapCm, dist, beamH, towerH, receptorH, heightDiff: actualDiff,
           theta, angleType, v, freq: fp.f, freqLabel: fp.label, lambda, locks,
           subject, difficulty: D };
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ══════════════════════════════════════════════════════════════════════
// PRELOAD — attempts to load AI art; missing files fall back to code art
// ══════════════════════════════════════════════════════════════════════
export class Ch6PreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'Ch6PreloadScene' }); }

  init(data) { this._data = data || {}; }

  preload() {
    const W = this.scale.width, H = this.scale.height;
    this.cameras.main.setBackgroundColor('#050a0f');
    this.add.text(W / 2, H / 2, 'LOADING…', {
      fontFamily: FONT.title, fontSize: '18px', color: '#00aaff', letterSpacing: 4,
    }).setOrigin(0.5);

    // Track which assets actually load
    this.loaded = {};
    this.load.on('loaderror', () => {});  // swallow missing-file errors
    this.load.on('filecomplete', (key) => { this.loaded[key] = true; });

    const tryImg = (key, file) => this.load.image(key, ASSET_PATH + file);
    tryImg('ch6_bg',        'scene_bg.jpg');
    tryImg('ch6_char',      'character.png');
    tryImg('ch6_blueprint', 'doc_blueprint.png');
    tryImg('ch6_map',       'doc_map.png');
    tryImg('ch6_manual',    'doc_manual.png');
  }

  create() {
    // Stash which textures exist so later scenes can choose art vs fallback
    this.registry.set('ch6Assets', {
      bg:        this.textures.exists('ch6_bg'),
      char:      this.textures.exists('ch6_char'),
      blueprint: this.textures.exists('ch6_blueprint'),
      map:       this.textures.exists('ch6_map'),
      manual:    this.textures.exists('ch6_manual'),
    });
    this.scene.start('ClimbScene', this._data);
  }
}

// ══════════════════════════════════════════════════════════════════════
// CLIMB SCENE — survivor ascends the tower, narration beats
// ══════════════════════════════════════════════════════════════════════
export class ClimbScene extends Phaser.Scene {
  constructor() { super({ key: 'ClimbScene' }); }

  create(data = {}) {
    this.scale.once('resize', () => this.scene.restart(data));
    this._data = data;
    const W = this.scale.width, H = this.scale.height;
    const assets = this.registry.get('ch6Assets') || {};

    this.cameras.main.setBackgroundColor('#0a0e12');

    // Background — AI image (cover) or code-drawn dead-earth + tower
    if (assets.bg) {
      const img = this.add.image(W / 2, H / 2, 'ch6_bg').setDepth(0);
      const sc = Math.max(W / img.width, H / img.height);
      img.setScale(sc).setAlpha(0.85);
    } else {
      this._drawFallbackWorld(W, H);
    }
    // Dark vignette for text legibility
    const vg = this.add.graphics().setDepth(1);
    vg.fillStyle(0x000000, 0.45); vg.fillRect(0, 0, W, H);

    if (assets.char) {
      // Dedicated climbing-character sprite rises up the screen
      const charObj = this.add.image(W * 0.5, H * 0.85, 'ch6_char').setDepth(3);
      charObj.setScale(Math.min(1, (H * 0.18) / charObj.height));
      this.tweens.add({ targets: charObj, y: H * 0.45, duration: 3200, ease: 'Sine.easeInOut' });
    } else if (assets.bg) {
      // Scene already shows the survivor — do a slow cinematic push-in instead
      const img = this.children.list.find(c => c.texture && c.texture.key === 'ch6_bg');
      if (img) this.tweens.add({ targets: img, scale: img.scale * 1.12, duration: 5000, ease: 'Sine.easeInOut' });
    } else {
      // Pure fallback: animated stick-figure climbing the drawn tower
      const charObj = this.add.graphics().setDepth(3);
      const drawChar = (cy) => {
        charObj.clear();
        charObj.fillStyle(0x111820, 1); charObj.lineStyle(2, 0x00ccff, 0.9);
        charObj.fillCircle(W * 0.5, cy - 22, 7); charObj.strokeCircle(W * 0.5, cy - 22, 7);
        charObj.lineBetween(W * 0.5, cy - 15, W * 0.5, cy);
        charObj.lineBetween(W * 0.5, cy - 10, W * 0.5 - 9, cy - 18);
        charObj.lineBetween(W * 0.5, cy - 10, W * 0.5 + 9, cy - 4);
        charObj.lineBetween(W * 0.5, cy, W * 0.5 - 7, cy + 12);
        charObj.lineBetween(W * 0.5, cy, W * 0.5 + 7, cy + 12);
      };
      drawChar(H * 0.85);
      this.tweens.add({
        targets: { y: H * 0.85 }, y: H * 0.42, duration: 3200, ease: 'Sine.easeInOut',
        onUpdate: (tw, t) => drawChar(t.y),
      });
    }

    // Narration — one sentence per line, no wordWrap
    const lines = [
      'YEAR 2197.  The air is poison.  The sky never clears.',
      'You cross the dead rock and stop.',
      'An old signal tower.  Far off: faint domes.  Sector 7.',
      'You climb.  At the top: a control room.  Three things left behind.',
    ].join('\n');

    const pad = Math.max(12, W * 0.04);
    const boxH = 148;
    const box = panel(this, pad, H - boxH - 10, W - pad * 2, boxH, 4);
    const txt = this.add.text(pad + 14, H - boxH - 10 + 14, '', {
      fontFamily: FONT.body, fontSize: '13px',
      color: '#cfe6ff', lineSpacing: 8,
    }).setDepth(5);

    let i = 0;
    this.time.addEvent({
      delay: 26, repeat: lines.length - 1,
      callback: () => { txt.text += lines[i]; if (lines[i] !== ' ' && i % 2 === 0) sfx.key(); i++; },
    });

    this.time.delayedCall(lines.length * 26 + 500, () => {
      const bw = Math.min(240, W * 0.6), bh = 44;
      btn(this, W / 2 - bw / 2, H - 44 - 8, bw, bh, 'ENTER CONTROL ROOM',
        Math.min(13, W * 0.02), 5,
        () => this.scene.start('ControlRoomScene', this._data), 0xff8800);
    });
  }

  _drawFallbackWorld(W, H) {
    // Sky gradient (toxic haze)
    const g = this.add.graphics().setDepth(0);
    const bands = 16;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const r = Math.round(0x3a + (0x1a - 0x3a) * t);
      const gg = Math.round(0x2e + (0x14 - 0x2e) * t);
      const b = Math.round(0x22 + (0x1a - 0x22) * t);
      g.fillStyle((r << 16) | (gg << 8) | b, 1);
      g.fillRect(0, H * i / bands, W, H / bands + 1);
    }
    // Ground
    g.fillStyle(0x12100c, 1); g.fillRect(0, H * 0.82, W, H * 0.18);
    // Tower silhouette
    const tw = W * 0.34, tx = W / 2 - tw / 2;
    g.fillStyle(0x1c2630, 1);
    g.fillRect(tx, H * 0.05, tw, H * 0.77);
    g.fillStyle(0x232f3b, 1);
    g.fillRect(tx + tw * 0.15, H * 0.02, tw * 0.5, H * 0.1);   // top block
    // Window lights
    for (let r = 0; r < 14; r++)
      for (let c = 0; c < 4; c++) {
        if (Math.random() > 0.5) continue;
        g.fillStyle(Math.random() > 0.7 ? 0xff8800 : 0x00ccff, 0.7);
        g.fillRect(tx + 12 + c * (tw / 4), H * 0.1 + r * (H * 0.7 / 14), 5, 4);
      }
    // Antenna glow
    g.lineStyle(2, 0x00ffff, 1); g.lineBetween(W / 2, H * 0.02, W / 2, H * 0.02 - 18);
    g.fillStyle(0x00ffff, 1); g.fillCircle(W / 2, H * 0.02 - 18, 4);
  }
}

// ══════════════════════════════════════════════════════════════════════
// CONTROL ROOM — documents + passcode locks + fire sequence
// ══════════════════════════════════════════════════════════════════════
export class ControlRoomScene extends Phaser.Scene {
  constructor() { super({ key: 'ControlRoomScene' }); }

  create(data = {}) {
    this.scale.once('resize', () => this.scene.restart(data));
    this._data = data;
    this.profile = { subject: data.subject || 'emath', difficulty: data.difficulty || 'G1' };
    this.sessionId = data.sessionId || null;
    this.puzzle = data.puzzle || generatePuzzle(this.profile.subject, this.profile.difficulty);
    this.locks = this.puzzle.locks;
    this.activeLock = 0;
    this.entry = '';
    this.choiceIdx = 0;
    this.wrongTotal = 0;
    this.hintsUsed = 0;
    this.firing = false;

    const W = this.scale.width, H = this.scale.height;
    const pad = Math.max(10, W * 0.025);
    this.W = W; this.H = H; this.pad = pad;
    const assets = this.registry.get('ch6Assets') || {};

    // Background
    this.cameras.main.setBackgroundColor('#050a0f');
    if (assets.bg) {
      const img = this.add.image(W / 2, H / 2, 'ch6_bg').setDepth(0);
      img.setScale(Math.max(W / img.width, H / img.height)).setAlpha(0.28);
    }
    hexGrid(this, W, H, 0);

    // Title bar
    const tb = this.add.graphics().setDepth(2);
    tb.fillStyle(0x020810, 0.95); tb.lineStyle(1, 0xff3333, 0.5);
    tb.fillRect(0, 0, W, 38); tb.strokeRect(0, 0, W, 38);
    this.add.text(W / 2, 19, 'TOWER CONTROL  —  SECTOR 7 UPLINK', {
      fontFamily: FONT.title, fontSize: `${Math.min(13, W * 0.024)}px`,
      color: '#ff5555', letterSpacing: 3,
    }).setOrigin(0.5).setDepth(3);

    this._buildDocTabs();
    this._buildLockPanel();
    this._buildKeypad();
    this._buildFireButton();
    this._buildDocOverlay();
    this._buildHintOverlay();
    this._refreshLocks();
  }

  // ── Document tabs ───────────────────────────────────────────────────
  _buildDocTabs() {
    const { W, pad } = this;
    const y = 46, h = 40;
    const tabs = [
      { key: 'blueprint', label: 'BLUEPRINT' },
      { key: 'map',       label: 'MAP' },
      { key: 'manual',    label: 'MANUAL' },
    ];
    const tw = (W - pad * 2 - 12) / 3;
    tabs.forEach((t, i) => {
      const x = pad + i * (tw + 6);
      const g = this.add.graphics().setDepth(3);
      g.fillStyle(0x06263a, 1); g.lineStyle(1, 0x00ccff, 0.6);
      g.fillRoundedRect(x, y, tw, h, 3); g.strokeRoundedRect(x, y, tw, h, 3);
      this.add.text(x + tw / 2, y + h / 2, t.label, {
        fontFamily: FONT.body, fontSize: `${Math.min(11, W * 0.018)}px`, color: '#aaddff',
      }).setOrigin(0.5).setDepth(4);
      g.setInteractive(new Phaser.Geom.Rectangle(x, y, tw, h), Phaser.Geom.Rectangle.Contains);
      g.on('pointerover', () => { g.clear(); g.fillStyle(0x0a3a55, 1); g.lineStyle(1, 0x00ccff, 1); g.fillRoundedRect(x, y, tw, h, 3); g.strokeRoundedRect(x, y, tw, h, 3); });
      g.on('pointerout',  () => { g.clear(); g.fillStyle(0x06263a, 1); g.lineStyle(1, 0x00ccff, 0.6); g.fillRoundedRect(x, y, tw, h, 3); g.strokeRoundedRect(x, y, tw, h, 3); });
      g.on('pointerdown', () => { sfx.click(); this._showDoc(t.key); });
    });
    this.add.text(W / 2, y + h + 9, 'tap a document to read its data', {
      fontFamily: FONT.body, fontSize: '9px', color: '#557799',
    }).setOrigin(0.5).setDepth(4);
  }

  // ── Lock panel ──────────────────────────────────────────────────────
  _buildLockPanel() {
    const { W, H, pad } = this;
    const y = 104;
    const rowH = 42;
    const h = 22 + this.locks.length * (rowH + 6) + 8;
    this.lockPanelY = y;
    panel(this, pad, y, W - pad * 2, h, 3, 0xff8800);
    this.add.text(pad + 10, y + 4, 'BEAM PASSCODE', {
      fontFamily: FONT.title, fontSize: '10px', color: '#ff8800', letterSpacing: 2,
    }).setDepth(4);

    this.lockRows = [];
    this.locks.forEach((lock, i) => {
      const ry = y + 24 + i * (rowH + 6);
      const rx = pad + 8, rw = W - pad * 2 - 16;
      const g = this.add.graphics().setDepth(4);
      const labelTxt = this.add.text(rx + 10, ry + 6, lock.label, {
        fontFamily: FONT.body, fontSize: `${Math.min(12, W * 0.019)}px`, color: '#cfe6ff',
      }).setDepth(5);
      const valTxt = this.add.text(rx + rw - 64, ry + rowH / 2, '— — —', {
        fontFamily: FONT.body, fontSize: `${Math.min(15, W * 0.024)}px`, color: '#00ff88',
      }).setOrigin(1, 0.5).setDepth(5);
      const statusTxt = this.add.text(rx + rw - 12, ry + rowH / 2, 'OPEN', {
        fontFamily: FONT.body, fontSize: '10px', color: '#557799',
      }).setOrigin(1, 0.5).setDepth(5);
      g.setInteractive(new Phaser.Geom.Rectangle(rx, ry, rw, rowH), Phaser.Geom.Rectangle.Contains);
      g.on('pointerdown', () => { if (!this.locks[i].done && !this.firing) { sfx.click(); this.activeLock = i; this.entry = ''; this._refreshLocks(); } });
      this.lockRows.push({ g, labelTxt, valTxt, statusTxt, rx, ry, rw, rowH });
    });
  }

  _refreshLocks() {
    this.lockRows.forEach((row, i) => {
      const lock = this.locks[i];
      const active = i === this.activeLock && !lock.done;
      row.g.clear();
      row.g.fillStyle(lock.done ? 0x06301a : (active ? 0x0a2a40 : 0x081420), 1);
      row.g.lineStyle(active ? 2 : 1, lock.done ? 0x00ff88 : (active ? 0xffaa00 : 0x335577), active ? 1 : 0.6);
      row.g.fillRoundedRect(row.rx, row.ry, row.rw, row.rowH, 3);
      row.g.strokeRoundedRect(row.rx, row.ry, row.rw, row.rowH, 3);

      row.statusTxt.setText(lock.done ? 'LOCKED' : 'OPEN').setColor(lock.done ? '#00ff88' : (active ? '#ffaa00' : '#557799'));
      let shown;
      if (lock.done) shown = lock.type === 'choice' ? lock.options[lock.answer] : `${lock.answer}${lock.unit}`;
      else if (active) {
        if (lock.type === 'choice') shown = `< ${lock.options[this.choiceIdx]} >`;
        else shown = (this.entry || '___') + lock.unit;
      } else shown = '— — —';
      row.valTxt.setText(shown).setColor(lock.done ? '#00ff88' : (active ? '#ffdd88' : '#446688'));
    });
    // Keypad vs choice controls
    const lock = this.locks[this.activeLock];
    const isChoice = lock && lock.type === 'choice' && !lock.done;
    this.keypadBtns.forEach(b => b.setVisible(!isChoice));
    this.choiceCtrls.forEach(b => b.setVisible(isChoice));
    this._updateFireBtn();
  }

  // ── Keypad (full, including the 1-2-3 row) ──────────────────────────
  _buildKeypad() {
    const { W, H, pad } = this;
    const top = this.lockPanelY + 22 + this.locks.length * 48 + 14;
    const fireH = 46;
    const hintH = 34;
    const gridH = H - top - fireH - hintH - pad - 10;
    // On short screens (landscape mobile) shrink buttons so everything fits
    const bh = Math.max(28, Math.min(46, (gridH - 4 * 5) / 5));
    const bw = (W - pad * 2 - 12) / 3;
    this.keypadTop = top; this.keypadBtnH = bh;
    this.keypadBtns = [];

    const rows = [['1','2','3'],['4','5','6'],['7','8','9'],['.','0','⌫']];
    rows.forEach((row, ri) => {
      row.forEach((key, ci) => {
        const x = pad + ci * (bw + 6), y = top + ri * (bh + 6);
        const g = this.add.graphics().setDepth(4);
        const draw = (hover) => {
          g.clear();
          g.fillStyle(hover ? 0x0a2a40 : 0x081826, 1);
          g.lineStyle(1, hover ? 0x00ccff : 0x2a5577, 0.9);
          g.fillRoundedRect(x, y, bw, bh, 3); g.strokeRoundedRect(x, y, bw, bh, 3);
        };
        draw(false);
        const t = this.add.text(x + bw / 2, y + bh / 2, key, {
          fontFamily: FONT.body, fontSize: `${Math.min(20, bh * 0.5)}px`, color: '#ffffff',
        }).setOrigin(0.5).setDepth(5);
        g.setInteractive(new Phaser.Geom.Rectangle(x, y, bw, bh), Phaser.Geom.Rectangle.Contains);
        g.on('pointerover', () => draw(true));
        g.on('pointerout', () => draw(false));
        g.on('pointerdown', () => this._press(key));
        this.keypadBtns.push(g, t);
      });
    });

    // SET / ENTER button (validates active lock) on the last row, replacing nothing — add below
    const setY = top + 4 * (bh + 6);
    this.setBtn = btn(this, pad, setY, W - pad * 2, bh, '✓  ENTER CODE', Math.min(13, W * 0.02), 4,
      () => this._submitEntry(), 0x00ccff);
    this.keypadBtns.push(this.setBtn.g, this.setBtn.t);

    // Hint button (small, top-right of keypad area)
    this.hintBtn = btn(this, pad, setY, 0, 0, '', 1, 4, () => {});  // placeholder removed below
    this.hintBtn.g.destroy(); this.hintBtn.t.destroy();

    // Choice controls (for EM band) — hidden unless active lock is a choice
    this.choiceCtrls = [];
    const cy = top, ch = bh * 2 + 6;
    const prevB = btn(this, pad, cy, bw, ch, '< PREV', 16, 4, () => { this._cycleChoice(-1); }, 0xffaa00);
    const okB   = btn(this, pad + bw + 6, cy, bw, ch, 'SELECT', Math.min(13, W * 0.02), 4, () => this._submitEntry(), 0x00ccff);
    const nextB = btn(this, pad + (bw + 6) * 2, cy, bw, ch, 'NEXT >', 16, 4, () => { this._cycleChoice(1); }, 0xffaa00);
    this.choiceCtrls.push(prevB.g, prevB.t, okB.g, okB.t, nextB.g, nextB.t);
    this.choiceCtrls.forEach(b => b.setVisible(false));

    // Small HINT chip
    const hy = setY + bh + 6;
    this._hintChipY = hy;
  }

  _press(key) {
    const lock = this.locks[this.activeLock];
    if (!lock || lock.done || lock.type === 'choice') return;
    sfx.key();
    if (key === '⌫') this.entry = this.entry.slice(0, -1);
    else if (this.entry.length < 7) this.entry += key;
    this._refreshLocks();
  }

  _cycleChoice(dir) {
    const lock = this.locks[this.activeLock];
    if (!lock || lock.type !== 'choice') return;
    sfx.click();
    const n = lock.options.length;
    this.choiceIdx = (this.choiceIdx + dir + n) % n;
    this._refreshLocks();
  }

  _submitEntry() {
    const lock = this.locks[this.activeLock];
    if (!lock || lock.done || this.firing) return;
    let correct = false;
    let given;
    if (lock.type === 'choice') {
      given = lock.options[this.choiceIdx];
      correct = this.choiceIdx === lock.answer;
    } else {
      const v = parseFloat(this.entry);
      given = isNaN(v) ? null : v;
      correct = !isNaN(v) && Math.abs(v - lock.answer) <= lock.tol;
    }

    this._log(lock, given, correct);

    if (correct) {
      lock.done = true;
      sfx.lock();
      const row = this.lockRows[this.activeLock];
      // Green sweep flash across the row
      const sweep = this.add.graphics().setDepth(20);
      sweep.fillStyle(0x00ff88, 0.18);
      sweep.fillRoundedRect(row.rx, row.ry, row.rw, row.rowH, 4);
      this.tweens.add({ targets: sweep, alpha: 0, duration: 600,
        onComplete: () => sweep.destroy() });
      burst(this, row.rx + row.rw / 2, row.ry + row.rowH / 2, 0x00ff88, 18);
      burst(this, row.rx + row.rw / 2, row.ry + row.rowH / 2, 0xffffff, 8);
      // advance to next unsolved lock
      const next = this.locks.findIndex(l => !l.done);
      this.activeLock = next === -1 ? this.activeLock : next;
      this.entry = ''; this.choiceIdx = 0;
      this._refreshLocks();
      if (this.locks.every(l => l.done)) this._armed();
    } else {
      this.wrongTotal++;
      sfx.wrong();
      this.cameras.main.shake(220, 0.008);
      this.entry = '';
      this._refreshLocks();
      if (this.wrongTotal >= 3) this._missionFailed();
    }
  }

  _armed() {
    // All locks set — beam ready
    this.add.text(this.W / 2, this._fireBtnY - 12, 'ALL CODES ACCEPTED — BEAM ARMED', {
      fontFamily: FONT.body, fontSize: '10px', color: '#00ff88', letterSpacing: 1,
    }).setOrigin(0.5).setDepth(6);
    this._updateFireBtn();
  }

  // ── Fire button ─────────────────────────────────────────────────────
  _buildFireButton() {
    const { W, H, pad } = this;
    const h = Math.min(50, H * 0.08), y = H - h - 4;
    this._fireBtnY = y; this._fireBtnH = h;
    this.fireBtn = this.add.graphics().setDepth(5);
    this.fireLabel = this.add.text(W / 2, y + h / 2, 'FIRE SIGNAL', {
      fontFamily: FONT.title, fontSize: `${Math.min(16, W * 0.03)}px`, color: '#ffffff', letterSpacing: 3,
    }).setOrigin(0.5).setDepth(6);
    this.fireBtn.setInteractive(new Phaser.Geom.Rectangle(pad, y, W - pad * 2, h), Phaser.Geom.Rectangle.Contains);
    this.fireBtn.on('pointerover', () => this._updateFireBtn(true));
    this.fireBtn.on('pointerout', () => this._updateFireBtn(false));
    this.fireBtn.on('pointerdown', () => { if (this.locks.every(l => l.done) && !this.firing) this._fire(); });
    this._updateFireBtn();
  }

  _updateFireBtn(hover = false) {
    const { W, pad } = this;
    const y = this._fireBtnY, h = this._fireBtnH;
    const ready = this.locks.every(l => l.done);
    this.fireBtn.clear();
    this.fireBtn.fillStyle(ready ? (hover ? 0x771100 : 0x551100) : 0x1a1010, 1);
    this.fireBtn.lineStyle(2, ready ? 0xff3300 : 0x442222, ready ? 1 : 0.5);
    this.fireBtn.fillRoundedRect(pad, y, W - pad * 2, h, 4);
    this.fireBtn.strokeRoundedRect(pad, y, W - pad * 2, h, 4);
    this.fireLabel.setColor(ready ? '#ffffff' : '#664444');
    if (ready) {
      this.fireBtn.lineStyle(1, 0xffaa00, 0.5);
      this.fireBtn.lineBetween(pad + 14, y + h - 2, W - pad - 14, y + h - 2);
    }
  }

  // ── FIRE sequence ────────────────────────────────────────────────────
  _fire() {
    this.firing = true;
    this._updateFireBtn();
    const { W, H } = this;
    const assets = this.registry.get('ch6Assets') || {};

    // ── PHASE 0 — Fade UI out, draw fire scene ────────────────────────
    const uiObjs = this.children.list.filter(o => o.depth < 60 && o.alpha > 0);
    uiObjs.forEach(o => this.tweens.add({ targets: o, alpha: 0, duration: 500 }));

    // Always use code-drawn scene so tower tip coords are exact
    const sky = this.add.graphics().setDepth(60).setAlpha(0);
    sky.fillGradientStyle(0x000008, 0x000008, 0x00050f, 0x00050f, 1);
    sky.fillRect(0, 0, W, H);
    // Stars
    for (let i = 0; i < 80; i++) {
      const bri = Math.random() * 0.7 + 0.1;
      sky.fillStyle(0xffffff, bri);
      sky.fillRect(Math.random() * W, Math.random() * H * 0.82, bri > 0.5 ? 2 : 1, bri > 0.5 ? 2 : 1);
    }
    // Horizon glow
    sky.fillGradientStyle(0x001a08, 0x001a08, 0x000008, 0x000008, 0.7);
    sky.fillRect(0, H * 0.75, W, H * 0.08);
    // Ground
    sky.fillStyle(0x040e04, 1); sky.fillRect(0, H * 0.83, W, H * 0.17);
    this.tweens.add({ targets: sky, alpha: 1, duration: 600 });

    // ── Tower — drawn precisely so beam origin is exact ───────────────
    const tx   = W * 0.36;        // tower centre X
    const base = H * 0.83;        // ground level

    // Compute key heights
    const antennaTopY  = base - H * 0.52;  // antenna tip  ← beam fires from here
    const antennaBaseY = base - H * 0.44;
    const headTopY     = base - H * 0.42;
    const headBotY     = base - H * 0.34;
    const neckTopY     = base - H * 0.34;
    const neckBotY     = base - H * 0.26;
    const bodyTopY     = base - H * 0.26;
    const bodyBotY     = base - H * 0.12;
    const legBotY      = base;

    const tw = this.add.graphics().setDepth(61).setAlpha(0);

    // Ground glow under tower
    tw.fillStyle(0x00ff88, 0.04); tw.fillEllipse(tx, base, 140, 18);

    // Legs (two angled struts)
    tw.fillStyle(0x0e2218, 1);
    tw.fillTriangle(tx - 10, bodyBotY, tx - 42, legBotY, tx - 28, legBotY);
    tw.fillTriangle(tx + 10, bodyBotY, tx + 42, legBotY, tx + 28, legBotY);

    // Body
    tw.fillStyle(0x0c1c14, 1);
    tw.fillRect(tx - 20, bodyTopY, 40, bodyBotY - bodyTopY);
    // Body accent lines
    tw.lineStyle(1, 0x00cc66, 0.25);
    for (let y = bodyTopY + 8; y < bodyBotY; y += 14) tw.lineBetween(tx - 20, y, tx + 20, y);

    // Neck
    tw.fillStyle(0x0a1810, 1);
    tw.fillRect(tx - 14, neckTopY, 28, neckBotY - neckTopY);

    // Head (hexagonal platform)
    tw.fillStyle(0x112a1a, 1);
    tw.fillRect(tx - 28, headTopY, 56, headBotY - headTopY);
    tw.fillStyle(0x0e2218, 1);
    tw.fillRect(tx - 32, headTopY + 2, 64, 6); // top ledge
    // Dish left
    tw.lineStyle(2, 0x1a3a28, 1);
    tw.strokeEllipse(tx - 38, headTopY + 10, 22, 16);
    // Dish right
    tw.strokeEllipse(tx + 38, headTopY + 10, 22, 16);

    // Antenna
    tw.fillStyle(0x1a3a2a, 1);
    tw.fillRect(tx - 3, antennaTopY, 6, antennaBaseY - antennaTopY);

    // Cyan accent lights
    tw.fillStyle(0x00ffcc, 0.9);
    tw.fillRect(tx - 25, headTopY + 8, 4, 3);
    tw.fillRect(tx + 21, headTopY + 8, 4, 3);
    tw.fillRect(tx - 22, bodyTopY + 6, 3, 3);
    tw.fillRect(tx + 19, bodyTopY + 6, 3, 3);
    // Blinking red warning light at antenna base
    tw.fillStyle(0xff2200, 0.8);
    tw.fillCircle(tx, antennaBaseY - 2, 3);

    this.tweens.add({ targets: tw, alpha: 1, duration: 600 });

    // Blink the warning light
    const warnLight = this.add.graphics().setDepth(62);
    let warnOn = true;
    const warnT = this.time.addEvent({ delay: 400, loop: true, callback: () => {
      warnOn = !warnOn; warnLight.clear();
      if (warnOn) { warnLight.fillStyle(0xff2200, 0.9); warnLight.fillCircle(tx, antennaBaseY - 2, 3); }
    }});

    // Exact beam origin = antenna tip
    const towerX = tx;
    const towerY = antennaTopY;

    // ── PHASE 1 — CHARGE (1.4s) ───────────────────────────────────────
    sfx.charge();

    // Energy particles converging to tower tip
    dot(this);
    for (let i = 0; i < 16; i++) {
      const angle  = (i / 16) * Math.PI * 2;
      const radius = 60 + Math.random() * 50;
      const obj    = { x: towerX + Math.cos(angle) * radius, y: towerY + Math.sin(angle) * radius };
      const spark  = this.add.graphics().setDepth(67);
      this.tweens.add({
        targets: obj, x: towerX, y: towerY,
        duration: 900 + Math.random() * 500, ease: 'Quad.In',
        onUpdate: () => {
          spark.clear();
          spark.fillStyle(0x00ffff, 0.85);
          spark.fillCircle(obj.x, obj.y, 2.5);
          spark.fillStyle(0x0088ff, 0.3);
          spark.fillCircle(obj.x, obj.y, 5);
        },
        onComplete: () => spark.destroy(),
      });
    }

    // Pulsing energy core at tower tip
    const glowCore = this.add.graphics().setDepth(66);
    let ga = 0;
    const gT = this.time.addEvent({ delay: 16, repeat: 85, callback: () => {
      ga = Math.min(1, ga + 0.012); glowCore.clear();
      glowCore.fillStyle(0x0033ff, ga * 0.12); glowCore.fillCircle(towerX, towerY, 8 + ga * 55);
      glowCore.fillStyle(0x0099ff, ga * 0.25); glowCore.fillCircle(towerX, towerY, 5 + ga * 28);
      glowCore.fillStyle(0x00eeff, ga * 0.7);  glowCore.fillCircle(towerX, towerY, 3 + ga * 12);
      glowCore.fillStyle(0xffffff, ga * 0.95); glowCore.fillCircle(towerX, towerY, 2 + ga * 5);
    }});

    // ── PHASE 2 — FIRE (after 1.4s) ──────────────────────────────────
    this.time.delayedCall(1400, () => {
      glowCore.destroy(); this.time.removeEvent(gT);
      sfx.fire();
      this.cameras.main.flash(180, 255, 255, 255);
      this.cameras.main.shake(500, 0.012);

      const isElev = this.puzzle.angleType === 'elevation';
      const endX   = W * 0.80;
      const endY   = isElev ? H * 0.16 : H * 0.80;

      // Sector 7 marker
      const s7g = this.add.graphics().setDepth(64);
      s7g.fillStyle(0x00ff88, 0.12); s7g.fillCircle(endX, endY, 28);
      s7g.lineStyle(1.5, 0x00ff88, 0.45); s7g.strokeCircle(endX, endY, 28);
      s7g.lineStyle(1, 0x00ff88, 0.2); s7g.strokeCircle(endX, endY, 42);
      this.add.text(endX, endY + (isElev ? -42 : 42), 'SECTOR 7', {
        fontFamily: FONT.body, fontSize: '10px', color: '#00ff88', letterSpacing: 2,
      }).setOrigin(0.5).setDepth(65);

      // ── Beam graphics (5 layers for real glow) ──
      const bOuter  = this.add.graphics().setDepth(67); // widest soft glow
      const bMid    = this.add.graphics().setDepth(68); // mid glow
      const bInner  = this.add.graphics().setDepth(69); // tight glow
      const bCore   = this.add.graphics().setDepth(70); // white-hot core
      const bHead   = this.add.graphics().setDepth(71); // leading orb

      const sx = towerX, sy = towerY;
      let bp = 0;
      let pulse = 0;

      const beamT = this.time.addEvent({ delay: 13, repeat: 70, callback: () => {
        bp    = Math.min(1, bp + 0.032);
        pulse = (pulse + 0.25) % (Math.PI * 2);
        const pw = 1 + Math.sin(pulse) * 0.3; // subtle width pulse

        const cx = sx + (endX - sx) * bp;
        const cy = sy + (endY - sy) * bp;

        // Layer 1 — wide outer glow (additive feel)
        bOuter.clear();
        bOuter.lineStyle(28 * pw, 0x0011ff, 0.06);
        bOuter.lineBetween(sx, sy, cx, cy);
        bOuter.lineStyle(20 * pw, 0x0044ff, 0.09);
        bOuter.lineBetween(sx, sy, cx, cy);

        // Layer 2 — mid glow
        bMid.clear();
        bMid.lineStyle(12 * pw, 0x0088ff, 0.22);
        bMid.lineBetween(sx, sy, cx, cy);
        bMid.lineStyle(8  * pw, 0x00ccff, 0.38);
        bMid.lineBetween(sx, sy, cx, cy);

        // Layer 3 — inner bright
        bInner.clear();
        bInner.lineStyle(4 * pw, 0x44eeff, 0.75);
        bInner.lineBetween(sx, sy, cx, cy);

        // Layer 4 — white-hot core
        bCore.clear();
        bCore.lineStyle(1.5, 0xffffff, 1.0);
        bCore.lineBetween(sx, sy, cx, cy);

        // Layer 5 — leading orb
        bHead.clear();
        bHead.fillStyle(0xffffff, 1);    bHead.fillCircle(cx, cy, 5);
        bHead.fillStyle(0x00eeff, 0.7);  bHead.fillCircle(cx, cy, 11);
        bHead.fillStyle(0x0055ff, 0.25); bHead.fillCircle(cx, cy, 20);

        // Occasional side sparks
        if (Math.random() < 0.25) {
          const st = bp * 0.85;
          const spx = sx + (endX - sx) * st + (Math.random() - 0.5) * 8;
          const spy = sy + (endY - sy) * st + (Math.random() - 0.5) * 8;
          const sp  = this.add.graphics().setDepth(72);
          sp.fillStyle(0x00ffff, 0.9); sp.fillCircle(spx, spy, 2);
          this.time.delayedCall(120, () => sp.destroy());
        }
      }});

      // ── PHASE 3 — IMPACT (after beam travels) ─────────────────────
      this.time.delayedCall(1000, () => {
        this.time.removeEvent(beamT);
        sfx.impact();
        this.cameras.main.flash(250, 0, 255, 140);
        this.cameras.main.shake(500, 0.014);

        // Shockwave rings
        shockwave(this, endX, endY, 0x00ff88, 73);
        shockwave(this, endX, endY, 0x00eeff, 73);

        // Multi-colour particle explosion
        burst(this, endX, endY, 0x00ff88, 45, 74);
        burst(this, endX, endY, 0xffffff, 22, 74);
        burst(this, endX, endY, 0x00ccff, 30, 74);
        this.time.delayedCall(150, () => burst(this, endX, endY, 0xffee44, 18, 74));

        // Beam holds then fades
        this.time.delayedCall(200, () => {
          [bOuter, bMid, bInner, bCore, bHead].forEach(b =>
            this.tweens.add({ targets: b, alpha: 0, duration: 700 }));
        });

        // ── PHASE 4 — VICTORY TEXT ─────────────────────────────────
        this.time.delayedCall(400, () => {
          // Dark overlay panel
          const ovPanel = this.add.graphics().setDepth(75).setAlpha(0);
          ovPanel.fillStyle(0x000000, 0.55); ovPanel.fillRect(0, H * 0.34, W, H * 0.22);
          this.tweens.add({ targets: ovPanel, alpha: 1, duration: 300 });

          const vt = this.add.text(W / 2, H * 0.42, 'SIGNAL REACHED', {
            fontFamily: FONT.title, fontSize: `${Math.min(20, W * 0.042)}px`,
            color: '#00ff88', letterSpacing: 4,
            stroke: '#003322', strokeThickness: 4,
          }).setOrigin(0.5).setDepth(76).setAlpha(0);

          const vt2 = this.add.text(W / 2, H * 0.51, 'SECTOR 7', {
            fontFamily: FONT.title, fontSize: `${Math.min(28, W * 0.058)}px`,
            color: '#ffffff', letterSpacing: 8,
            stroke: '#00aa44', strokeThickness: 3,
          }).setOrigin(0.5).setDepth(76).setAlpha(0);

          this.tweens.add({ targets: vt,  alpha: 1, duration: 400, delay: 0 });
          this.tweens.add({ targets: vt2, alpha: 1, duration: 400, delay: 200,
            onComplete: () => {
              // Pulse the text
              this.tweens.add({ targets: [vt, vt2], alpha: 0.7, duration: 600,
                yoyo: true, repeat: 2 });
            }
          });
        });

        this.time.removeEvent(warnT); warnLight.destroy();
        this._complete();

        this.time.delayedCall(2400, () => {
          this.scene.start('VictoryScene', {
            score: { xp: this._score(), hintsUsed: this.hintsUsed, wrongAnswers: this._wrongList() },
            subject: this.profile.subject, difficulty: this.profile.difficulty, sessionId: this.sessionId,
          });
        });
      });
    });
  }

  _score() {
    const base = this.locks.length * 100;
    return Math.max(this.locks.length * 20, base - this.wrongTotal * 25 - this.hintsUsed * 10);
  }
  _wrongList() { return this._wrong || []; }

  // ── Document overlay ────────────────────────────────────────────────
  _buildDocOverlay() {
    const { W, H } = this;
    this.docDim = this.add.graphics().setDepth(40).setVisible(false);
    this.docDim.fillStyle(0x000000, 0.85); this.docDim.fillRect(0, 0, W, H);
    this.docDim.setInteractive(new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains);
    this.docDim.on('pointerdown', () => this._hideDoc());
    this.docObjs = [];
  }

  _showDoc(key) {
    this._hideDoc();
    sfx.hint();
    const { W, H } = this;
    const assets = this.registry.get('ch6Assets') || {};
    this.docDim.setVisible(true);
    const dw = Math.min(W * 0.86, 520), dh = Math.min(H * 0.74, 680);
    const dx = W / 2 - dw / 2, dy = H / 2 - dh / 2;

    const texKey = { blueprint: 'ch6_blueprint', map: 'ch6_map', manual: 'ch6_manual' }[key];
    if (assets[key]) {
      const img = this.add.image(W / 2, H / 2, texKey).setDepth(41);
      img.setScale(Math.min(dw / img.width, dh / img.height));
      this.docObjs.push(img);
    } else {
      this.docObjs.push(panel(this, dx, dy, dw, dh, 41, 0xccaa55));
    }

    // Overlay the live data (always, so puzzle works regardless of art)
    const p = this.puzzle;
    let title, lines;
    const fs = Math.min(14, W * 0.022);
    const textX = dx + 22;
    const textW = dw - 44;

    // Helper: add a line of overlay text at a given y, returns next y
    const addLine = (txt, y, opts = {}) => {
      const obj = this.add.text(textX, y, txt, {
        fontFamily: FONT.body,
        fontSize: `${fs}px`,
        color: opts.color || '#1a1208',
        backgroundColor: (assets[key] && !opts.nobg) ? '#e8dcc0cc' : undefined,
        padding: { x: 6, y: 3 },
      }).setDepth(43);
      this.docObjs.push(obj);
      return y + fs + (opts.gap || 6);
    };

    if (key === 'blueprint') {
      title = 'TOWER BLUEPRINT';
      let y = dy + 52;
      y = addLine('SIGNAL TOWER — STRUCTURAL SPEC', y, { gap: 16 });
      y = addLine(`TOWER HEIGHT:        ${p.towerH} km`, y, { color: '#7c3000', gap: 8 });
      addLine(`BEAM EMITTER HEIGHT: ${p.beamH} km`, y, { color: '#7c3000' });
    } else if (key === 'map') {
      title = 'RECOVERED MAP';
      let y = dy + 52;
      y = addLine('SECTOR 7 — LAST KNOWN POSITION', y, { gap: 16 });
      y = addLine(`MAP SCALE:   1 : ${(p.kmPerCm * 100000).toLocaleString()}`, y, { color: '#7c3000', gap: 8 });
      y = addLine(`DISTANCE TO SECTOR 7:   ${p.mapCm} cm`, y, { color: '#7c3000', gap: 8 });
      addLine(`RECEPTOR HEIGHT:   ${p.receptorH} km`, y, { color: '#7c3000' });
    } else {
      title = 'BEAM EMITTER MANUAL';
      let y = dy + 52;
      y = addLine('EMITTER CALIBRATION DATA', y, { gap: 16 });
      y = addLine(`BEAM SPEED:   3 x 10^8 m/s`, y, { color: '#7c3000', gap: 8 });
      addLine(`FREQUENCY:    ${p.freqLabel}`, y, { color: '#7c3000' });
    }

    this.docObjs.push(this.add.text(W / 2, dy + 18, title, {
      fontFamily: FONT.title, fontSize: '13px', color: '#ffcc66', letterSpacing: 2,
    }).setOrigin(0.5, 0).setDepth(43));
    this.docObjs.push(this.add.text(W / 2, dy + dh - 22, 'tap anywhere to close', {
      fontFamily: FONT.body, fontSize: '10px', color: '#998866',
    }).setOrigin(0.5).setDepth(43));
  }

  _hideDoc() {
    this.docDim.setVisible(false);
    this.docObjs.forEach(o => o.destroy());
    this.docObjs = [];
  }

  // ── Hint overlay (the method) ───────────────────────────────────────
  _buildHintOverlay() {
    const { W, H, pad } = this;
    // HINT chip — always sits exactly between ENTER CODE row and FIRE button
    const ch = 28;
    const cw = Math.min(160, W * 0.5);
    const cx = W / 2 - cw / 2;
    // midpoint between bottom of ENTER CODE and top of FIRE
    const enterCodeBottom = (this._hintChipY || 0);
    const fireTop = this._fireBtnY;
    const gap = fireTop - enterCodeBottom;
    const cy = gap >= ch + 8
      ? enterCodeBottom + (gap - ch) / 2   // centre in gap
      : fireTop - ch - 4;                   // squeeze above FIRE if gap is tiny
    btn(this, cx, cy, cw, ch, 'HINT: METHOD (-10 XP)', 10, 5, () => this._showHint(), 0xffaa00);

    this.hintDim = this.add.graphics().setDepth(45).setVisible(false);
    this.hintDim.fillStyle(0x000000, 0.88); this.hintDim.fillRect(0, 0, W, H);
    this.hintDim.setInteractive(new Phaser.Geom.Rectangle(0, 0, W, H), Phaser.Geom.Rectangle.Contains);
    this.hintDim.on('pointerdown', () => { this.hintDim.setVisible(false); this.hintObjs.forEach(o => o.destroy()); this.hintObjs = []; });
    this.hintObjs = [];
  }

  _showHint() {
    this.hintsUsed++;
    sfx.hint();
    const { W, H } = this;
    const p = this.puzzle;
    this.hintDim.setVisible(true);
    const dw = Math.min(W * 0.88, 480), dh = Math.min(H * 0.7, 560);
    const dx = W / 2 - dw / 2, dy = H / 2 - dh / 2;
    this.hintObjs.push(panel(this, dx, dy, dw, dh, 46, 0xffaa00));
    this.hintObjs.push(this.add.text(W / 2, dy + 14, '// METHOD //', {
      fontFamily: FONT.title, fontSize: '12px', color: '#ffaa00', letterSpacing: 3,
    }).setOrigin(0.5, 0).setDepth(47));

    const steps = [
      'STEP 1 — REAL DISTANCE',
      '  real distance = map distance x scale',
      '',
      'STEP 2 — FIRING ANGLE',
      '  tan(angle) = opposite / adjacent',
      '  angle of elevation: receptor is higher',
      '  angle of depression: receptor is lower',
    ];
    if (this.locks.some(l => l.id === 'lambda')) {
      steps.push(
        '',
        'STEP 3 — WAVELENGTH',
        '  v = f x lambda',
        '',
        'STEP 4 — EM BAND',
        '  Which wave type bounces off',
        '  the ionosphere?'
      );
    }
    this.hintObjs.push(this.add.text(dx + 18, dy + 42, steps.join('\n'), {
      fontFamily: FONT.body, fontSize: `${Math.min(13, W * 0.021)}px`,
      color: '#ffe8b0', lineSpacing: 5,
    }).setDepth(47));
    this.hintObjs.push(this.add.text(W / 2, dy + dh - 20, 'tap anywhere to close', {
      fontFamily: FONT.body, fontSize: '10px', color: '#997744',
    }).setOrigin(0.5).setDepth(47));
  }

  // ── Mission failed ──────────────────────────────────────────────────
  _missionFailed() {
    const { W, H } = this;
    this.firing = true;
    sfx.wrong();
    this.cameras.main.flash(500, 160, 0, 0);
    this.cameras.main.shake(450, 0.012);
    const ov = this.add.graphics().setDepth(70);
    ov.fillStyle(0x000000, 0.93); ov.fillRect(0, 0, W, H);
    const pw = Math.min(360, W * 0.9), ph = 220, px = W / 2 - pw / 2, py = H / 2 - ph / 2;
    panel(this, px, py, pw, ph, 71, 0xff2200);
    this.add.text(W / 2, py + 30, 'SIGNAL LOST', {
      fontFamily: FONT.title, fontSize: `${Math.min(26, W * 0.045)}px`, color: '#ff2200', letterSpacing: 5,
    }).setOrigin(0.5).setDepth(72);
    this.add.text(W / 2, py + 78, 'Too many bad passcodes.\nThe emitter locked you out.', {
      fontFamily: FONT.body, fontSize: `${Math.min(13, W * 0.02)}px`, color: '#cc6666',
      align: 'center', lineSpacing: 5,
    }).setOrigin(0.5).setDepth(72);
    const bw = Math.min(210, W * 0.6), bh = 38, bx = W / 2 - bw / 2, by = py + ph - 50;
    btn(this, bx, by, bw, bh, '[ RETRY ]', Math.min(13, W * 0.02), 72,
      () => this.scene.start('ClimbScene', this._data), 0xff2200);
  }

  // ── Backend logging ─────────────────────────────────────────────────
  _log(lock, given, correct) {
    if (!correct) { (this._wrong ||= []).push({ qId: lock.id, topic: lock.syllabus, answer: given }); }
    if (!this.sessionId) return;
    fetch(`${API}/session/${this.sessionId}/answer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_id: lock.id, syllabus_topic: lock.syllabus,
        student_answer: typeof given === 'number' ? given : null,
        correct, attempts: 1, hint_used: this.hintsUsed > 0, xp_awarded: correct ? 100 : 0,
      }),
    }).catch(() => {});
  }

  _complete() {
    if (!this.sessionId) return;
    fetch(`${API}/session/${this.sessionId}/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ xp_earned: this._score() }),
    }).catch(() => {});
  }
}
