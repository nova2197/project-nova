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
  key:     () => tone(420 + Math.random() * 60, 0.04, 'square', 0.08),  // soft typewriter key
  click:   () => tone(660, 0.05, 'square', 0.1),
  lock:    () => { tone(523, 0.08); setTimeout(() => tone(784, 0.16), 80); },
  wrong:   () => { tone(180, 0.16, 'sawtooth', 0.16); setTimeout(() => tone(140, 0.2, 'sawtooth', 0.12), 160); },
  hint:    () => tone(440, 0.08, 'triangle', 0.12),
  charge:  () => tone(120, 0.5, 'sawtooth', 0.12),
  fire:    () => [0,70,140,210,300,400].forEach((d,i) => setTimeout(() => tone(700 + i*180, 0.14, 'sine', 0.16), d)),
};

// ─── Drawing helpers ──────────────────────────────────────────────────
function dot(scene) {
  if (!scene.textures.exists('p_dot')) {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4);
    g.generateTexture('p_dot', 8, 8); g.destroy();
  }
}
function burst(scene, x, y, color = 0x00ff88, count = 26) {
  dot(scene);
  const e = scene.add.particles(x, y, 'p_dot', {
    speed: { min: 60, max: 220 }, angle: { min: 0, max: 360 },
    scale: { start: 0.9, end: 0 }, lifespan: { min: 350, max: 700 },
    quantity: count, tint: color, emitting: false,
  }).setDepth(60);
  e.explode(count);
  scene.time.delayedCall(800, () => e.destroy());
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
    const fireH = 50;
    const gridH = H - top - fireH - pad - 8;
    const bh = Math.min(46, (gridH - 4 * 6) / 5);
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
      burst(this, row.rx + row.rw - 20, row.ry + row.rowH / 2, 0x00ff88, 14);
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
    const h = 50, y = H - h - pad;
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

  // ── FIRE sequence (code-drawn beam) ─────────────────────────────────
  _fire() {
    this.firing = true;
    this._updateFireBtn();
    const { W, H } = this;

    // ── Switch to tower background scene ──────────────────────────────
    // Fade out the control room UI, reveal the tower bg beneath
    const cover = this.add.graphics().setDepth(60);
    cover.fillStyle(0x000000, 0); cover.fillRect(0, 0, W, H);
    this.tweens.add({ targets: cover, alpha: 0, duration: 0 }); // ensure visible

    // Draw the tower scene backdrop (same as ClimbScene)
    const fireScene = this.add.graphics().setDepth(60);
    const assets = this.registry.get('ch6Assets') || {};
    if (assets.bg) {
      const bg = this.add.image(W / 2, H / 2, 'ch6_bg').setDepth(60);
      bg.setScale(Math.max(W / bg.width, H / bg.height));
    } else {
      // code-drawn fallback: dark sky + ground + tower silhouette
      fireScene.fillGradientStyle(0x000510, 0x000510, 0x0a1a0a, 0x0a1a0a, 1);
      fireScene.fillRect(0, 0, W, H);
      fireScene.fillStyle(0x111a11, 1); fireScene.fillRect(0, H * 0.75, W, H * 0.25);
      // tower body
      const tx = W * 0.5, ty = H * 0.75;
      fireScene.fillStyle(0x1a2a1a, 1);
      fireScene.fillRect(tx - 18, ty - H * 0.38, 36, H * 0.38);
      fireScene.fillRect(tx - 30, ty - H * 0.12, 60, H * 0.12);
      // antenna tip
      fireScene.fillStyle(0x2a3a2a, 1);
      fireScene.fillRect(tx - 4, ty - H * 0.44, 8, H * 0.06);
    }

    // Fade UI out, tower scene in
    const uiObjs = this.children.list.filter(o => o.depth < 60);
    uiObjs.forEach(o => { this.tweens.add({ targets: o, alpha: 0, duration: 400 }); });

    // Tower top = antenna tip position
    const towerX = W * 0.5;
    const towerY = H * (assets.bg ? 0.18 : 0.31); // top of antenna

    sfx.charge();

    // Charge-up glow at tower top
    const glow = this.add.graphics().setDepth(65);
    let ga = 0;
    const gT = this.time.addEvent({ delay: 16, repeat: 38, callback: () => {
      ga = Math.min(0.7, ga + 0.02); glow.clear();
      glow.fillStyle(0x00ccff, ga * 0.4); glow.fillCircle(towerX, towerY, 6 + ga * 40);
      glow.fillStyle(0x00ffff, ga); glow.fillCircle(towerX, towerY, 4 + ga * 10);
    }});

    this.time.delayedCall(650, () => {
      glow.destroy(); this.time.removeEvent(gT);
      sfx.fire();
      this.cameras.main.flash(140, 0, 200, 255);
      this.cameras.main.shake(350, 0.007);

      // Straight beam: tower top → sector 7
      const beam = this.add.graphics().setDepth(66);
      const startX = towerX, startY = towerY;

      // Sector 7 marker — up (elevation) or down (depression)
      const isElevation = this.puzzle.angleType === 'elevation';
      const endX = W * 0.82;
      const endY = isElevation ? H * 0.18 : H * 0.78;

      const s7 = this.add.graphics().setDepth(64);
      s7.fillStyle(0x00ff88, 0.2); s7.fillCircle(endX, endY, 22);
      s7.lineStyle(2, 0x00ff88, 0.6); s7.strokeCircle(endX, endY, 22);
      this.add.text(endX, endY + (isElevation ? -34 : 34), 'SECTOR 7', {
        fontFamily: FONT.body, fontSize: '9px', color: '#00ff88',
      }).setOrigin(0.5).setDepth(65);

      // straight beam — no bounce
      let bp = 0;
      const seg = (t) => [
        startX + (endX - startX) * t,
        startY + (endY - startY) * t,
      ];
      const beamT = this.time.addEvent({ delay: 14, repeat: 60, callback: () => {
        bp = Math.min(1, bp + 0.038); beam.clear();
        // glow trail
        beam.lineStyle(8, 0x00aaff, 0.2);
        beam.beginPath();
        for (let t = 0; t <= bp; t += 0.02) { const [x, y] = seg(t); t === 0 ? beam.moveTo(x, y) : beam.lineTo(x, y); }
        beam.strokePath();
        // core beam
        beam.lineStyle(2, 0x00ffff, 1);
        beam.beginPath();
        for (let t = 0; t <= bp; t += 0.02) { const [x, y] = seg(t); t === 0 ? beam.moveTo(x, y) : beam.lineTo(x, y); }
        beam.strokePath();
        // leading dot
        const [hx, hy] = seg(bp);
        beam.fillStyle(0xffffff, 1); beam.fillCircle(hx, hy, 4);
        beam.fillStyle(0x00ffff, 0.4); beam.fillCircle(hx, hy, 10);
      }});

      this.time.delayedCall(1100, () => {
        this.time.removeEvent(beamT);
        burst(this, endX, endY, 0xffdd88, 40);
        burst(this, endX, endY, 0x00ff88, 28);
        this.cameras.main.flash(200, 0, 255, 120);
        this.add.text(W / 2, H * 0.42, 'SIGNAL REACHED SECTOR 7', {
          fontFamily: FONT.title, fontSize: `${Math.min(18, W * 0.038)}px`,
          color: '#00ff88', letterSpacing: 3,
        }).setOrigin(0.5).setDepth(68);
        this._complete();
        this.time.delayedCall(1800, () => {
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
    // small chip button — sits in the gap between ENTER CODE and FIRE
    const cw = 150, ch = 28, cx = W / 2 - cw / 2;
    const cy = Math.min(this._hintChipY || (this.lockPanelY - 34), this._fireBtnY - 42);
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
