import { drawBall, lighten, darken } from './skins.js';
import { DIRS } from './levelgen.js';
import { drawTrail, drawParticles, drawBallUnder, drawBallOver } from './fx.js';

export const COLORS = {
  bg: '#fffbdf',
  floor: '#515a71',
  floorLine: '#454d61',
  face: '#d5ccbb',
  faceDark: '#c2b8a5',
  side: '#9c9184',
  shadow: 'rgba(80, 60, 40, 0.22)',
};

// Paint colours cycle per level (level 37 is cyan like the reference).
export const PAINTS = ['#3ae5de', '#fd7861', '#fbbd2c', '#a45cf2', '#5ad16b', '#ff6fae', '#4f8dff', '#ff9a3c'];
export const paintFor = (n) => PAINTS[(((n - 37) % PAINTS.length) + PAINTS.length) % PAINTS.length];

export function layoutBoard(lv, rect) {
  const s = Math.max(8, Math.min(rect.w / (lv.w + 0.5), rect.h / (lv.h + 0.7), 124));
  const bw = s * lv.w,
    bh = s * lv.h;
  return { s, ox: rect.x + (rect.w - bw) / 2, oy: rect.y + (rect.h - bh) / 2 + s * 0.1 };
}

const ease = {
  outBack: (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
};

// game: { lv, view, painted, paintTime, color, ball, particles, hintPts, celebrate, shake, intro, now }
export function drawGame(ctx, W, H, g) {
  const { lv, view, now } = g;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);
  if (!lv) return;
  const { s } = view;

  ctx.save();
  // Bump shake along the direction of the last impact.
  if (g.shake) {
    const t = (now - g.shake.t0) / 0.14;
    if (t < 1) {
      const a = Math.sin(t * Math.PI) * s * 0.018 * g.shake.k * (1 - t);
      ctx.translate(g.shake.dx * a, g.shake.dy * a);
    }
  }
  // Intro: board settles in.
  let introT = 1;
  if (g.intro) {
    introT = Math.min(1, (now - g.intro) / 0.45);
    const k = 0.9 + 0.1 * ease.outBack(introT);
    const cx = view.ox + (lv.w * s) / 2,
      cy = view.oy + (lv.h * s) / 2;
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = ease.outCubic(introT);
  }

  drawBoard(ctx, g);
  drawHint(ctx, g);
  drawEffects(ctx, g);
  drawBallLayer(ctx, g);
  drawTutorialHand(ctx, g);
  ctx.restore();

  if (g.celebrate) drawCelebrate(ctx, W, H, g);
}

function drawBoard(ctx, g) {
  const { lv, view, painted, paintTime, color, now } = g;
  const { s, ox, oy } = view;
  const gap = Math.max(1, s * 0.035);
  const lineColor = darken(color, 0.06);
  const cel = g.celebrate;

  // Soft drop shadow under the whole floor.
  ctx.fillStyle = COLORS.shadow;
  for (let y = 0; y < lv.h; y++)
    for (let x = 0; x < lv.w; x++) if (lv.floor[y * lv.w + x]) ctx.fillRect(ox + x * s + s * 0.06, oy + y * s + s * 0.1, s, s);

  for (let y = 0; y < lv.h; y++) {
    for (let x = 0; x < lv.w; x++) {
      const i = y * lv.w + x;
      if (!lv.floor[i]) continue;
      const X = ox + x * s,
        Y = oy + y * s;
      ctx.fillStyle = painted[i] ? lineColor : COLORS.floorLine;
      ctx.fillRect(X, Y, s + 0.5, s + 0.5);
      ctx.fillStyle = COLORS.floor;
      ctx.fillRect(X + gap / 2, Y + gap / 2, s - gap, s - gap);
      if (painted[i]) {
        const t = Math.min(1, (now - paintTime[i]) / 0.22);
        let fill = color;
        if (cel) {
          // Ripple of light spreading out from the ball when the level is completed.
          const d = Math.hypot(x - cel.x, y - cel.y);
          const w = (now - cel.t0) * 14 - d;
          if (w > 0 && w < 2.5) fill = lighten(color, 0.45 * Math.sin((w / 2.5) * Math.PI));
        }
        ctx.fillStyle = t < 1 ? lighten(color, 0.5 * (1 - t)) : fill;
        const k = t < 1 ? 0.55 + 0.45 * ease.outBack(t) : 1;
        const inset = ((1 - k) * s) / 2;
        ctx.fillRect(X + gap / 2 + inset, Y + gap / 2 + inset, s - gap - inset * 2, s - gap - inset * 2);
      }
    }
  }

  // Raised walls: the south face of a wall is visible over the floor below it,
  // and thin side faces give the board depth, like the reference.
  const fh = s * 0.24,
    sw = s * 0.07;
  for (let y = 0; y < lv.h; y++) {
    for (let x = 0; x < lv.w; x++) {
      if (!lv.floor[y * lv.w + x]) continue;
      const X = ox + x * s,
        Y = oy + y * s;
      const wallUp = !(y > 0 && lv.floor[(y - 1) * lv.w + x]);
      const wallLeft = !(x > 0 && lv.floor[y * lv.w + x - 1]);
      const wallRight = !(x < lv.w - 1 && lv.floor[y * lv.w + x + 1]);
      if (wallLeft) {
        ctx.fillStyle = COLORS.side;
        ctx.fillRect(X, Y, sw, s + 0.5);
      }
      if (wallRight) {
        ctx.fillStyle = COLORS.side;
        ctx.fillRect(X + s - sw, Y, sw, s + 0.5);
      }
      if (wallUp) {
        ctx.fillStyle = COLORS.face;
        ctx.fillRect(X - 0.25, Y, s + 0.5, fh);
        ctx.fillStyle = COLORS.faceDark;
        ctx.fillRect(X - 0.25, Y + fh - Math.max(1, s * 0.03), s + 0.5, Math.max(1, s * 0.03));
      }
    }
  }
}

function drawHint(ctx, g) {
  if (!g.hintPts || g.hintPts.length < 2) return;
  const { s, ox, oy } = g.view;
  const pulse = 0.65 + 0.35 * Math.sin(g.now * 6);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pts = g.hintPts.map(([x, y]) => [ox + (x + 0.5) * s, oy + (y + 0.5) * s]);
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1],
      [x1, y1] = pts[i];
    ctx.globalAlpha = pulse * (i === 1 ? 1 : 0.55);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = s * 0.14;
    ctx.setLineDash([s * 0.18, s * 0.22]);
    ctx.lineDashOffset = -g.now * s * 1.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.setLineDash([]);
    // Arrow head.
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x1 + Math.cos(a) * s * 0.28, y1 + Math.sin(a) * s * 0.28);
    ctx.lineTo(x1 + Math.cos(a + 2.4) * s * 0.3, y1 + Math.sin(a + 2.4) * s * 0.3);
    ctx.lineTo(x1 + Math.cos(a - 2.4) * s * 0.3, y1 + Math.sin(a - 2.4) * s * 0.3);
    ctx.fill();
    // Step number.
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffbd2f';
    ctx.beginPath();
    ctx.arc(x1, y1, s * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${s * 0.26}px Fredoka, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i), x1, y1 + s * 0.02);
  }
  ctx.restore();
}

function drawEffects(ctx, g) {
  drawTrail(ctx, g, g.skin);
  drawParticles(ctx, g, drawSparkle);
}

function drawBallLayer(ctx, g) {
  const { s, ox, oy } = g.view;
  const b = g.ball;
  const r = s * 0.36;
  const cx = ox + (b.x + 0.5) * s,
    cy = oy + (b.y + 0.5) * s;
  let sx = 1,
    sy = 1;
  if (b.moving) {
    const [dx] = DIRS[b.dir];
    if (dx) sx = 1.12;
    else sy = 1.12;
    if (dx) sy = 0.92;
    else sx = 0.92;
  } else if (b.squash) {
    const t = (g.now - b.squash.t0) / 0.22;
    if (t < 1) {
      const k = Math.sin(t * Math.PI) * 0.22 * (1 - t);
      if (b.squash.dx) {
        sx = 1 - k;
        sy = 1 + k;
      } else {
        sy = 1 - k;
        sx = 1 + k;
      }
    }
  }
  drawBallUnder(ctx, g, g.skin, cx, cy, r);
  // Shadow.
  const sh = ctx.createRadialGradient(cx + r * 0.2, cy + r * 0.45, 0, cx + r * 0.2, cy + r * 0.45, r * 1.1);
  sh.addColorStop(0, 'rgba(25, 25, 45, 0.42)');
  sh.addColorStop(0.5, 'rgba(25, 25, 45, 0.18)');
  sh.addColorStop(1, 'rgba(25, 25, 45, 0)');
  ctx.fillStyle = sh;
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.2, cy + r * 0.45, r * 1.1 * sx, r * 0.75 * sy, 0, 0, Math.PI * 2);
  ctx.fill();
  drawBall(ctx, cx, cy, r, g.skin, b.rot, sx, sy, g.now);
  drawBallOver(ctx, g, g.skin, cx, cy, r);
}

// Animated swipe gesture for the level-1 tutorial: a finger slides from the ball
// along the next move, then fades and repeats.
function drawTutorialHand(ctx, g) {
  if (!g.tut || g.ball.moving || !g.hintPts || g.hintPts.length < 2) return;
  const { s, ox, oy } = g.view;
  const [x0, y0] = g.hintPts[0],
    [x1, y1] = g.hintPts[1];
  const dx = Math.sign(x1 - x0),
    dy = Math.sign(y1 - y0);
  const t = ((g.now - g.tut.t0) % 1.4) / 1.4;
  const p = ease.outCubic(Math.min(1, t / 0.7));
  const alpha = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1;
  const fx = ox + (x0 + 0.5 + dx * p * 1.8) * s,
    fy = oy + (y0 + 0.5 + dy * p * 1.8) * s;
  ctx.save();
  ctx.globalAlpha = alpha;
  // Touch ripple + finger.
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.arc(fx, fy, s * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${s * 0.75}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 6;
  ctx.fillText('👆', fx + s * 0.08, fy - s * 0.05);
  ctx.restore();
}

export function drawSparkle(ctx, x, y, r, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot * 0.2);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const d = i % 2 ? r * 0.28 : r;
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCelebrate(ctx, W, H, g) {
  const c = g.celebrate;
  const t = g.now - c.t0;
  const a = Math.min(1, t / 0.35);
  // Purple vignette like the reference.
  const cx = W / 2,
    cy = g.view.oy + (g.lv.h * g.view.s) / 2;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
  grad.addColorStop(0, `rgba(60, 30, 70, ${0.5 * a})`);
  grad.addColorStop(1, `rgba(120, 80, 120, ${0.35 * a})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Praise text.
  const size = Math.min(W * 0.11, H * 0.11, 110);
  const k = t < 0.5 ? ease.outBack(Math.min(1, t / 0.5)) : 1 + Math.sin((t - 0.5) * 3) * 0.02;
  // The text fades out once the results card appears.
  const textAlpha = 1 - Math.max(0, Math.min(1, (t - 1.3) / 0.25));
  if (textAlpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = textAlpha;
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  ctx.font = `700 ${size}px Fredoka, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#c47a10';
  ctx.fillText(c.text, 0, size * 0.07);
  ctx.fillStyle = '#ffb92e';
  ctx.fillText(c.text, 0, 0);
  ctx.restore();

  // Twinkling sparkles around the text.
  const cols = ['#ffffff', '#ffe58a', '#ff7ad9', '#ffffff'];
  for (let i = 0; i < c.sparkles.length; i++) {
    const sp = c.sparkles[i];
    const tw = Math.sin((t - sp.d) * 7);
    if (t < sp.d || tw < 0) continue;
    ctx.fillStyle = cols[i % cols.length];
    ctx.globalAlpha = a * tw * textAlpha;
    drawSparkle(ctx, cx + sp.x * W * 0.42, cy + sp.y * size * 2.4, size * 0.22 * sp.s, t);
  }
  ctx.globalAlpha = 1;
}
