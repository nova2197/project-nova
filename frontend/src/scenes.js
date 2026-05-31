import Phaser from 'phaser';

const API = 'http://localhost:8000';

// ─── Web Audio sound engine (no audio files needed) ───────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new AudioCtx();
  return _audioCtx;
}
function playTone(freq, dur, type = 'sine', vol = 0.25) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type; osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.start(); osc.stop(ctx.currentTime + dur);
  } catch (_) {}
}
const sfx = {
  click:   () => playTone(660,  0.06, 'square',   0.12),
  correct: () => { playTone(523, 0.1); setTimeout(() => playTone(659, 0.1), 110); setTimeout(() => playTone(784, 0.22), 220); },
  wrong:   () => { playTone(180, 0.18, 'sawtooth', 0.18); setTimeout(() => playTone(140, 0.22, 'sawtooth', 0.14), 200); },
  hint:    () => playTone(440,  0.09, 'triangle',  0.14),
  signal:  () => {
    [0,80,160,240,320].forEach((d, i) => setTimeout(() => playTone(880 + i * 220, 0.12, 'sine', 0.18), d));
  },
  type:    () => playTone(800 + Math.random() * 200, 0.03, 'square', 0.05),
};

// ─── Particle helper ─────────────────────────────────────────────────
function ensureParticleTex(scene) {
  if (!scene.textures.exists('dot')) {
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1); g.fillCircle(4, 4, 4);
    g.generateTexture('dot', 8, 8); g.destroy();
  }
}

function burstParticles(scene, x, y, color = 0x00ff88, count = 28) {
  ensureParticleTex(scene);
  const emitter = scene.add.particles(x, y, 'dot', {
    speed: { min: 60, max: 200 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.9, end: 0 },
    lifespan: { min: 400, max: 700 },
    quantity: count,
    tint: color,
    emitting: false,
  }).setDepth(50);
  emitter.explode(count);
  scene.time.delayedCall(800, () => emitter.destroy());
}

function signalBeamEffect(scene, W, H) {
  ensureParticleTex(scene);
  // Animated beam: tower (bottom-left area) → ionosphere (top) → receiver (top-right)
  const g = scene.add.graphics().setDepth(48);
  const tx = W * 0.15, ty = H * 0.75;
  const mx = W * 0.5,  my = H * 0.12;
  const rx = W * 0.85, ry = H * 0.75;

  let t = 0;
  const tween = scene.time.addEvent({
    delay: 16, repeat: 80,
    callback: () => {
      g.clear();
      t += 0.025;
      const p1 = Math.min(1, t * 2);
      const p2 = Math.max(0, Math.min(1, t * 2 - 1));
      // Leg 1: tower → ionosphere
      const ix = tx + (mx - tx) * p1, iy = ty + (my - ty) * p1;
      g.lineStyle(2, 0x00ccff, 0.8 * p1);
      g.lineBetween(tx, ty, ix, iy);
      // Leg 2: ionosphere → receiver
      if (p2 > 0) {
        const jx = mx + (rx - mx) * p2, jy = my + (ry - my) * p2;
        g.lineStyle(2, 0x00ff88, 0.8 * p2);
        g.lineBetween(mx, my, jx, jy);
      }
      // Pulse dot
      g.fillStyle(0x00ccff, 0.9);
      g.fillCircle(ix, iy, 4);
    },
  });
  scene.time.delayedCall(1400, () => { tween.destroy(); g.destroy(); });
}

// ─── Shared drawing helpers ───────────────────────────────────────────
function drawHexGrid(scene, W, H) {
  const g = scene.add.graphics().setDepth(0);
  g.lineStyle(1, 0x00aaff, 0.05);
  const size = 28;
  const cols = Math.ceil(W / (size * 1.75)) + 2;
  const rows = Math.ceil(H / (size * 1.5)) + 2;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * size * 1.75 + (row % 2 === 0 ? 0 : size * 0.875);
      const y = row * size * 1.5;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        g.lineTo(x + size * Math.cos(a), y + size * Math.sin(a));
      }
      g.closePath(); g.strokePath();
    }
  }
}

function scanLines(scene, W, H) {
  const g = scene.add.graphics().setDepth(1);
  for (let y = 0; y < H; y += 4) { g.lineStyle(1, 0x000000, 0.12); g.lineBetween(0, y, W, y); }
}

function drawPanel(scene, x, y, w, h, depth = 2) {
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(0x0b1c2e, 0.96); g.lineStyle(1, 0x00aaff, 0.6);
  g.fillRoundedRect(x, y, w, h, 3); g.strokeRoundedRect(x, y, w, h, 3);
  g.fillStyle(0x00aaff, 0.10); g.fillRect(x + 1, y + 1, w - 2, 24);
  const s = 12; g.lineStyle(2, 0x00aaff, 0.9);
  g.lineBetween(x, y + s, x, y); g.lineBetween(x, y, x + s, y);
  g.lineBetween(x + w - s, y, x + w, y); g.lineBetween(x + w, y, x + w, y + s);
  g.lineBetween(x, y + h - s, x, y + h); g.lineBetween(x, y + h, x + s, y + h);
  g.lineBetween(x + w - s, y + h, x + w, y + h); g.lineBetween(x + w, y + h, x + w, y + h - s);
  g.lineStyle(1, 0xff3333, 0.4); g.lineBetween(x + s, y + h, x + w - s, y + h);
  return g;
}

function drawBtn(g, x, y, w, h, hover, accent = 0x00aaff) {
  g.fillStyle(hover ? 0x003355 : 0x001a2e, 1);
  g.lineStyle(1, hover ? 0x00ccff : accent, 0.9);
  g.fillRoundedRect(x, y, w, h, 3); g.strokeRoundedRect(x, y, w, h, 3);
  g.lineStyle(1, 0xff3333, 0.35); g.lineBetween(x + 8, y + h - 1, x + w - 8, y + h - 1);
}

function makeBtn(scene, x, y, w, h, label, fontSize, depth, onClick) {
  const g = scene.add.graphics().setDepth(depth);
  drawBtn(g, x, y, w, h, false);
  const t = scene.add.text(x + w / 2, y + h / 2, label, {
    fontSize: `${fontSize}px`, fontFamily: 'Courier New', color: '#ffffff', letterSpacing: 2,
  }).setOrigin(0.5).setDepth(depth + 1);
  g.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
  g.on('pointerover', () => { g.clear(); drawBtn(g, x, y, w, h, true); });
  g.on('pointerout',  () => { g.clear(); drawBtn(g, x, y, w, h, false); });
  g.on('pointerdown', () => { sfx.click(); onClick(); });
  return { g, t };
}

function titleBar(scene, W, text) {
  const bar = scene.add.graphics().setDepth(2);
  bar.fillStyle(0x020810, 0.95); bar.lineStyle(1, 0xff3333, 0.5);
  bar.fillRect(0, 0, W, 38); bar.strokeRect(0, 0, W, 38);
  scene.add.text(W / 2, 19, text, {
    fontSize: `${Math.min(15, W * 0.024)}px`, fontFamily: 'Georgia, serif',
    color: '#ff3333', letterSpacing: 4,
  }).setOrigin(0.5).setDepth(3);
}

// ─── 2D Signal tower diagram ──────────────────────────────────────────
function drawSignalDiagram(scene, x, y, w, h, q, depth = 5) {
  const g = scene.add.graphics().setDepth(depth);
  const labels = [];

  if (!q) return { g, labels };

  if (q.diag === 'angle' || q.diag === 'pythagoras') {
    const triBase = Math.min(w * 0.7, 160);
    const triH    = triBase * 0.4;
    const ox = x + w / 2 - triBase / 2;
    const oy = y + h - 14;

    // Ground line
    g.lineStyle(1, 0x557799, 0.8); g.lineBetween(x + 4, oy, x + w - 4, oy);

    // Tower (vertical leg)
    g.lineStyle(3, 0x00ff88, 1); g.lineBetween(ox, oy, ox, oy - triH);

    // Base (horizontal leg)
    g.lineStyle(3, 0x00ff88, 1); g.lineBetween(ox, oy, ox + triBase, oy);

    // Tower top indicator
    g.fillStyle(0x00ffaa, 1); g.fillCircle(ox, oy - triH, 4);

    // Receiver dot
    g.fillStyle(0xff8800, 1); g.fillCircle(ox + triBase, oy, 5);

    if (q.diag === 'angle') {
      // Hypotenuse dashed
      g.lineStyle(2, 0x00ccff, 0.5);
      for (let i = 0; i < 10; i++) {
        const t0 = i / 10, t1 = (i + 0.5) / 10;
        g.lineBetween(ox + t0 * triBase, oy - triH + t0 * triH, ox + t1 * triBase, oy - triH + t1 * triH);
      }
      // Arc for angle
      g.lineStyle(2, 0xffaa00, 1);
      g.beginPath();
      g.arc(ox + triBase, oy, 22, Math.PI, Math.PI + Math.atan(triH / triBase), false);
      g.strokePath();
      labels.push(scene.add.text(ox + triBase - 48, oy - 20, 'θ', { fontSize: '13px', fontFamily: 'Courier New', color: '#ffaa00' }).setDepth(depth + 1));
    } else {
      // Hypotenuse highlighted red
      g.lineStyle(3, 0xff3333, 1); g.lineBetween(ox, oy - triH, ox + triBase, oy);
      const mx = (ox + ox + triBase) / 2, my = (oy - triH + oy) / 2;
      labels.push(scene.add.text(mx + 6, my - 10, 'c = ?', { fontSize: '11px', fontFamily: 'Courier New', color: '#ff3333' }).setDepth(depth + 1));
    }

    const lfs = Math.min(10, w * 0.05);
    labels.push(
      scene.add.text(ox + triBase / 2, oy + 10, `${q.d} km`, { fontSize: `${lfs}px`, fontFamily: 'Courier New', color: '#00ff88' }).setOrigin(0.5).setDepth(depth + 1),
      scene.add.text(ox - 54, oy - triH / 2, `${q.h} km`, { fontSize: `${lfs}px`, fontFamily: 'Courier New', color: '#00ff88' }).setOrigin(0, 0.5).setDepth(depth + 1),
    );
  }

  if (q.diag === 'bearing') {
    const cx = x + w / 2, cy = y + h * 0.55;
    const sc = Math.min(w * 0.28, 70);
    // Compass rose
    g.lineStyle(1, 0x557799, 0.8);
    g.lineBetween(cx, cy - sc * 1.15, cx, cy + sc * 0.4);
    g.lineBetween(cx - sc * 0.4, cy, cx + sc * 1.15, cy);
    // Legs
    g.lineStyle(3, 0x00ff88, 1);
    g.lineBetween(cx, cy, cx + sc, cy);   // East
    g.lineBetween(cx, cy, cx, cy - sc);   // North
    // Bearing line
    g.lineStyle(2, 0xff3333, 1);
    g.lineBetween(cx, cy, cx + sc, cy - sc);
    // Right angle box
    g.lineStyle(1, 0x445566, 0.8);
    g.strokeRect(cx, cy - 10, 10, 10);
    const lfs = Math.min(9, w * 0.048);
    labels.push(
      scene.add.text(cx + 2, cy - sc * 1.15 - 4, 'N', { fontSize: `${lfs}px`, fontFamily: 'Courier New', color: '#88aacc' }).setDepth(depth + 1),
      scene.add.text(cx + sc + 4, cy + 2, `${q.bEast} km E`, { fontSize: `${lfs}px`, fontFamily: 'Courier New', color: '#00ff88' }).setDepth(depth + 1),
      scene.add.text(cx - 60, cy - sc / 2, `${q.bNorth} km N`, { fontSize: `${lfs}px`, fontFamily: 'Courier New', color: '#00ff88' }).setDepth(depth + 1),
    );
  }

  if (q.diag === 'wave') {
    const wY = y + h * 0.55, wX = x + w * 0.08, wW = w * 0.84;
    g.lineStyle(2, 0x00aaff, 1);
    g.beginPath();
    for (let px = 0; px <= wW; px++) {
      const py = Math.sin((px / wW) * Math.PI * 4) * 16;
      if (px === 0) g.moveTo(wX + px, wY + py); else g.lineTo(wX + px, wY + py);
    }
    g.strokePath();
    // λ bracket
    g.lineStyle(1, 0xffaa00, 0.8);
    g.lineBetween(wX, wY - 22, wX + wW / 4, wY - 22);
    g.lineBetween(wX, wY - 22, wX, wY); g.lineBetween(wX + wW / 4, wY - 22, wX + wW / 4, wY);
    labels.push(
      scene.add.text(wX + wW / 8, wY - 30, 'λ', { fontSize: '13px', fontFamily: 'Courier New', color: '#ffaa00' }).setOrigin(0.5).setDepth(depth + 1),
      scene.add.text(x + w / 2, wY + 28, 'λ = v / f', { fontSize: '10px', fontFamily: 'Courier New', color: '#ffdd88' }).setOrigin(0.5).setDepth(depth + 1),
    );
  }

  if (q.diag === 'em') {
    const barY = y + h * 0.5, barX = x + 6, barW = w - 12;
    const bands = [
      { label: 'Radio', color: 0x0044ff },
      { label: 'Micro', color: 0x0088ff },
      { label: 'IR',    color: 0xff4400 },
      { label: 'Vis',   color: 0x88ff00 },
      { label: 'UV',    color: 0xaa00ff },
      { label: 'X-ray', color: 0xff00aa },
      { label: 'γ',     color: 0xff0000 },
    ];
    const bw = barW / bands.length;
    bands.forEach((b, bi) => {
      const hi = bi === 0;
      g.fillStyle(b.color, hi ? 0.5 : 0.18); g.fillRect(barX + bi * bw, barY, bw - 2, 22);
      if (hi) { g.lineStyle(2, 0x00ccff, 1); g.strokeRect(barX + bi * bw, barY, bw - 2, 22); }
      labels.push(scene.add.text(barX + bi * bw + bw / 2, barY + 11, b.label, {
        fontSize: `${Math.min(8, w * 0.04)}px`, fontFamily: 'Courier New', color: hi ? '#00ccff' : '#334455',
      }).setOrigin(0.5).setDepth(depth + 1));
    });
    labels.push(scene.add.text(x + w / 2, barY + 34, '↑ used for ionospheric bounce', {
      fontSize: '8px', fontFamily: 'Courier New', color: '#00aaff',
    }).setOrigin(0.5).setDepth(depth + 1));
  }

  return { g, labels };
}

// ─── Question generator ───────────────────────────────────────────────
function generateQuestions(subject, difficulty) {
  const tiers = {
    G1: { dPool: [300, 400, 500],           hPool: [80, 100, 120] },
    G2: { dPool: [250, 350, 450, 550],      hPool: [75, 90, 110, 130] },
    G3: { dPool: [280, 340, 420, 480, 560], hPool: [85, 95, 105, 115, 125] },
  };
  const tier = tiers[difficulty] || tiers.G1;
  const d = tier.dPool[Math.floor(Math.random() * tier.dPool.length)];
  const h = tier.hPool[Math.floor(Math.random() * tier.hPool.length)];

  const theta   = Math.atan(h / d) * (180 / Math.PI);
  const pathLen = Math.sqrt(d * d + h * h);

  const questions = [
    {
      id: 'q1', diag: 'angle',
      syllabus: 'E-Math: Trigonometry — Tangent Ratio',
      text: [`Calculate the angle of elevation (θ) to`, `bounce the signal off the ionosphere.`],
      formula: `tan(θ) = opposite / adjacent\nθ = arctan(${h} / ${d})`,
      solution: [
        `tan(θ) = ${h} / ${d} = ${(h/d).toFixed(4)}`,
        `θ = arctan(${(h/d).toFixed(4)})`,
        `θ ≈ ${theta.toFixed(2)}°`,
      ],
      correct: parseFloat(theta.toFixed(2)), tolerance: 0.5, unit: '°', d, h,
    },
    {
      id: 'q2', diag: 'pythagoras',
      syllabus: 'E-Math: Pythagoras\' Theorem',
      text: [`Calculate the total signal path length (c)`, `from tower to ionosphere to receiver.`],
      formula: `c² = a² + b²\nc = √(${d}² + ${h}²)`,
      solution: [
        `c² = ${d}² + ${h}²`,
        `c² = ${d*d} + ${h*h} = ${d*d + h*h}`,
        `c = √${d*d + h*h} ≈ ${pathLen.toFixed(1)} km`,
      ],
      correct: parseFloat(pathLen.toFixed(1)), tolerance: 1.0, unit: 'km', d, h,
    },
  ];

  // Bearings only for G2 and G3
  if (difficulty === 'G2' || difficulty === 'G3') {
    const bp = {
      G2: { ePool: [120, 170, 220, 270], nPool: [180, 230, 280, 340] },
      G3: { ePool: [135, 165, 215, 245, 295], nPool: [175, 225, 265, 315, 355] },
    }[difficulty];
    const bEast  = bp.ePool[Math.floor(Math.random() * bp.ePool.length)];
    const bNorth = bp.nPool[Math.floor(Math.random() * bp.nPool.length)];
    const bearingRaw = Math.atan2(bEast, bNorth) * (180 / Math.PI);
    const bearing    = ((bearingRaw % 360) + 360) % 360;
    questions.push({
      id: 'q3', diag: 'bearing',
      syllabus: 'E-Math: Bearings — Three-Figure Bearings',
      text: [
        `The receiver is ${bEast} km east and ${bNorth} km north.`,
        `Find the bearing from the tower to the receiver.`,
      ],
      formula: `Bearing = arctan(east / north)\nConverted to 3-figure bearing`,
      solution: [
        `angle from North = arctan(${bEast} / ${bNorth})`,
        `= arctan(${(bEast/bNorth).toFixed(4)}) = ${bearingRaw.toFixed(2)}°`,
        `Bearing ≈ ${Math.round(bearing)}°  →  write as ${String(Math.round(bearing)).padStart(3,'0')}°`,
      ],
      correct: parseFloat(bearing.toFixed(1)), tolerance: 1.5, unit: '°', bEast, bNorth, d, h,
    });
  }

  if (subject === 'physics') {
    const freqPools = {
      G1: [{ f: 5e6,   label: '5 MHz'   }, { f: 10e6,  label: '10 MHz' }],
      G2: [{ f: 7.5e6, label: '7.5 MHz' }, { f: 15e6,  label: '15 MHz' }],
      G3: [{ f: 6.5e6, label: '6.5 MHz' }, { f: 12.5e6,label: '12.5 MHz' }],
    };
    const pool  = freqPools[difficulty] || freqPools.G1;
    const pick  = pool[Math.floor(Math.random() * pool.length)];
    const v     = 3e8;
    const lambda = parseFloat((v / pick.f).toFixed(1));
    questions.push({
      id: 'q4', diag: 'wave',
      syllabus: 'Physics: Waves — Wave Equation v = fλ',
      text: [`v = 3 × 10⁸ m/s, f = ${pick.label}`, `Find the wavelength λ (in metres).`],
      formula: `v = fλ   →   λ = v / f\nλ = (3×10⁸) / (${pick.f.toExponential(1)})`,
      solution: [
        `λ = v / f`,
        `λ = (3 × 10⁸) / (${pick.f.toExponential(2)})`,
        `λ = ${lambda} m`,
      ],
      correct: lambda, tolerance: 2.0, unit: 'm', freq: pick.f, freqLabel: pick.label,
    });
    questions.push({
      id: 'q5', diag: 'em',
      syllabus: 'Physics: Electromagnetic Spectrum',
      text: [`Which EM band is used for`, `ionospheric signal bounce?`],
      formula: `EM Spectrum (low → high freq):\nRadio → Microwave → IR → Visible → UV → X-ray → Gamma`,
      solution: [
        `HF Radio waves (3 – 30 MHz) bounce off the ionosphere.`,
        `Microwaves and above pass straight through.`,
        `∴ Answer: Radio waves`,
      ],
      type: 'mcq',
      options: ['Radio waves', 'Microwaves', 'Infrared', 'X-rays'],
      correctOption: 0, unit: '',
    });
  }

  return questions;
}

// Question preview text per difficulty
const DIFF_PREVIEW = {
  G1: ['Q1: Angle of elevation (tan θ)', 'Q2: Signal path (Pythagoras)'],
  G2: ['Q1: Angle of elevation (tan θ)', 'Q2: Signal path (Pythagoras)', 'Q3: Bearing (3-figure)'],
  G3: ['Q1: Angle of elevation (tan θ)', 'Q2: Signal path (Pythagoras)', 'Q3: Bearing (3-figure)'],
};
const PHYSICS_EXTRA = ['Q+: Wave equation (v = fλ)', 'Q+: EM Spectrum (MCQ)'];

// ─── BRIEFING SCENE ───────────────────────────────────────────────────
export class BriefingScene extends Phaser.Scene {
  constructor() { super({ key: 'BriefingScene' }); }

  create(data = {}) {
    this.scale.once('resize', () => this.scene.restart(data));
    const W = this.scale.width, H = this.scale.height;
    const pad = Math.max(12, W * 0.02);

    this.cameras.main.setBackgroundColor('#050a0f');
    drawHexGrid(this, W, H);
    scanLines(this, W, H);

    const diff = data.difficulty || 'G1';
    const subj = (data.subject || 'emath').toUpperCase();
    this.add.text(pad, pad, '⚡ POWER: ONLINE', { fontSize: '11px', fontFamily: 'Courier New', color: '#00ff88' }).setDepth(3);
    this.add.text(W - pad, pad, `${subj} · ${diff}`, { fontSize: '11px', fontFamily: 'Courier New', color: '#00aaff' }).setOrigin(1, 0).setDepth(3);

    const titlePanel = this.add.graphics().setDepth(2);
    titlePanel.fillStyle(0x020810, 0.95); titlePanel.lineStyle(1, 0xff3333, 0.6);
    titlePanel.fillRect(0, pad * 2 + 10, W, 36); titlePanel.strokeRect(0, pad * 2 + 10, W, 36);
    this.add.text(W / 2, pad * 2 + 28, 'CHAPTER 6  ——  SIGNAL', {
      fontSize: `${Math.min(22, W * 0.035)}px`, fontFamily: 'Georgia, serif', color: '#ff3333', letterSpacing: 6,
    }).setOrigin(0.5).setDepth(3);

    const mainY = pad * 2 + 55;
    const mainH = H - mainY - pad * 5;
    const charW = Math.min(90, W * 0.14);
    drawPanel(this, pad, mainY, charW, charW, 3);
    this.add.text(pad + charW / 2, mainY + charW + 8, 'DR. NOVA', {
      fontSize: '9px', fontFamily: 'Courier New', color: '#00aaff',
    }).setOrigin(0.5).setDepth(3);

    const dialogX = pad * 2 + charW;
    const dialogW = W - dialogX - pad;
    drawPanel(this, dialogX, mainY, dialogW, mainH, 3);
    this.add.text(dialogX + 10, mainY + 4, 'MISSION BRIEFING', {
      fontSize: '10px', fontFamily: 'Courier New', color: '#00aaff', letterSpacing: 2,
    }).setDepth(4);

    // Short lines so nothing wraps mid-sentence on any screen
    const dialogue = [
      "Water secured. Power online. Food growing.",
      " ",
      "No contact with survivors for 6 months.",
      " ",
      "We built a signal tower.",
      "To reach them — calculate the exact angle.",
      " ",
      "Get it wrong and the signal dies.",
      " ",
      "Your knowledge is our only hope.",
    ].join('\n');

    const fs = Math.min(12, W * 0.018, H * 0.016);
    const displayText = this.add.text(dialogX + 10, mainY + 28, '', {
      fontSize: `${fs}px`, fontFamily: 'Courier New', color: '#aaccdd',
      lineSpacing: Math.min(6, H * 0.006),
    }).setDepth(4);

    let i = 0;
    this.time.addEvent({
      delay: 22, repeat: dialogue.length - 1,
      callback: () => {
        displayText.text += dialogue[i];
        if (i % 3 === 0) sfx.type();
        i++;
      },
    });

    this.time.delayedCall(dialogue.length * 22 + 400, () => {
      const btnW = Math.min(200, W * 0.45), btnH = 40;
      makeBtn(this, W / 2 - btnW / 2, H - btnH - pad * 2, btnW, btnH,
        '[ ACCEPT MISSION ]', Math.min(13, W * 0.02), 4,
        () => this.scene.start('GameScene', data));
    });
  }
}

// ─── GAME SCENE ───────────────────────────────────────────────────────
// Two layout modes:
//   FiringMode  – Q1 (angle): interactive drag-to-aim + FIRE animation
//   StdMode     – Q2+ (numpad / MCQ)
// Score + profile are passed through scene.restart() data when switching modes.
export class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  create(data = {}) {
    this.scale.once('resize', () => this.scene.restart(data));
    this._data     = data;
    this.profile   = { subject: data.subject || 'emath', difficulty: data.difficulty || 'G1' };
    this.sessionId = data.sessionId || null;
    // Reuse pre-generated questions across mode switches so values stay consistent
    this.questions = data.questions || generateQuestions(this.profile.subject, this.profile.difficulty);
    this.totalQ    = this.questions.length;
    this.startAtQ  = data.startAtQ  || 0;
    this.currentQ  = this.startAtQ;
    this.score     = data.score     || { xp: 0, hintsUsed: 0, wrongAnswers: [] };
    this.attemptCount  = 0;
    this.hintUsedThisQ = false;
    this.firingAngle   = 0;
    this.isFiringMode  = (this.startAtQ === 0);  // Q1 always uses firing mode

    const W = this.scale.width, H = this.scale.height;
    const pad = Math.max(12, W * 0.02);
    this.W = W; this.H = H; this.pad = pad;

    this.cameras.main.setBackgroundColor('#050a0f');
    drawHexGrid(this, W, H);
    scanLines(this, W, H);
    titleBar(this, W, 'SIGNAL TOWER  ——  CALCULATE & FIRE');

    // XP bar (shared between modes)
    const xpBg = this.add.graphics().setDepth(2);
    xpBg.fillStyle(0x001122, 1); xpBg.fillRect(0, 38, W, 6);
    this.xpBar = this.add.graphics().setDepth(3);
    this._redrawXpBar();

    if (this.isFiringMode) this._buildFiringModeUI();
    else                   this._buildStdModeUI();

    this._buildHintPopup();
    this._loadQuestion(this.startAtQ);
  }

  // ════════════════════════════════════════════════════════════════════
  // FIRING MODE — Q1 interactive layout
  // ════════════════════════════════════════════════════════════════════
  _buildFiringModeUI() {
    const { W, H, pad } = this;
    const fs = Math.min(12, W * 0.018);
    const q1 = this.questions[0];

    // ── Firing range panel ────────────────────────────────────────
    const frY = 44, frH = Math.min(H * 0.42, 240);
    const frW = W;
    const towerX   = frW * 0.11;
    const settleX  = frW * 0.89;
    const groundY  = frY + frH * 0.87;
    const towerTopY = groundY - Math.max(20, frH * 0.12);

    // Ionosphere height: scaled so correct angle lands on settlement
    const horizDist  = settleX - towerX;
    const tanCorr    = q1.h / q1.d;
    const rawVert    = horizDist * tanCorr;
    const screenVert = Math.max(frH * 0.18, Math.min(frH * 0.58, rawVert));
    const ionoY      = towerTopY - screenVert;
    // k converts math-angle tan to screen-angle tan
    const k = screenVert / (horizDist * tanCorr);

    this._fr = { frY, frH, frW, towerX, settleX, groundY, towerTopY, ionoY, k };

    // Background — sky gradient (dark space up top → lighter atmosphere near ground)
    const bg = this.add.graphics().setDepth(3);
    const bands = 14;
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      // Lerp 0x081421 (top) → 0x16304a (bottom)
      const r = Math.round(0x08 + (0x16 - 0x08) * t);
      const gg = Math.round(0x14 + (0x30 - 0x14) * t);
      const b = Math.round(0x21 + (0x4a - 0x21) * t);
      bg.fillStyle((r << 16) | (gg << 8) | b, 1);
      bg.fillRect(0, frY + (frH * i / bands), frW, frH / bands + 1);
    }
    bg.lineStyle(1, 0x00aaff, 0.35); bg.strokeRect(0, frY, frW, frH);

    // Stars (only in upper/space region)
    const starG = this.add.graphics().setDepth(3);
    for (let i = 0; i < 30; i++) {
      const sx = ((i * 9301 + 49297) % 233280) / 233280 * W;
      const sy = frY + 4 + ((i * 7919 + 12345) % 233280) / 233280 * (ionoY - frY - 6);
      const sa = 0.4 + ((i * 3571) % 100) / 160;
      starG.fillStyle(0xffffff, sa); starG.fillCircle(sx, sy, 1);
    }

    // Ionosphere glow — brighter
    const ionoG = this.add.graphics().setDepth(4);
    ionoG.lineStyle(14, 0x00aaff, 0.12); ionoG.lineBetween(4, ionoY, W - 4, ionoY);
    ionoG.lineStyle(4,  0x00ccff, 0.45); ionoG.lineBetween(4, ionoY, W - 4, ionoY);
    ionoG.lineStyle(2,  0x66ddff, 1.0);  ionoG.lineBetween(4, ionoY, W - 4, ionoY);
    this.add.text(W - pad - 4, ionoY - 12, 'IONOSPHERE', {
      fontSize: '9px', fontFamily: 'Courier New', color: '#66ddff', letterSpacing: 1,
    }).setOrigin(1, 0).setDepth(4);

    // Ground — brighter
    const groundG = this.add.graphics().setDepth(4);
    groundG.fillStyle(0x1a3a2a, 0.5); groundG.fillRect(0, groundY, W, frY + frH - groundY);
    groundG.lineStyle(2, 0x44aa66, 0.8); groundG.lineBetween(0, groundY, W, groundY);

    // Distance labels — brighter
    this.add.text(towerX, groundY + 9, `↔ ${q1.d} km`, {
      fontSize: '9px', fontFamily: 'Courier New', color: '#88bbdd',
    }).setOrigin(0.5, 0).setDepth(4);
    this.add.text(towerX - 4, towerTopY + (groundY - towerTopY) / 2, `↕ ${q1.h} km`, {
      fontSize: '9px', fontFamily: 'Courier New', color: '#88bbdd',
    }).setOrigin(1, 0.5).setDepth(4);

    // Tower
    this._drawTower(towerX, groundY, towerTopY);

    // Settlement (dark)
    this.settlementObjs = this._makeSettlement(settleX, groundY, false);

    // Beam + arc + handle graphics
    this.beamG   = this.add.graphics().setDepth(6);
    this.arcG    = this.add.graphics().setDepth(6);
    this.handleG = this.add.graphics().setDepth(7);
    this.angleLbl = this.add.text(0, 0, '', {
      fontSize: '10px', fontFamily: 'Courier New', color: '#ffaa00',
    }).setDepth(8);

    // Drag zone over firing range
    const zone = this.add.zone(0, frY, W, frH).setOrigin(0, 0).setInteractive();
    let dragging = false;
    zone.on('pointerdown', (p) => { dragging = true; this._angleFromPointer(p); });
    this.input.on('pointermove', (p) => { if (dragging) this._angleFromPointer(p); });
    this.input.on('pointerup',   ()  => { dragging = false; });

    // ── Compact question strip (below firing range) ───────────────
    const stripY = frY + frH + 4;
    const stripH = 48;
    drawPanel(this, pad, stripY, W - pad * 2, stripH, 3);
    this.qNumText = this.add.text(pad + 10, stripY + 4, '', {
      fontSize: '10px', fontFamily: 'Courier New', color: '#ff3333', letterSpacing: 2,
    }).setDepth(4);
    this.qLine1 = this.add.text(pad + 10, stripY + 22, '', {
      fontSize: `${fs}px`, fontFamily: 'Courier New', color: '#aaccdd',
    }).setDepth(4);
    this.syllabusTag = this.add.text(pad + 10, stripY + stripH - 12, '', {
      fontSize: '9px', fontFamily: 'Courier New', color: '#334455',
    }).setDepth(4);
    // stub for shared code
    this.qLine2 = this.add.text(0, -50, '', { fontSize: '1px' });
    this.unitText = this.add.text(0, -50, '', { fontSize: '1px' });
    this.paramTexts = { dist: this.add.text(0,-50,'',{fontSize:'1px'}), height: this.add.text(0,-50,'',{fontSize:'1px'}), diff: this.add.text(0,-50,'',{fontSize:'1px'}) };

    // ── Answer input (shows typed angle) ─────────────────────────
    const ansY = stripY + stripH + 6;
    this.answerY = ansY;
    this.add.text(pad, ansY, 'ANGLE:', {
      fontSize: '10px', fontFamily: 'Courier New', color: '#88aacc', letterSpacing: 2,
    }).setDepth(4);
    const inpBox = this.add.graphics().setDepth(4);
    inpBox.fillStyle(0x010810, 1); inpBox.lineStyle(2, 0x00aaff, 0.6);
    inpBox.fillRoundedRect(pad + 58, ansY, W * 0.42 - pad, 34, 3);
    inpBox.strokeRoundedRect(pad + 58, ansY, W * 0.42 - pad, 34, 3);
    this.answer = '';
    this.answerText = this.add.text(pad + 68, ansY + 9, '', {
      fontSize: '14px', fontFamily: 'Courier New', color: '#00ff88',
    }).setDepth(5);
    this.add.text(pad + 58 + W * 0.42 - pad - 8, ansY + 9, '°', {
      fontSize: '14px', fontFamily: 'Courier New', color: '#88aacc',
    }).setOrigin(1, 0).setDepth(5);

    // ── Hint button ───────────────────────────────────────────────
    this.hintBtnY = ansY;
    const hintX = W - pad - 110;
    this.hintBtn = this.add.graphics().setDepth(4);
    this._drawHintBtnAt(hintX, ansY, false);
    this.add.text(hintX + 55, ansY + 17, '💡 HINT (-10 XP)', {
      fontSize: '9px', fontFamily: 'Courier New', color: '#ffaa00',
    }).setOrigin(0.5).setDepth(5);
    this.hintBtn.setInteractive(new Phaser.Geom.Rectangle(hintX, ansY, 110, 34), Phaser.Geom.Rectangle.Contains);
    this.hintBtn.on('pointerover', () => { this.hintBtn.clear(); this._drawHintBtnAt(hintX, ansY, true); });
    this.hintBtn.on('pointerout',  () => { this.hintBtn.clear(); this._drawHintBtnAt(hintX, ansY, false); });
    this.hintBtn.on('pointerdown', () => { sfx.hint(); this._showHint(); });
    this._hintBtnX = hintX;

    // ── Mini numpad (3 cols, 2 rows + backspace row) as alt input ─
    const npY = ansY + 40;
    const npH = Math.min(40, (H - npY - 60) / 3);
    const npW = (W - pad * 2) / 3 - 4;
    this.numPadBtns = [];
    [['7','8','9'],['4','5','6'],['⌫','0','.']].forEach((row, ri) => {
      row.forEach((key, ci) => {
        const bx = pad + ci * (npW + 4), by = npY + ri * (npH + 4);
        const bg = this.add.graphics().setDepth(4);
        bg.fillStyle(0x010810, 1); bg.lineStyle(1, 0x00aaff, 0.35);
        bg.fillRoundedRect(bx, by, npW, npH, 3); bg.strokeRoundedRect(bx, by, npW, npH, 3);
        this.add.text(bx + npW/2, by + npH/2, key, {
          fontSize: `${Math.min(14, npH * 0.45)}px`, fontFamily: 'Courier New', color: '#ffffff',
        }).setOrigin(0.5).setDepth(5);
        bg.setInteractive(new Phaser.Geom.Rectangle(bx, by, npW, npH), Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown', () => {
          sfx.click();
          if (key === '⌫') this.answer = this.answer.slice(0,-1);
          else if (this.answer.length < 7) this.answer += key;
          this.answerText.setText(this.answer);
          // Sync to firing angle
          const v = parseFloat(this.answer);
          if (!isNaN(v) && v > 0) { this.firingAngle = v; this._updateBeam(); }
        });
        bg.on('pointerover', () => { bg.clear(); bg.fillStyle(0x001a2e,1); bg.lineStyle(1,0x00ccff,0.8); bg.fillRoundedRect(bx,by,npW,npH,3); bg.strokeRoundedRect(bx,by,npW,npH,3); });
        bg.on('pointerout',  () => { bg.clear(); bg.fillStyle(0x010810,1); bg.lineStyle(1,0x00aaff,0.35); bg.fillRoundedRect(bx,by,npW,npH,3); bg.strokeRoundedRect(bx,by,npW,npH,3); });
        this.numPadBtns.push(bg);
      });
    });
    this.mcqBtns = [];

    // ── FIRE button ───────────────────────────────────────────────
    const fireY = npY + 3 * (npH + 4) + 2;
    this.fireBtn = this.add.graphics().setDepth(4);
    this._drawFireBtn(false);
    this.add.text(W / 2, fireY + (Math.min(44, H - fireY - pad)) / 2, '🔥  FIRE SIGNAL', {
      fontSize: `${Math.min(15, W * 0.038)}px`, fontFamily: 'Georgia, serif',
      color: '#ffffff', letterSpacing: 4,
    }).setOrigin(0.5).setDepth(5);
    this._fireBtnY = fireY;
    this._fireBtnH = Math.min(44, H - fireY - pad);
    this.fireBtn.setInteractive(new Phaser.Geom.Rectangle(pad, fireY, W - pad * 2, this._fireBtnH), Phaser.Geom.Rectangle.Contains);
    this.fireBtn.on('pointerover', () => { this.fireBtn.clear(); this._drawFireBtn(true); });
    this.fireBtn.on('pointerout',  () => { this.fireBtn.clear(); this._drawFireBtn(false); });
    this.fireBtn.on('pointerdown', () => this._submitFire());
  }

  _drawTower(tx, groundY, topY) {
    const g = this.add.graphics().setDepth(5);
    const h = groundY - topY, w = Math.max(6, h * 0.22);
    g.fillStyle(0x5a7088, 1); g.fillRect(tx - w/2, topY, w, h);
    g.lineStyle(1, 0x88aacc, 0.9); g.strokeRect(tx - w/2, topY, w, h);
    g.lineStyle(2, 0x00ffff, 1); g.lineBetween(tx, topY, tx, topY - 12);
    g.fillStyle(0x00ffff, 1); g.fillCircle(tx, topY - 12, 4);
    g.fillStyle(0x00ffff, 0.25); g.fillCircle(tx, topY - 12, 8);
    g.lineStyle(2, 0x5a7088, 1);
    g.lineBetween(tx - w * 1.4, groundY, tx, topY + h * 0.15);
    g.lineBetween(tx + w * 1.4, groundY, tx, topY + h * 0.15);
    this.add.text(tx, groundY + 8, 'TOWER', {
      fontSize: '8px', fontFamily: 'Courier New', color: '#88bbdd',
    }).setOrigin(0.5, 0).setDepth(5);
  }

  _makeSettlement(sx, groundY, lit) {
    const objs = [];
    const g = this.add.graphics().setDepth(5);
    // [body fill, window fill, outline]
    const fills = lit ? [0x3a5570, 0xffdd88, 0x66aaff] : [0x2a3a4d, 0x44566a, 0x5a7290];
    [[-16, 22, 11], [0, 28, 13], [18, 17, 10]].forEach(([dx, bh, bw]) => {
      g.fillStyle(fills[0], 1); g.fillRect(sx + dx - bw/2, groundY - bh, bw, bh);
      g.lineStyle(1, fills[2], 1); g.strokeRect(sx + dx - bw/2, groundY - bh, bw, bh);
      g.fillStyle(fills[1], 1);
      g.fillRect(sx + dx - 3, groundY - bh + 5, 3, 3);
      g.fillRect(sx + dx + 1, groundY - bh + 5, 3, 3);
    });
    if (lit) { g.fillStyle(0xffaa00, 0.18); g.fillEllipse(sx, groundY, 80, 18); }
    const lbl = this.add.text(sx, groundY + 8, 'SECTOR 7', {
      fontSize: '8px', fontFamily: 'Courier New', color: lit ? '#ffcc44' : '#7090b0',
    }).setOrigin(0.5, 0).setDepth(5);
    objs.push(g, lbl);
    return objs;
  }

  _drawHintBtnAt(x, y, hover) {
    this.hintBtn.clear();
    this.hintBtn.fillStyle(hover ? 0x002a3e : 0x001a2e, 1);
    this.hintBtn.lineStyle(1, 0xffaa00, hover ? 1 : 0.6);
    this.hintBtn.fillRoundedRect(x, y, 110, 34, 3);
    this.hintBtn.strokeRoundedRect(x, y, 110, 34, 3);
  }

  _drawFireBtn(hover) {
    const { W, pad } = this;
    const y = this._fireBtnY, h = this._fireBtnH;
    this.fireBtn.fillStyle(hover ? 0x550000 : 0x330000, 1);
    this.fireBtn.lineStyle(2, hover ? 0xff4400 : 0xff2200, 0.9);
    this.fireBtn.fillRoundedRect(pad, y, W - pad*2, h, 3);
    this.fireBtn.strokeRoundedRect(pad, y, W - pad*2, h, 3);
    this.fireBtn.lineStyle(1, 0xffaa00, 0.3);
    this.fireBtn.lineBetween(pad + 12, y + h - 1, W - pad - 12, y + h - 1);
  }

  _angleFromPointer(ptr) {
    const fr = this._fr;
    const dx = ptr.x - fr.towerX;
    const dy = fr.towerTopY - 10 - ptr.y;
    if (dx <= 2) return;
    const screenDeg = Math.max(1, Math.min(70, Math.atan2(dy, dx) * 180 / Math.PI));
    const mathDeg   = parseFloat(this._s2m(screenDeg, fr.k).toFixed(2));
    this.firingAngle = mathDeg;
    this.answer = String(mathDeg);
    this.answerText.setText(this.answer);
    this._updateBeam();
  }

  _m2s(mathDeg, k) {
    const r = mathDeg * Math.PI / 180;
    return Math.atan(Math.tan(r) * k) * 180 / Math.PI;
  }
  _s2m(screenDeg, k) {
    const r = screenDeg * Math.PI / 180;
    return Math.atan(Math.tan(r) / k) * 180 / Math.PI;
  }

  _updateBeam() {
    if (!this._fr) return;
    const fr = this._fr;
    this.beamG.clear(); this.arcG.clear(); this.handleG.clear();

    const mathDeg   = this.firingAngle || 0;
    const screenDeg = this._m2s(mathDeg, fr.k);
    const rad       = screenDeg * Math.PI / 180;

    // Beam path: tower top → ionosphere (hitX,ionoY) → vertical drop
    const tX = fr.towerX, tY = fr.towerTopY - 10;
    const dy1 = tY - fr.ionoY;
    const dx1 = mathDeg > 0.1 ? dy1 / Math.tan(rad) : 9999;
    const hitX = tX + dx1;
    const clampedHitX = Math.min(hitX, this.W - 4);

    // Leg 1
    const onTgt = Math.abs(hitX - fr.settleX) < fr.frW * 0.08;
    this.beamG.lineStyle(2, 0x00ccff, 0.45);
    this.beamG.lineBetween(tX, tY, clampedHitX,
      hitX > this.W - 4 ? fr.frY + 4 : fr.ionoY);

    // Leg 2 (vertical drop)
    if (hitX <= this.W - 4) {
      this.beamG.lineStyle(2, 0x00ccff, 0.28);
      this.beamG.lineBetween(hitX, fr.ionoY, hitX, fr.groundY);
      // Landing marker
      this.beamG.fillStyle(onTgt ? 0x00ff88 : 0xff4400, 0.75);
      this.beamG.fillCircle(hitX, fr.groundY, 5);
    }

    // Angle arc
    const arcR = 30;
    this.arcG.lineStyle(1, 0xffaa00, 0.25);
    this.arcG.beginPath();
    this.arcG.arc(tX, tY, arcR, 0, -Math.PI / 2, true);
    this.arcG.strokePath();

    // Handle
    const hx = tX + arcR * Math.cos(rad), hy = tY - arcR * Math.sin(rad);
    this.handleG.fillStyle(0xffaa00, 1); this.handleG.fillCircle(hx, hy, 5);
    this.handleG.lineStyle(2, 0xffaa00, 0.5); this.handleG.strokeCircle(hx, hy, 9);

    // Label
    this.angleLbl.setPosition(hx + 10, hy - 8).setText(mathDeg > 0 ? `${mathDeg.toFixed(1)}°` : '');
  }

  _animateFire(isCorrect, onDone) {
    const fr = this._fr;
    if (!fr) { onDone(); return; }
    const mathDeg   = this.firingAngle || 0;
    const screenDeg = this._m2s(mathDeg, fr.k);
    const rad       = screenDeg * Math.PI / 180;
    const tX = fr.towerX, tY = fr.towerTopY - 10;
    const dy1 = tY - fr.ionoY;
    const dx1 = mathDeg > 0.1 ? dy1 / Math.tan(rad) : 9999;
    const hitX = Math.min(tX + dx1, this.W - 4);

    // Phase 1 — charge up
    ensureParticleTex(this);
    const chargeE = this.add.particles(tX, tY, 'dot', {
      speed:{min:8,max:30}, angle:{min:200,max:340}, scale:{start:0.5,end:0},
      lifespan:280, quantity:2, tint:0x00ccff, frequency:35,
    }).setDepth(10);
    const chargeGfx = this.add.graphics().setDepth(9);
    let ga = 0;
    const chargeT = this.time.addEvent({ delay:16, repeat:22, callback:() => {
      ga = Math.min(0.38, ga + 0.03);
      chargeGfx.clear();
      chargeGfx.fillStyle(0x00aaff, ga); chargeGfx.fillCircle(tX, tY, 14 + ga * 28);
    }});

    this.time.delayedCall(420, () => {
      chargeE.destroy(); chargeGfx.destroy(); this.time.removeEvent(chargeT);
      sfx.signal();
      this.cameras.main.flash(70, 0, 160, 255);
      this.beamG.clear(); this.arcG.clear(); this.handleG.clear();

      // Phase 2 — beam extends to ionosphere
      const fireG = this.add.graphics().setDepth(10);
      let p1 = 0;
      const legT = this.time.addEvent({ delay:16, repeat:40, callback:() => {
        p1 = Math.min(1, p1 + 0.05);
        const lx = tX + (hitX - tX)*p1, ly = tY + (fr.ionoY - tY)*p1;
        fireG.clear();
        fireG.lineStyle(3, 0x00ffff, 0.9); fireG.lineBetween(tX, tY, lx, ly);
        fireG.fillStyle(0x00ffff, 0.7); fireG.fillCircle(lx, ly, 4);
        fireG.fillStyle(0x00aaff, 0.2); fireG.fillCircle(lx, ly, 10);
      }});

      this.time.delayedCall(720, () => {
        this.time.removeEvent(legT);
        burstParticles(this, hitX, fr.ionoY, 0x00ccff, 16);
        this.cameras.main.flash(50, 0, 180, 255);

        if (!isCorrect) {
          // Miss: beam fades off-screen upward
          fireG.lineStyle(2, 0xff4400, 0.65); fireG.lineBetween(tX, tY, hitX, fr.ionoY);
          this.tweens.add({ targets: fireG, alpha: 0, duration: 450,
            onComplete: () => { fireG.destroy(); onDone(); }});
        } else {
          // Hit: beam drops to settlement
          let p2 = 0;
          const dropT = this.time.addEvent({ delay:16, repeat:24, callback:() => {
            p2 = Math.min(1, p2 + 0.09);
            const dy = fr.ionoY + (fr.groundY - fr.ionoY)*p2;
            fireG.clear();
            fireG.lineStyle(3, 0x00ffff, 0.9); fireG.lineBetween(tX, tY, hitX, fr.ionoY);
            fireG.lineStyle(3, 0x00ffff, 0.9); fireG.lineBetween(hitX, fr.ionoY, hitX, dy);
            fireG.fillStyle(0x00ffff, 0.7); fireG.fillCircle(hitX, dy, 4);
          }});
          this.time.delayedCall(430, () => {
            this.time.removeEvent(dropT); fireG.destroy();
            // Light up settlement
            this.settlementObjs.forEach(o => o.destroy());
            this.settlementObjs = this._makeSettlement(fr.settleX, fr.groundY, true);
            burstParticles(this, fr.settleX, fr.groundY - 14, 0xffdd88, 28);
            burstParticles(this, fr.settleX, fr.groundY - 14, 0x00ff88, 18);
            this.cameras.main.flash(100, 0, 255, 100);
            this.time.delayedCall(350, onDone);
          });
        }
      });
    });
  }

  _submitFire() {
    if (this.firingAngle <= 0) return;
    const q   = this.questions[this.currentQ];
    const val = this.firingAngle;
    this.attemptCount++;
    const isCorrect = Math.abs(val - q.correct) <= q.tolerance;

    // Disable fire button during animation
    this.fireBtn.disableInteractive();
    this.input.off('pointermove');
    this.input.off('pointerup');

    this._animateFire(isCorrect, () => {
      if (isCorrect) this._handleCorrect();
      else           this._handleWrong(val);
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // STANDARD MODE — Q2+ numpad layout
  // ════════════════════════════════════════════════════════════════════
  _buildStdModeUI() {
    const { W, H, pad } = this;
    const fs = Math.min(13, W * 0.019);
    this._fr = null;

    // Params panel
    const paramH = H * 0.14;
    drawPanel(this, pad, 50, W - pad * 2, paramH, 3);
    this.add.text(pad + 10, 54, 'MISSION PARAMETERS', {
      fontSize: '10px', fontFamily: 'Courier New', color: '#00aaff', letterSpacing: 2,
    }).setDepth(4);
    const p1Y = 50+paramH*0.28, p2Y = 50+paramH*0.55, p3Y = 50+paramH*0.78;
    this.paramTexts = {};
    [['dist','📍 Horizontal distance:',p1Y],['height','🌐 Ionosphere height:',p2Y],['diff','⚙️  Difficulty:',p3Y]]
      .forEach(([key,label,y]) => {
        this.add.text(pad+10,y,label,{fontSize:`${fs}px`,fontFamily:'Courier New',color:'#88aacc'}).setDepth(4);
        this.paramTexts[key] = this.add.text(W-pad-10,y,'—',{fontSize:`${fs}px`,fontFamily:'Courier New',color:'#00ff88'}).setOrigin(1,0).setDepth(4);
      });

    // Question panel
    const qY = 50+paramH+8, qH = H*0.12;
    this.qPanelY = qY;
    drawPanel(this, pad, qY, W-pad*2, qH, 3);
    this.qNumText   = this.add.text(pad+10, qY+4, '', {fontSize:'10px',fontFamily:'Courier New',color:'#ff3333',letterSpacing:2}).setDepth(4);
    this.qLine1     = this.add.text(pad+10, qY+22, '', {fontSize:`${fs}px`,fontFamily:'Courier New',color:'#aaccdd'}).setDepth(4);
    this.qLine2     = this.add.text(pad+10, qY+22+fs+4, '', {fontSize:`${fs}px`,fontFamily:'Courier New',color:'#aaccdd'}).setDepth(4);
    this.syllabusTag = this.add.text(pad+10, qY+qH-13, '', {fontSize:'9px',fontFamily:'Courier New',color:'#334455'}).setDepth(4);

    // Diagram
    const diagY = qY+qH+4, diagH = Math.min(H*0.17, 105);
    this.diagY = diagY; this.diagH = diagH;
    drawPanel(this, pad, diagY, W-pad*2, diagH, 3);
    this.diagG = null; this.diagLabels = [];

    // Hint button
    const hintBtnY = diagY+diagH+6;
    this.hintBtnY = hintBtnY;
    this.hintBtn = this.add.graphics().setDepth(4);
    this._drawHintBtn(false);
    this.add.text(pad+65, hintBtnY+13, '💡 HINT  (-10 XP)', {
      fontSize:'10px',fontFamily:'Courier New',color:'#ffaa00',
    }).setOrigin(0.5).setDepth(5);
    this.hintBtn.setInteractive(new Phaser.Geom.Rectangle(pad,hintBtnY,130,26),Phaser.Geom.Rectangle.Contains);
    this.hintBtn.on('pointerover', ()=>{ this.hintBtn.clear(); this._drawHintBtn(true); });
    this.hintBtn.on('pointerout',  ()=>{ this.hintBtn.clear(); this._drawHintBtn(false); });
    this.hintBtn.on('pointerdown', ()=>{ sfx.hint(); this._showHint(); });

    // Answer input
    const answerY = hintBtnY+34;
    this.answerY = answerY;
    this.add.text(pad, answerY, 'YOUR ANSWER:', {fontSize:'11px',fontFamily:'Courier New',color:'#88aacc',letterSpacing:2}).setDepth(4);
    const inpBox = this.add.graphics().setDepth(4);
    inpBox.fillStyle(0x010810,1); inpBox.lineStyle(2,0x00aaff,0.6);
    inpBox.fillRoundedRect(pad,answerY+20,W-pad*2-44,38,3);
    inpBox.strokeRoundedRect(pad,answerY+20,W-pad*2-44,38,3);
    this.answer     = '';
    this.answerText = this.add.text(pad+10,answerY+29,'',{fontSize:'17px',fontFamily:'Courier New',color:'#00ff88'}).setDepth(5);
    this.unitText   = this.add.text(W-pad-30,answerY+29,'',{fontSize:'18px',fontFamily:'Courier New',color:'#88aacc'}).setDepth(5);

    this._buildStdNumPad();
    // Stubs
    this.fireBtn = { disableInteractive:()=>{} };
    this.mcqBtns = [];
  }

  _drawHintBtn(hover) {
    const {pad, hintBtnY} = this;
    this.hintBtn.clear();
    this.hintBtn.fillStyle(hover?0x002a3e:0x001a2e,1);
    this.hintBtn.lineStyle(1,0xffaa00,hover?1:0.6);
    this.hintBtn.fillRoundedRect(pad,hintBtnY,130,26,3);
    this.hintBtn.strokeRoundedRect(pad,hintBtnY,130,26,3);
  }

  _buildStdNumPad() {
    const {W,H,pad} = this;
    const startY = this.answerY+66;
    const btnH = Math.min(44, (H-startY-56)/5);
    const btnW = (W-pad*2)/3-6;
    this.numPadBtns = [];

    [['7','8','9'],['4','5','6'],['1','2','3'],['.','0','⌫']].forEach((row,ri) => {
      row.forEach((key,ci) => {
        const x=pad+ci*(btnW+6), y=startY+ri*(btnH+5);
        const bg=this.add.graphics().setDepth(4);
        bg.fillStyle(0x010810,1); bg.lineStyle(1,0x00aaff,0.4);
        bg.fillRoundedRect(x,y,btnW,btnH,3); bg.strokeRoundedRect(x,y,btnW,btnH,3);
        this.add.text(x+btnW/2,y+btnH/2,key,{fontSize:`${Math.min(17,btnH*0.44)}px`,fontFamily:'Courier New',color:'#ffffff'}).setOrigin(0.5).setDepth(5);
        bg.setInteractive(new Phaser.Geom.Rectangle(x,y,btnW,btnH),Phaser.Geom.Rectangle.Contains);
        bg.on('pointerdown',()=>{
          sfx.click();
          if(key==='⌫') this.answer=this.answer.slice(0,-1);
          else if(this.answer.length<8) this.answer+=key;
          this.answerText.setText(this.answer);
        });
        bg.on('pointerover',()=>{ bg.clear(); bg.fillStyle(0x001a2e,1); bg.lineStyle(1,0x00ccff,0.8); bg.fillRoundedRect(x,y,btnW,btnH,3); bg.strokeRoundedRect(x,y,btnW,btnH,3); });
        bg.on('pointerout', ()=>{ bg.clear(); bg.fillStyle(0x010810,1); bg.lineStyle(1,0x00aaff,0.4);  bg.fillRoundedRect(x,y,btnW,btnH,3); bg.strokeRoundedRect(x,y,btnW,btnH,3); });
        this.numPadBtns.push(bg);
      });
    });

    const subY=startY+4*(btnH+5);
    const sub=this.add.graphics().setDepth(4);
    drawBtn(sub,pad,subY,W-pad*2,btnH,false);
    this.add.text(W/2,subY+btnH/2,'[ SUBMIT ANSWER ]',{fontSize:`${Math.min(14,W*0.022)}px`,fontFamily:'Courier New',color:'#ffffff',letterSpacing:3}).setOrigin(0.5).setDepth(5);
    sub.setInteractive(new Phaser.Geom.Rectangle(pad,subY,W-pad*2,btnH),Phaser.Geom.Rectangle.Contains);
    sub.on('pointerover',()=>{ sub.clear(); drawBtn(sub,pad,subY,W-pad*2,btnH,true); });
    sub.on('pointerout', ()=>{ sub.clear(); drawBtn(sub,pad,subY,W-pad*2,btnH,false); });
    sub.on('pointerdown',()=>{ sfx.click(); this._submitNumeric(); });
    this.numPadBtns.push(sub);

    ['Radio waves','Microwaves','Infrared','X-rays'].forEach((opt,i) => {
      const y=startY+i*(btnH+7);
      const bg=this.add.graphics().setDepth(4);
      bg.fillStyle(0x010810,1); bg.lineStyle(1,0x00aaff,0.4);
      bg.fillRoundedRect(pad,y,W-pad*2,btnH,3); bg.strokeRoundedRect(pad,y,W-pad*2,btnH,3);
      const t=this.add.text(pad+(W-pad*2)/2,y+btnH/2,opt,{fontSize:`${Math.min(13,W*0.02)}px`,fontFamily:'Courier New',color:'#aaccdd'}).setOrigin(0.5).setDepth(5);
      bg.setInteractive(new Phaser.Geom.Rectangle(pad,y,W-pad*2,btnH),Phaser.Geom.Rectangle.Contains);
      bg.on('pointerover',()=>{ bg.clear(); bg.fillStyle(0x001a2e,1); bg.lineStyle(1,0x00ccff,0.8); bg.fillRoundedRect(pad,y,W-pad*2,btnH,3); bg.strokeRoundedRect(pad,y,W-pad*2,btnH,3); });
      bg.on('pointerout', ()=>{ bg.clear(); bg.fillStyle(0x010810,1); bg.lineStyle(1,0x00aaff,0.4);  bg.fillRoundedRect(pad,y,W-pad*2,btnH,3); bg.strokeRoundedRect(pad,y,W-pad*2,btnH,3); });
      bg.on('pointerdown',()=>{ sfx.click(); this._submitMcq(i); });
      bg.setVisible(false); t.setVisible(false);
      this.mcqBtns.push({bg,t});
    });
  }

  // ════════════════════════════════════════════════════════════════════
  // SHARED — hint popup, question loading, submission, feedback
  // ════════════════════════════════════════════════════════════════════
  _buildHintPopup() {
    const {W,H,pad} = this;
    const hPopW=W-pad*4, hPopH=H*0.46;
    const hPopX=pad*2, hPopY=H/2-hPopH/2;
    this._hp = {x:hPopX,y:hPopY,w:hPopW,h:hPopH};

    this.dimOverlay=this.add.graphics().setDepth(20);
    this.dimOverlay.fillStyle(0x000000,0.8); this.dimOverlay.fillRect(0,0,W,H);
    this.dimOverlay.setVisible(false);

    this.hintPanel=this.add.graphics().setDepth(21);
    this.hintPanel.fillStyle(0x020e18,1); this.hintPanel.lineStyle(1,0xffaa00,0.7);
    this.hintPanel.fillRoundedRect(hPopX,hPopY,hPopW,hPopH,4);
    this.hintPanel.strokeRoundedRect(hPopX,hPopY,hPopW,hPopH,4);
    const bs=14;
    this.hintPanel.lineStyle(2,0xffaa00,0.9);
    [[hPopX,hPopY+bs,hPopX,hPopY],[hPopX,hPopY,hPopX+bs,hPopY],
     [hPopX+hPopW-bs,hPopY,hPopX+hPopW,hPopY],[hPopX+hPopW,hPopY,hPopX+hPopW,hPopY+bs],
     [hPopX,hPopY+hPopH-bs,hPopX,hPopY+hPopH],[hPopX,hPopY+hPopH,hPopX+bs,hPopY+hPopH],
     [hPopX+hPopW-bs,hPopY+hPopH,hPopX+hPopW,hPopY+hPopH],[hPopX+hPopW,hPopY+hPopH,hPopX+hPopW,hPopY+hPopH-bs]
    ].forEach(([x1,y1,x2,y2])=>this.hintPanel.lineBetween(x1,y1,x2,y2));
    this.hintPanel.setVisible(false);

    this.hintTitleTxt = this.add.text(hPopX+10,hPopY+8,'// HINT SYSTEM //',{fontSize:'11px',fontFamily:'Courier New',color:'#ffaa00',letterSpacing:3}).setDepth(22).setVisible(false);
    this.hintFormula  = this.add.text(hPopX+10,hPopY+30,'',{fontSize:`${Math.min(11,W*0.017)}px`,fontFamily:'Courier New',color:'#ffdd88',lineSpacing:4}).setDepth(22).setVisible(false);
    this.hintDiagG=null; this.hintDiagLabels=[];

    const cBtnX=hPopX+hPopW-65, cBtnY=hPopY+6;
    this.closeHintBtn=this.add.graphics().setDepth(22);
    this.closeHintBtn.fillStyle(0x8b0000,0.9); this.closeHintBtn.fillRoundedRect(cBtnX,cBtnY,60,22,3);
    this.closeHintBtn.setVisible(false);
    this.closeHintTxt=this.add.text(cBtnX+30,cBtnY+11,'✕ CLOSE',{fontSize:'9px',fontFamily:'Courier New',color:'#ffffff'}).setOrigin(0.5).setDepth(23).setVisible(false);
    this.closeHintBtn.setInteractive(new Phaser.Geom.Rectangle(cBtnX,cBtnY,60,22),Phaser.Geom.Rectangle.Contains);
    this.closeHintBtn.on('pointerdown',()=>this._hideHint());
  }

  _showHint() {
    if (!this.hintUsedThisQ) { this.hintUsedThisQ=true; this.score.hintsUsed++; }
    const q=this.questions[this.currentQ];
    const {x,y,w,h}=this._hp;
    this.hintFormula.setText(q.formula||'');
    this.dimOverlay.setVisible(true); this.hintPanel.setVisible(true);
    this.hintTitleTxt.setVisible(true); this.hintFormula.setVisible(true);
    this.closeHintBtn.setVisible(true); this.closeHintTxt.setVisible(true);
    if (this.hintDiagG) { this.hintDiagG.destroy(); this.hintDiagG=null; }
    this.hintDiagLabels.forEach(l=>l.destroy()); this.hintDiagLabels=[];
    const dsy=y+h*0.38;
    const {g,labels}=drawSignalDiagram(this,x+4,dsy,w-8,h-(dsy-y)-8,q,23);
    this.hintDiagG=g; this.hintDiagLabels=labels;
  }

  _hideHint() {
    this.dimOverlay.setVisible(false); this.hintPanel.setVisible(false);
    this.hintTitleTxt.setVisible(false); this.hintFormula.setVisible(false);
    this.closeHintBtn.setVisible(false); this.closeHintTxt.setVisible(false);
    if (this.hintDiagG) { this.hintDiagG.destroy(); this.hintDiagG=null; }
    this.hintDiagLabels.forEach(l=>l.destroy()); this.hintDiagLabels=[];
  }

  _loadQuestion(index) {
    this.currentQ=index; this.answer='';
    this.answerText.setText('');
    this.attemptCount=0; this.hintUsedThisQ=false;
    this.firingAngle=0;
    this._hideHint();

    const q=this.questions[index];
    const isMcq=q.type==='mcq';

    this.qNumText.setText(`Q ${index+1}/${this.totalQ}   ◆ ◆ ◆`);
    this.qLine1.setText(q.text[0]);
    if (this.qLine2) this.qLine2.setText(q.text[1]||'');
    this.syllabusTag.setText(`📚 ${q.syllabus}`);
    if (this.unitText) this.unitText.setText(isMcq?'':q.unit);

    if (this.paramTexts) {
      this.paramTexts.dist?.setText(q.d!==undefined?`${q.d} km`:'—');
      this.paramTexts.height?.setText(q.h!==undefined?`${q.h} km`:'—');
      this.paramTexts.diff?.setText(this.profile.difficulty);
    }

    // Standard mode: update diagram
    if (!this.isFiringMode) {
      if (this.diagG) { this.diagG.destroy(); this.diagG=null; }
      if (this.diagLabels) this.diagLabels.forEach(l=>l.destroy()); this.diagLabels=[];
      const {g,labels}=drawSignalDiagram(this,this.pad+4,this.diagY+4,this.W-this.pad*2-8,this.diagH-8,q,5);
      this.diagG=g; this.diagLabels=labels;
    }

    // Show/hide numpad vs MCQ
    if (this.numPadBtns) this.numPadBtns.forEach(b=>b.setVisible&&b.setVisible(!isMcq));
    if (this.mcqBtns)    this.mcqBtns.forEach(({bg,t})=>{ bg.setVisible(isMcq); t.setVisible(isMcq); });
    if (this.answerText) this.answerText.setVisible(!isMcq);
    if (this.unitText)   this.unitText.setVisible(!isMcq);

    // Firing mode: init beam
    if (this.isFiringMode) this._updateBeam();
  }

  _submitNumeric() {
    const q=this.questions[this.currentQ];
    const val=parseFloat(this.answer);
    this.attemptCount++;
    if (!isNaN(val) && Math.abs(val-q.correct)<=q.tolerance) this._handleCorrect();
    else this._handleWrong(val);
  }

  _submitMcq(optIdx) {
    this.attemptCount++;
    if (optIdx===this.questions[this.currentQ].correctOption) this._handleCorrect();
    else this._handleWrong(['Radio waves','Microwaves','Infrared','X-rays'][optIdx]);
  }

  _livesStr() {
    const rem=3-this.attemptCount;
    return '◆ '.repeat(Math.max(0,rem)).trim()+'◇ '.repeat(Math.min(3,this.attemptCount)).trim();
  }

  _xpForQ() {
    return Math.max(20, 100 - Math.max(0,(this.attemptCount-1)*20) - (this.hintUsedThisQ?10:0));
  }

  _redrawXpBar() {
    const ratio=Math.min(1,this.score.xp/(this.totalQ*100));
    this.xpBar.clear();
    this.xpBar.fillStyle(0x00aaff,0.7); this.xpBar.fillRect(0,38,this.W*ratio,6);
  }

  _handleCorrect() {
    const xp=this._xpForQ();
    this.score.xp+=xp; this._redrawXpBar();
    sfx.correct();
    if (!this.isFiringMode) burstParticles(this,this.W/2,this.H*0.35,0x00ff88);

    const q=this.questions[this.currentQ];
    if (this.sessionId) {
      fetch(`${API}/session/${this.sessionId}/answer`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({question_id:q.id,syllabus_topic:q.syllabus,
          student_answer:parseFloat(this.answer)||this.firingAngle||null,
          correct:true,attempts:this.attemptCount,hint_used:this.hintUsedThisQ,xp_awarded:xp}),
      }).catch(()=>{});
    }

    const isFinal=this.currentQ>=this.totalQ-1;
    const nextQ  =this.currentQ+1;
    const switchMode = this.isFiringMode && !isFinal;

    this._showFeedback(true, isFinal, q, xp, ()=>{
      if (switchMode) {
        // Switch from firing mode → std mode via restart (preserves score)
        this.scene.start('GameScene', {
          ...this._data,
          startAtQ:  nextQ,
          score:     this.score,
          questions: this.questions,
        });
      } else if (!isFinal) {
        this._loadQuestion(nextQ);
      }
    });
  }

  _handleWrong(studentAnswer) {
    const q=this.questions[this.currentQ];
    this.score.wrongAnswers.push({qId:q.id,topic:q.syllabus,answer:studentAnswer});
    if (!this.isFiringMode) { sfx.wrong(); burstParticles(this,this.W/2,this.H*0.35,0xff3333,14); }

    if (this.sessionId) {
      fetch(`${API}/session/${this.sessionId}/answer`,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({question_id:q.id,syllabus_topic:q.syllabus,
          student_answer:typeof studentAnswer==='number'?studentAnswer:null,
          correct:false,attempts:this.attemptCount,hint_used:this.hintUsedThisQ,xp_awarded:0}),
      }).catch(()=>{});
    }

    if (this.attemptCount>=3) this._showMissionFailed(q);
    else                      this._showFeedback(false,false,q,0,null);
  }

  _showMissionFailed(q) {
    const {W,H,pad}=this;
    sfx.wrong();
    this.cameras.main.flash(600,180,0,0);
    this.cameras.main.shake(500,0.012);
    burstParticles(this,W/2,H/2,0xff2200,36);

    const overlay=this.add.graphics().setDepth(40);
    overlay.fillStyle(0x000000,0.94); overlay.fillRect(0,0,W,H);

    const pw=Math.min(360,W*0.9), ph=230;
    const px=W/2-pw/2, py=H/2-ph/2;
    const fp=this.add.graphics().setDepth(41);
    fp.fillStyle(0x0d0000,1); fp.lineStyle(2,0xff2200,1);
    fp.fillRoundedRect(px,py,pw,ph,4); fp.strokeRoundedRect(px,py,pw,ph,4);
    const s=14; fp.lineStyle(3,0xff2200,1);
    [[px,py+s,px,py],[px,py,px+s,py],[px+pw-s,py,px+pw,py],[px+pw,py,px+pw,py+s],
     [px,py+ph-s,px,py+ph],[px,py+ph,px+s,py+ph],[px+pw-s,py+ph,px+pw,py+ph],[px+pw,py+ph,px+pw,py+ph-s]]
      .forEach(([x1,y1,x2,y2])=>fp.lineBetween(x1,y1,x2,y2));

    const fs=Math.min(12,W*0.018);
    this.add.text(W/2,py+28,'SIGNAL LOST',{fontSize:`${Math.min(26,W*0.043)}px`,fontFamily:'Georgia, serif',color:'#ff2200',letterSpacing:6}).setOrigin(0.5).setDepth(42);
    this.add.text(W/2,py+68,'The beam overshot. Static. Silence.',{fontSize:`${fs}px`,fontFamily:'Courier New',color:'#884444'}).setOrigin(0.5).setDepth(42);
    this.add.text(W/2,py+90,'Sector 7 never answered.',{fontSize:`${fs}px`,fontFamily:'Courier New',color:'#cc3333'}).setOrigin(0.5).setDepth(42);
    this.add.text(W/2,py+118,`Topic: ${q.syllabus.split('—')[0].trim()}`,{fontSize:'10px',fontFamily:'Courier New',color:'#553333'}).setOrigin(0.5).setDepth(42);

    const bw=Math.min(210,W*0.6), bh=36;
    const bx=W/2-bw/2, by=py+ph-48;
    const btnBg=this.add.graphics().setDepth(42);
    drawBtn(btnBg,bx,by,bw,bh,false,0xff2200);
    this.add.text(W/2,by+bh/2,'[ RETRY MISSION ]',{fontSize:`${Math.min(12,W*0.019)}px`,fontFamily:'Courier New',color:'#ffffff',letterSpacing:2}).setOrigin(0.5).setDepth(43);
    btnBg.setInteractive(new Phaser.Geom.Rectangle(bx,by,bw,bh),Phaser.Geom.Rectangle.Contains);
    btnBg.on('pointerover',()=>{ btnBg.clear(); drawBtn(btnBg,bx,by,bw,bh,true,0xff2200); });
    btnBg.on('pointerout', ()=>{ btnBg.clear(); drawBtn(btnBg,bx,by,bw,bh,false,0xff2200); });
    btnBg.on('pointerdown',()=>{
      sfx.click();
      this.scene.start('BriefingScene',{
        subject:this.profile.subject, difficulty:this.profile.difficulty, sessionId:this.sessionId,
        questions:this.questions,
      });
    });
  }

  _showFeedback(isCorrect, isFinal, q, xp, onNext) {
    const {W,H,pad}=this;
    const overlay=this.add.graphics().setDepth(30);
    overlay.fillStyle(0x000000,0.88); overlay.fillRect(0,0,W,H);

    const fs=Math.min(12,W*0.018);
    const solLines=q.solution?q.solution.length:0;
    const pw=Math.min(420,W*0.92,W-pad*2);
    const contentH=isCorrect?82+solLines*(fs+7)+46:190;
    const ph=Math.min(contentH,H*0.88);
    const px=W/2-pw/2, py=Math.max(pad,H/2-ph/2);

    const fp=this.add.graphics().setDepth(31);
    fp.fillStyle(0x020810,1); fp.lineStyle(2,isCorrect?0x00ff88:0xff3333,0.9);
    fp.fillRoundedRect(px,py,pw,ph,4); fp.strokeRoundedRect(px,py,pw,ph,4);

    if (isCorrect) {
      if (isFinal && !this.isFiringMode) { sfx.signal(); }
      this.add.text(W/2,py+24,'✅ CORRECT',{fontSize:`${Math.min(21,W*0.036)}px`,fontFamily:'Georgia, serif',color:'#00ff88'}).setOrigin(0.5).setDepth(32);
      this.add.text(W/2,py+52,`+${xp} XP${this.hintUsedThisQ?' (hint penalty)':''}`,{fontSize:`${fs}px`,fontFamily:'Courier New',color:'#ffaa00'}).setOrigin(0.5).setDepth(32);
      this.add.text(px+10,py+70,'── WORKED SOLUTION ──',{fontSize:'9px',fontFamily:'Courier New',color:'#334455',letterSpacing:2}).setDepth(32);
      q.solution.forEach((line,i)=>{
        this.add.text(px+14,py+84+i*(fs+7),line,{fontSize:`${fs}px`,fontFamily:'Courier New',color:'#ffdd88'}).setDepth(32);
      });
      this.add.text(px+10,py+84+solLines*(fs+7)+4,`📚 ${q.syllabus}`,{fontSize:'9px',fontFamily:'Courier New',color:'#334455'}).setDepth(32);
    } else {
      const rem=3-this.attemptCount;
      this.add.text(W/2,py+28,'❌ SIGNAL MISSED',{fontSize:`${Math.min(20,W*0.033)}px`,fontFamily:'Georgia, serif',color:'#ff3333'}).setOrigin(0.5).setDepth(32);
      this.add.text(W/2,py+62,'Beam overshot. Recalculate.',{fontSize:`${fs}px`,fontFamily:'Courier New',color:'#884444'}).setOrigin(0.5).setDepth(32);
      this.add.text(W/2,py+88,this._livesStr(),{fontSize:`${Math.min(16,W*0.025)}px`,fontFamily:'Courier New',color:rem===1?'#ff2200':'#ff8800'}).setOrigin(0.5).setDepth(32);
      this.add.text(W/2,py+114,`${rem} attempt${rem===1?'':'s'} remaining`,{fontSize:'10px',fontFamily:'Courier New',color:rem===1?'#ff2200':'#ff8800'}).setOrigin(0.5).setDepth(32);
    }

    const btnLabel=isFinal?'[ TRANSMISSION COMPLETE ]':isCorrect?'[ NEXT QUESTION → ]':'[ TRY AGAIN ]';
    const bw=Math.min(240,W*0.62), bh=36;
    const bx=W/2-bw/2, by=py+ph-46;
    const bb=this.add.graphics().setDepth(32);
    drawBtn(bb,bx,by,bw,bh,false);
    this.add.text(W/2,by+bh/2,btnLabel,{fontSize:`${Math.min(11,W*0.018)}px`,fontFamily:'Courier New',color:'#ffffff',letterSpacing:1}).setOrigin(0.5).setDepth(33);
    bb.setInteractive(new Phaser.Geom.Rectangle(bx,by,bw,bh),Phaser.Geom.Rectangle.Contains);
    bb.on('pointerover',()=>{ bb.clear(); drawBtn(bb,bx,by,bw,bh,true); });
    bb.on('pointerout', ()=>{ bb.clear(); drawBtn(bb,bx,by,bw,bh,false); });
    bb.on('pointerdown',()=>{
      sfx.click();
      if (isFinal) {
        if (this.sessionId) {
          fetch(`${API}/session/${this.sessionId}/complete`,{
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify({xp_earned:this.score.xp}),
          }).catch(()=>{});
        }
        this.scene.start('VictoryScene',{score:this.score,subject:this.profile.subject,difficulty:this.profile.difficulty,sessionId:this.sessionId});
      } else if (isCorrect && onNext) {
        this.children.list.filter(c=>c.depth>=30).forEach(c=>c.destroy());
        onNext();
      } else {
        this.children.list.filter(c=>c.depth>=30).forEach(c=>c.destroy());
        this.answer=''; this.answerText.setText('');
        // Re-enable fire button if in firing mode
        if (this.isFiringMode && this.fireBtn?.setInteractive) {
          const {W,H,pad}=this;
          this.fireBtn.setInteractive(new Phaser.Geom.Rectangle(pad,this._fireBtnY,W-pad*2,this._fireBtnH),Phaser.Geom.Rectangle.Contains);
          this.input.on('pointermove',(p)=>{ /* re-hooked by zone */ });
        }
        const rem=3-this.attemptCount;
        this.qNumText.setText(`Q ${this.currentQ+1}/${this.totalQ}   ${'◆ '.repeat(rem).trim()} ${'◇ '.repeat(3-rem).trim()}`);
      }
    });
  }
}

// ─── VICTORY SCENE ───────────────────────────────────────────────────
export class VictoryScene extends Phaser.Scene {
  constructor() { super({ key: 'VictoryScene' }); }

  create(data = {}) {
    this.scale.once('resize', () => this.scene.restart(data));
    const W = this.scale.width, H = this.scale.height;
    const pad = Math.max(12, W * 0.02);
    const score = data.score || { xp: 0, hintsUsed: 0, wrongAnswers: [] };
    const fs = Math.min(12, W * 0.017);

    this.cameras.main.setBackgroundColor('#050a0f');
    drawHexGrid(this, W, H);
    scanLines(this, W, H);
    titleBar(this, W, 'CHAPTER 6 COMPLETE  ——  SIGNAL SENT');

    // Fire particles on load
    burstParticles(this, W / 2, H * 0.3, 0x00ff88, 40);
    this.time.delayedCall(300, () => burstParticles(this, W * 0.3, H * 0.25, 0x00ccff, 24));
    this.time.delayedCall(500, () => burstParticles(this, W * 0.7, H * 0.28, 0xffaa00, 24));
    sfx.signal();

    // Layout: split H into story + score + (optional weak topics) + buttons
    const storyH   = Math.min(H * 0.28, 160);
    const scoreH   = Math.min(H * 0.30, 175);
    const hasWeak  = score.wrongAnswers.length > 0;
    const weakH    = hasWeak ? Math.min(H * 0.10, 58) : 0;
    const btnH     = 44;
    const totalContent = 46 + storyH + 8 + scoreH + (hasWeak ? 8 + weakH : 0) + 8 + btnH + pad;
    const scrollOff = Math.max(0, totalContent - H);  // if content overflows, we just clip — acceptable on small screens

    let curY = 46;

    // Story panel
    drawPanel(this, pad, curY, W - pad * 2, storyH, 3);
    this.add.text(pad + 10, curY + 4, 'TRANSMISSION LOG', {
      fontSize: '10px', fontFamily: 'Courier New', color: '#ff3333', letterSpacing: 2,
    }).setDepth(4);

    const storyLines = [
      '>> Signal locked. Angle confirmed. Path calculated.',
      '>> Bearing dialled in. Tower charging...',
      '>> SIGNAL AWAY.',
      ' ',
      '>> 4.7 seconds later — a reply crackles through.',
      '>> "This is Sector 7 — we read you. We are alive."',
      ' ',
      '>> Dr. Nova: "You did it. We are no longer alone."',
      '>> [Chapter 7 unlocked: RESOURCE CHAIN]',
    ].join('\n');

    const storyText = this.add.text(pad + 10, curY + 24, '', {
      fontSize: `${fs}px`, fontFamily: 'Courier New', color: '#aaccdd', lineSpacing: 3,
      wordWrap: { width: W - pad * 4 },
    }).setDepth(4);
    let si = 0;
    this.time.addEvent({
      delay: 30, repeat: storyLines.length - 1,
      callback: () => {
        storyText.text += storyLines[si];
        if (si % 4 === 0) sfx.type();
        si++;
      },
    });

    curY += storyH + 8;

    // Score panel
    drawPanel(this, pad, curY, W - pad * 2, scoreH, 3);
    this.add.text(pad + 10, curY + 4, 'MISSION SCORE', {
      fontSize: '10px', fontFamily: 'Courier New', color: '#00aaff', letterSpacing: 2,
    }).setDepth(4);

    const questCount = data.subject === 'physics'
      ? (data.difficulty === 'G1' ? 4 : 5)
      : (data.difficulty === 'G1' ? 2 : 3);
    const maxXp   = questCount * 100;
    const correct = questCount - score.wrongAnswers.filter(a => a).length;
    const accuracy = Math.max(0, Math.round((correct / questCount) * 100));

    const rows = [
      ['XP EARNED',  `${score.xp} / ${maxXp}`,               score.xp >= maxXp * 0.8 ? '#00ff88' : '#ffaa00'],
      ['ACCURACY',   `${accuracy}%`,                           accuracy >= 80 ? '#00ff88' : '#ff8888'],
      ['HINTS USED', `${score.hintsUsed}`,                     score.hintsUsed === 0 ? '#00ff88' : '#ffaa00'],
      ['DIFFICULTY', data.difficulty || 'G1',                  '#00aaff'],
      ['SUBJECT',    (data.subject || 'emath').toUpperCase(),  '#00aaff'],
    ];

    rows.forEach(([label, val, color], i) => {
      const rowY = curY + 24 + i * Math.floor((scoreH - 32) / rows.length);
      this.add.text(pad + 10, rowY, label, { fontSize: `${fs}px`, fontFamily: 'Courier New', color: '#88aacc' }).setDepth(4);
      this.add.text(W - pad - 10, rowY, val, { fontSize: `${fs}px`, fontFamily: 'Courier New', color }).setOrigin(1, 0).setDepth(4);
    });

    curY += scoreH + 8;

    // Weak topics
    if (hasWeak) {
      drawPanel(this, pad, curY, W - pad * 2, weakH, 3);
      this.add.text(pad + 10, curY + 4, '⚠ REVIEW THESE TOPICS', {
        fontSize: '9px', fontFamily: 'Courier New', color: '#ff3333', letterSpacing: 1,
      }).setDepth(4);
      const unique = [...new Set(score.wrongAnswers.map(a => a.topic.split(':')[0].trim()))];
      this.add.text(pad + 10, curY + 20, unique.join('  ·  '), {
        fontSize: `${Math.min(10, W * 0.015)}px`, fontFamily: 'Courier New', color: '#ffaa00',
        wordWrap: { width: W - pad * 4 },
      }).setDepth(4);
      curY += weakH + 8;
    }

    // Buttons
    const bw = Math.min(170, (W - pad * 4) / 2);
    makeBtn(this, pad, curY, bw, btnH, '[ PLAY AGAIN ]', Math.min(11, W * 0.017), 4,
      () => this.scene.start('ProfileScene'));
    makeBtn(this, W - pad - bw, curY, bw, btnH, '[ MAIN MENU ]', Math.min(11, W * 0.017), 4,
      () => this.scene.start('BootScene'));
  }
}

// ─── PROFILE SCENE ───────────────────────────────────────────────────
export class ProfileScene extends Phaser.Scene {
  constructor() { super({ key: 'ProfileScene' }); }

  create(data = {}) {
    // Pass selections back through restart data so they survive scene restart
    this.scale.once('resize', () => this.scene.restart(data));
    const W = this.scale.width, H = this.scale.height;
    const pad = Math.max(12, W * 0.02);
    const fs  = Math.min(12, W * 0.018);

    // Restore selections from data (survives restart)
    this.selectedSubject = data.subject || 'emath';
    this.selectedDiff    = data.diff    || 'G1';

    this.cameras.main.setBackgroundColor('#050a0f');
    drawHexGrid(this, W, H);
    scanLines(this, W, H);
    titleBar(this, W, 'COMMANDER PROFILE  ——  SELECT LOADOUT');

    let curY = 46;

    // ── Subject panel
    const subH = Math.min(H * 0.22, 130);
    drawPanel(this, pad, curY, W - pad * 2, subH, 3);
    this.add.text(pad + 10, curY + 4, 'SUBJECT PROFILE', {
      fontSize: '10px', fontFamily: 'Courier New', color: '#00aaff', letterSpacing: 2,
    }).setDepth(4);

    const subjects = [
      { key: 'emath',   label: 'E-MATH ONLY',      accent: 0x00aaff, desc: 'Trig · Pythagoras · Bearings' },
      { key: 'physics', label: 'PHYSICS + E-MATH',  accent: 0xffaa00, desc: '+ Wave eq. · EM Spectrum' },
    ];
    subjects.forEach((s, i) => {
      const bw = (W - pad * 4) / 2, bh = Math.min(54, subH * 0.55);
      const bx = pad + i * (bw + pad * 2), by = curY + subH * 0.3;
      const sel = s.key === this.selectedSubject;
      const g = this.add.graphics().setDepth(4);
      g.fillStyle(sel ? 0x002233 : 0x010810, 1);
      g.lineStyle(1, s.accent, sel ? 0.9 : 0.3);
      g.fillRoundedRect(bx, by, bw, bh, 3); g.strokeRoundedRect(bx, by, bw, bh, 3);
      if (sel) { g.lineStyle(1, 0xff3333, 0.35); g.lineBetween(bx + 8, by + bh - 1, bx + bw - 8, by + bh - 1); }
      this.add.text(bx + bw / 2, by + 14, s.label, {
        fontSize: `${Math.min(10, W * 0.015)}px`, fontFamily: 'Courier New', color: sel ? '#ffffff' : '#445566', letterSpacing: 1,
      }).setOrigin(0.5).setDepth(5);
      this.add.text(bx + bw / 2, by + 30, s.desc, {
        fontSize: `${Math.min(8, W * 0.012)}px`, fontFamily: 'Courier New', color: sel ? '#aaccdd' : '#334455', align: 'center', wordWrap: { width: bw - 10 },
      }).setOrigin(0.5).setDepth(5);
      g.setInteractive(new Phaser.Geom.Rectangle(bx, by, bw, bh), Phaser.Geom.Rectangle.Contains);
      g.on('pointerdown', () => { sfx.click(); this.scene.restart({ subject: s.key, diff: this.selectedDiff }); });
    });

    curY += subH + 8;

    // ── Difficulty panel
    const diffH = Math.min(H * 0.22, 130);
    drawPanel(this, pad, curY, W - pad * 2, diffH, 3);
    this.add.text(pad + 10, curY + 4, 'DIFFICULTY', {
      fontSize: '10px', fontFamily: 'Courier New', color: '#00aaff', letterSpacing: 2,
    }).setDepth(4);

    const diffs = [
      { key: 'G1', label: 'G1', sub: 'Guided' },
      { key: 'G2', label: 'G2', sub: 'Standard' },
      { key: 'G3', label: 'G3', sub: 'Challenge' },
    ];
    diffs.forEach((d, i) => {
      const bw = (W - pad * 2 - 12) / 3, bh = Math.min(48, diffH * 0.5);
      const bx = pad + i * (bw + 6), by = curY + diffH * 0.28;
      const sel = d.key === this.selectedDiff;
      const g = this.add.graphics().setDepth(4);
      g.fillStyle(sel ? 0x002233 : 0x010810, 1);
      g.lineStyle(1, 0x00aaff, sel ? 0.9 : 0.3);
      g.fillRoundedRect(bx, by, bw, bh, 3); g.strokeRoundedRect(bx, by, bw, bh, 3);
      if (sel) { g.lineStyle(1, 0xff3333, 0.35); g.lineBetween(bx + 6, by + bh - 1, bx + bw - 6, by + bh - 1); }
      this.add.text(bx + bw / 2, by + 13, d.label, {
        fontSize: `${Math.min(15, W * 0.022)}px`, fontFamily: 'Georgia, serif', color: sel ? '#00ff88' : '#445566',
      }).setOrigin(0.5).setDepth(5);
      this.add.text(bx + bw / 2, by + 32, d.sub, {
        fontSize: `${Math.min(8, W * 0.012)}px`, fontFamily: 'Courier New', color: sel ? '#aaccdd' : '#334455',
      }).setOrigin(0.5).setDepth(5);
      g.setInteractive(new Phaser.Geom.Rectangle(bx, by, bw, bh), Phaser.Geom.Rectangle.Contains);
      g.on('pointerdown', () => { sfx.click(); this.scene.restart({ subject: this.selectedSubject, diff: d.key }); });
    });

    curY += diffH + 8;

    // ── Question preview panel
    const previewLines = [
      ...DIFF_PREVIEW[this.selectedDiff],
      ...(this.selectedSubject === 'physics' ? PHYSICS_EXTRA : []),
    ];
    const previewH = Math.min(H * 0.20, 22 + previewLines.length * 18 + 10);
    drawPanel(this, pad, curY, W - pad * 2, previewH, 3);
    this.add.text(pad + 10, curY + 4, 'QUESTIONS IN THIS RUN', {
      fontSize: '9px', fontFamily: 'Courier New', color: '#ff3333', letterSpacing: 2,
    }).setDepth(4);
    previewLines.forEach((line, i) => {
      const isPhysics = line.startsWith('Q+');
      this.add.text(pad + 14, curY + 22 + i * 18, line, {
        fontSize: `${Math.min(10, W * 0.015)}px`, fontFamily: 'Courier New',
        color: isPhysics ? '#ffaa00' : '#aaccdd',
      }).setDepth(4);
    });

    curY += previewH + 8;

    // ── MOE tag + Launch button
    this.add.text(W / 2, curY, 'Aligned to MOE Singapore O-Level syllabus', {
      fontSize: '9px', fontFamily: 'Courier New', color: '#334455',
    }).setOrigin(0.5).setDepth(4);

    const btnW = Math.min(220, W * 0.6), btnH = 42;
    makeBtn(this, W / 2 - btnW / 2, curY + 14, btnW, btnH, '[ LAUNCH MISSION ]', Math.min(13, W * 0.02), 4,
      () => this._startMission());
  }

  _startMission() {
    fetch(`${API}/session/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_name: 'Commander', subject: this.selectedSubject, difficulty: this.selectedDiff }),
    })
      .then(r => r.json())
      .then(({ session_id }) => {
        this.scene.start('Ch6PreloadScene', { subject: this.selectedSubject, difficulty: this.selectedDiff, sessionId: session_id });
      })
      .catch(() => {
        this.scene.start('Ch6PreloadScene', { subject: this.selectedSubject, difficulty: this.selectedDiff, sessionId: null });
      });
  }
}
