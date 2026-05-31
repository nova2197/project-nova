import Phaser from 'phaser';
import { VictoryScene, ProfileScene } from './scenes.js';
import { Ch6PreloadScene, ClimbScene, ControlRoomScene } from './chapter6.js';

class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  create() {
    // Restart scene on resize so layout recalculates
    this.scale.once('resize', () => this.scene.restart());

    const width = this.scale.width;
    const height = this.scale.height;

    this.cameras.main.setBackgroundColor('#050a0f');

    // Hex grid background
    this.drawHexGrid(width, height);

    // Scan line overlay
    const scanLines = this.add.graphics();
    scanLines.setDepth(1);
    for (let y = 0; y < height; y += 4) {
      scanLines.lineStyle(1, 0x000000, 0.15);
      scanLines.lineBetween(0, y, width, y);
    }

    // Glow circle
    const glow = this.add.graphics().setDepth(2);
    glow.fillStyle(0x8b0000, 0.12);
    glow.fillCircle(width / 2, height / 2, Math.min(width, height) * 0.35);

    // Outer ring
    const ring = this.add.graphics().setDepth(2);
    ring.lineStyle(1, 0x00aaff, 0.2);
    ring.strokeCircle(width / 2, height / 2, Math.min(width, height) * 0.35);

    // Panel box
    const panelW = Math.min(500, width * 0.85);
    const panelH = Math.min(280, height * 0.5);
    const panelX = width / 2 - panelW / 2;
    const panelY = height / 2 - panelH / 2;

    const panel = this.add.graphics().setDepth(3);
    panel.fillStyle(0x020810, 0.92);
    panel.lineStyle(1, 0x00aaff, 0.5);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 4);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 4);

    // Corner brackets
    this.drawCornerBrackets(panel, panelX, panelY, panelW, panelH, 0x00aaff);

    // Top bar
    panel.fillStyle(0x00aaff, 0.08);
    panel.fillRect(panelX + 1, panelY + 1, panelW - 2, 28);

    this.add.text(width / 2, panelY + 14, '// PROJECT NOVA //', {
      fontSize: '11px', fontFamily: 'Courier New', color: '#00aaff', letterSpacing: 4,
    }).setOrigin(0.5).setDepth(4);

    // Title
    this.add.text(width / 2, panelY + panelH * 0.35, 'PROJECT NOVA', {
      fontSize: `${Math.min(46, width * 0.07)}px`,
      fontFamily: 'Georgia, serif',
      color: '#ff3333',
      letterSpacing: 10,
      stroke: '#ff0000',
      strokeThickness: 1,
    }).setOrigin(0.5).setDepth(4);

    // Divider line
    const divLine = this.add.graphics().setDepth(4);
    divLine.lineStyle(1, 0x00aaff, 0.6);
    divLine.lineBetween(panelX + 30, panelY + panelH * 0.52, panelX + panelW - 30, panelY + panelH * 0.52);

    // Diamond accent
    divLine.fillStyle(0x00aaff, 0.8);
    divLine.fillTriangle(
      width / 2, panelY + panelH * 0.52 - 5,
      width / 2 - 5, panelY + panelH * 0.52,
      width / 2, panelY + panelH * 0.52 + 5
    );
    divLine.fillTriangle(
      width / 2, panelY + panelH * 0.52 - 5,
      width / 2 + 5, panelY + panelH * 0.52,
      width / 2, panelY + panelH * 0.52 + 5
    );

    this.add.text(width / 2, panelY + panelH * 0.64, 'Earth is dying.  Your knowledge is our only weapon.', {
      fontSize: `${Math.min(13, width * 0.02)}px`,
      fontFamily: 'Courier New',
      color: '#88aacc',
    }).setOrigin(0.5).setDepth(4);

    // Begin button
    const btnW = Math.min(200, width * 0.4);
    const btnH = 42;
    const btnX = width / 2 - btnW / 2;
    const btnY = panelY + panelH * 0.78;

    const btnBg = this.add.graphics().setDepth(4);
    this.drawFuturisticButton(btnBg, btnX, btnY, btnW, btnH, false);

    this.add.text(width / 2, btnY + btnH / 2, '[ BEGIN MISSION ]', {
      fontSize: `${Math.min(14, width * 0.022)}px`,
      fontFamily: 'Courier New',
      color: '#ffffff',
      letterSpacing: 2,
    }).setOrigin(0.5).setDepth(5);

    btnBg.setInteractive(new Phaser.Geom.Rectangle(btnX, btnY, btnW, btnH), Phaser.Geom.Rectangle.Contains);
    btnBg.on('pointerover', () => { btnBg.clear(); this.drawFuturisticButton(btnBg, btnX, btnY, btnW, btnH, true); });
    btnBg.on('pointerout', () => { btnBg.clear(); this.drawFuturisticButton(btnBg, btnX, btnY, btnW, btnH, false); });
    btnBg.on('pointerdown', () => { this.scene.start('ProfileScene'); });

    // Blinking glow
    let vis = true;
    this.time.addEvent({
      delay: 1200, loop: true,
      callback: () => { vis = !vis; glow.setAlpha(vis ? 1 : 0.6); }
    });
  }

  drawHexGrid(width, height) {
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(1, 0x00aaff, 0.06);
    const size = 30;
    const cols = Math.ceil(width / (size * 1.7)) + 2;
    const rows = Math.ceil(height / (size * 1.5)) + 2;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * size * 1.75 + (row % 2 === 0 ? 0 : size * 0.875);
        const y = row * size * 1.5;
        g.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 180) * (60 * i - 30);
          const px = x + size * Math.cos(angle);
          const py = y + size * Math.sin(angle);
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.closePath();
        g.strokePath();
      }
    }
  }

  drawCornerBrackets(g, x, y, w, h, color) {
    const s = 16;
    g.lineStyle(2, color, 0.9);
    // Top-left
    g.lineBetween(x, y + s, x, y); g.lineBetween(x, y, x + s, y);
    // Top-right
    g.lineBetween(x + w - s, y, x + w, y); g.lineBetween(x + w, y, x + w, y + s);
    // Bottom-left
    g.lineBetween(x, y + h - s, x, y + h); g.lineBetween(x, y + h, x + s, y + h);
    // Bottom-right
    g.lineBetween(x + w - s, y + h, x + w, y + h); g.lineBetween(x + w, y + h, x + w, y + h - s);
  }

  drawFuturisticButton(g, x, y, w, h, hover) {
    g.fillStyle(hover ? 0x003355 : 0x001a2e, 1);
    g.lineStyle(1, hover ? 0x00ccff : 0x00aaff, 0.9);
    g.fillRoundedRect(x, y, w, h, 3);
    g.strokeRoundedRect(x, y, w, h, 3);
    g.lineStyle(1, 0xff3333, 0.5);
    g.lineBetween(x + 8, y + h - 1, x + w - 8, y + h - 1);
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#050a0f',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, ProfileScene, Ch6PreloadScene, ClimbScene, ControlRoomScene, VictoryScene],
};

const game = new Phaser.Game(config);
if (import.meta.env.DEV) window.__game = game;