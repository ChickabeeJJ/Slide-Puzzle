// Renders the store covers (1920x1080, 800x1200, 800x800) using the game's own art.
import { drawBall, skinById, lighten, darken } from '../../game/js/skins.js';
import { drawSparkle } from '../../game/js/render.js';

const BOARD = [
  // a = cyan paint, b = coral, c = amber, . = unpainted, # = raised wall
  '#########',
  '#aaaaaaa#',
  '#a##.#.a#',
  '#a.....a#',
  '#acccc#a#',
  '#a#..#.a#',
  '#abbbb.a#',
  '#########',
];
const PAINT = { a: '#3ae5de', b: '#fd7861', c: '#fbbd2c' };

function drawSlab(ctx, cell, depth, wallH) {
  const rows = BOARD.length,
    cols = BOARD[0].length;
  const isFloor = (x, y) => y >= 0 && y < rows && x >= 0 && x < cols && BOARD[y][x] !== '#';
  ctx.save();
  ctx.translate(0, wallH);
  // Tray sides.
  ctx.fillStyle = '#b9ab92';
  ctx.fillRect(0, depth * 0.3, cols * cell, rows * cell + depth * 0.7);
  ctx.fillStyle = '#cfc2a8';
  ctx.fillRect(0, 0, cols * cell, rows * cell + depth * 0.45);
  const gap = cell * 0.04;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!isFloor(x, y)) continue;
      const ch = BOARD[y][x];
      const col = PAINT[ch] || '#515a71';
      ctx.fillStyle = PAINT[ch] ? darken(col, 0.08) : '#454d61';
      ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5);
      const g = ctx.createLinearGradient(0, y * cell, 0, (y + 1) * cell);
      g.addColorStop(0, PAINT[ch] ? lighten(col, 0.12) : '#586178');
      g.addColorStop(1, col);
      ctx.fillStyle = g;
      ctx.fillRect(x * cell + gap, y * cell + gap, cell - gap * 2, cell - gap * 2);
    }
    // Raised cream wall blocks for this row (drawn after the floor so they overlap it).
    for (let x = 0; x < cols; x++) {
      if (isFloor(x, y)) continue;
      const X = x * cell,
        Y = y * cell - wallH;
      ctx.fillStyle = '#d5ccbb';
      ctx.fillRect(X, Y + cell * 0.5, cell + 0.5, cell * 0.5 + wallH);
      ctx.fillStyle = '#fff8e4';
      ctx.fillRect(X, Y, cell + 0.5, cell);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(X, Y, cell + 0.5, cell * 0.05);
    }
  }
  ctx.restore();
}

function background(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#fff6c9');
  g.addColorStop(0.55, '#ffe0d6');
  g.addColorStop(1, '#e8d9ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Soft paint blobs.
  const blobs = [
    [0.12, 0.2, 0.28, 'rgba(58,229,222,0.25)'],
    [0.9, 0.15, 0.22, 'rgba(253,120,97,0.22)'],
    [0.85, 0.9, 0.3, 'rgba(164,92,242,0.18)'],
    [0.1, 0.92, 0.25, 'rgba(251,189,44,0.25)'],
  ];
  for (const [x, y, r, c] of blobs) {
    const rg = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * Math.max(W, H));
    rg.addColorStop(0, c);
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  }
  // Faint grid of rounded squares, like painted tiles.
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#515a71';
  const s = Math.max(W, H) / 22;
  for (let y = 0; y < H / s + 1; y++)
    for (let x = 0; x < W / s + 1; x++) if ((x * 7 + y * 3) % 5 === 0) roundRect(ctx, x * s + s * 0.1, y * s + s * 0.1, s * 0.8, s * 0.8, s * 0.18);
  ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

// Draws the tilted board with the ball rolling across it.
function drawScene(ctx, cx, cy, size) {
  const cols = BOARD[0].length,
    rows = BOARD.length;
  const cell = size / cols;
  const off = document.createElement('canvas');
  const depth = cell * 0.55,
    wallH = cell * 0.22;
  off.width = cols * cell + 4;
  off.height = rows * cell + depth + wallH + 4;
  const o = off.getContext('2d');
  drawSlab(o, cell, depth, wallH);

  ctx.save();
  ctx.translate(cx, cy);
  // Isometric-ish tilt (affine): rotate then squash vertically.
  const T = new DOMMatrix().scale(1, 0.72).rotate(-14).skewX(-6);
  ctx.setTransform(ctx.getTransform().multiply(T));
  ctx.shadowColor = 'rgba(70,40,80,0.35)';
  ctx.shadowBlur = cell * 0.8;
  ctx.shadowOffsetY = cell * 0.5;
  ctx.drawImage(off, (-cols * cell) / 2, (-rows * cell) / 2 - wallH);
  ctx.restore();

  // Ball sits on row 5 rolling right into the coral run, with a speed trail.
  const map = (gx, gy) => {
    const p = new DOMPoint((gx - cols / 2) * cell, (gy - rows / 2) * cell).matrixTransform(T);
    return [cx + p.x, cy + p.y];
  };
  const [bx, by] = map(5.5, 6.62);
  const [tx, ty] = map(2.0, 6.62);
  const r = cell * 0.62;
  ctx.save();
  ctx.lineCap = 'round';
  const tg = ctx.createLinearGradient(bx, by, tx, ty);
  tg.addColorStop(0, 'rgba(255,255,255,0.85)');
  tg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = tg;
  ctx.lineWidth = r * 1.3;
  ctx.beginPath();
  ctx.moveTo(bx, by - r * 0.55);
  ctx.lineTo(tx, ty - r * 0.55);
  ctx.stroke();
  // Speed lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = r * 0.12;
  for (const k of [-0.7, 0, 0.6]) {
    const [ax, ay] = map(4.4 - Math.abs(k) * 0.6, 6.62 + k * 0.35);
    const [ex, ey] = map(3.2 - Math.abs(k) * 0.6, 6.62 + k * 0.35);
    ctx.beginPath();
    ctx.moveTo(ax - r * 0.3, ay - r * 0.6);
    ctx.lineTo(ex - r * 0.3, ey - r * 0.6);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(30,20,50,0.3)';
  ctx.beginPath();
  ctx.ellipse(bx + r * 0.25, by + r * 0.15, r * 1.05, r * 0.45, -0.25, 0, Math.PI * 2);
  ctx.fill();
  drawBall(ctx, bx, by - r * 0.55, r, skinById('classic'), 0);

  // Paint splashes ahead of the ball.
  const cols2 = ['#fd7861', '#ffffff', '#fbbd2c', '#3ae5de'];
  for (let i = 0; i < 9; i++) {
    const [px, py] = map(5.2 + (i % 3) * 0.4, 6.0 + Math.floor(i / 3) * 0.4);
    ctx.fillStyle = cols2[i % 4];
    ctx.globalAlpha = 0.9;
    if (i % 2) drawSparkle(ctx, px + r * 0.6, py - r * 1.2, r * 0.32, i);
    else {
      ctx.beginPath();
      ctx.arc(px + r * 0.7, py - r * 1.0, r * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawTitle(ctx, x, y, size, align = 'center', stacked = false) {
  const lines = stacked ? [['SLIDE', '&'], ['PAINT']] : [['SLIDE', '&', 'PAINT']];
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const paint = ['#3ae5de', '#fd7861', '#fbbd2c', '#a45cf2', '#5ad16b'];
  lines.forEach((words, li) => {
    const ly = y + li * size * 0.98;
    // Measure the whole line.
    const parts = [];
    let total = 0;
    words.forEach((w, wi) => {
      const fs = w === '&' ? size * 0.72 : size;
      ctx.font = `700 ${fs}px Fredoka`;
      for (const ch of w) {
        const wch = ctx.measureText(ch).width;
        parts.push({ ch, fs, w: wch, word: w });
        total += wch + size * 0.01;
      }
      if (wi < words.length - 1) {
        parts.push({ ch: ' ', fs, w: size * 0.2 });
        total += size * 0.2;
      }
    });
    let px = align === 'center' ? x - total / 2 : x;
    let pi = 0;
    for (const p of parts) {
      if (p.ch === ' ') {
        px += p.w;
        continue;
      }
      ctx.font = `700 ${p.fs}px Fredoka`;
      const fill = p.word === 'PAINT' ? paint[pi++ % paint.length] : p.word === '&' ? '#ffbd2f' : '#515a71';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = 'rgba(80,40,80,0.28)';
      ctx.fillText(p.ch, px + size * 0.02, ly + size * 0.1);
      ctx.strokeText(p.ch, px, ly);
      ctx.fillStyle = darken(fill.startsWith('#') ? fill : '#515a71', 0.25);
      ctx.fillText(p.ch, px, ly + size * 0.045);
      ctx.fillStyle = fill;
      ctx.fillText(p.ch, px, ly);
      px += p.w + size * 0.01;
    }
  });
  ctx.restore();
}

export function drawCover(kind, canvas) {
  const sizes = { landscape: [1920, 1080], portrait: [800, 1200], square: [800, 800] };
  const [W, H] = sizes[kind];
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  background(ctx, W, H);
  if (kind === 'landscape') {
    drawScene(ctx, W * 0.66, H * 0.54, H * 0.86);
    drawTitle(ctx, W * 0.25, H * 0.46, H * 0.2, 'center', true);
  } else if (kind === 'portrait') {
    drawScene(ctx, W * 0.5, H * 0.66, W * 0.92);
    drawTitle(ctx, W * 0.5, H * 0.17, W * 0.2, 'center', true);
  } else {
    drawScene(ctx, W * 0.5, H * 0.63, W * 0.8);
    drawTitle(ctx, W * 0.5, H * 0.2, W * 0.128, 'center', false);
  }
}
