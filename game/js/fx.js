// Per-skin visual effects: trails, particles emitted while rolling, wall-impact
// bursts, and decorations drawn under/over the ball (glow, rings, disco lights).
// Positions are in board cells; the renderer converts with view {s, ox, oy}.

const TRAIL_LIFE = 0.42;
const RAINBOW = ['#ff4d4d', '#ff9f1c', '#ffe14d', '#4cd964', '#3fa7ff', '#8e5cff'];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function resetFx(g) {
  g.trail = [];
  g.fxAcc = 0;
}

// Called every frame while the ball rolls (cx, cy = ball centre in cells).
export function trackRolling(g, skin, cx, cy, movedCells, dx, dy) {
  g.trail.push({ x: cx, y: cy, t: g.now });
  const e = skin.fx.emit;
  if (!e) return;
  g.fxAcc += movedCells * e.rate;
  while (g.fxAcc >= 1) {
    g.fxAcc -= 1;
    const side = rnd(-0.28, 0.28);
    spawn(g, e.kind, pick(e.colors), cx - dx * 0.3 + -dy * side, cy - dy * 0.3 + dx * side, -dx * rnd(0.3, 1.4) - dy * side * 2, -dy * rnd(0.3, 1.4) + dx * side * 2);
  }
}

export function impactFx(g, skin, cx, cy, dx, dy) {
  const im = skin.fx.impact;
  if (!im) return;
  const hx = cx + dx * 0.36,
    hy = cy + dy * 0.36;
  for (let i = 0; i < im.count; i++) {
    const a = Math.atan2(-dy, -dx) + rnd(-1.3, 1.3);
    const sp = rnd(1.2, 3.2);
    spawn(g, im.kind, pick(im.colors), hx, hy, Math.cos(a) * sp, Math.sin(a) * sp, i);
  }
  // Soft shockwave ring in the skin's trail colour.
  g.particles.push({ kind: 'wave', x: hx, y: hy, vx: 0, vy: 0, r: 0.2, color: skin.fx.trail.color || '#ffffff', t0: g.now, life: 0.35 });
}

function spawn(g, kind, color, x, y, vx, vy, i = 0) {
  const p = { kind, color, x, y, vx, vy, t0: g.now, life: rnd(0.35, 0.7), r: rnd(0.04, 0.08), rot: rnd(0, 6.28), vr: rnd(-8, 8), drag: 2.5 };
  if (kind === 'bubble') Object.assign(p, { r: rnd(0.06, 0.13), life: rnd(0.5, 0.9), drag: 3 });
  if (kind === 'smoke') Object.assign(p, { r: rnd(0.1, 0.18), life: rnd(0.5, 0.8), drag: 4 });
  if (kind === 'ray') Object.assign(p, { life: 0.3, angle: (i / 10) * Math.PI * 2, r: 0.5 });
  if (kind === 'confetti') Object.assign(p, { r: rnd(0.04, 0.07), life: rnd(0.5, 0.9) });
  if (kind === 'light') Object.assign(p, { r: rnd(0.07, 0.12), life: rnd(0.4, 0.7) });
  if (kind === 'coin') Object.assign(p, { r: rnd(0.07, 0.1), life: rnd(0.5, 0.8), drag: 2 });
  g.particles.push(p);
}

export function stepParticles(g, dt) {
  for (const p of g.particles) {
    const k = Math.exp(-(p.drag || 0) * dt);
    p.vx = (p.vx || 0) * k;
    p.vy = (p.vy || 0) * k;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.rot !== undefined) p.rot += (p.vr || 0) * dt;
  }
  g.particles = g.particles.filter((p) => g.now - p.t0 < p.life);
  if (g.trail.length) {
    const cut = g.trail.findIndex((q) => g.now - q.t < TRAIL_LIFE);
    if (cut === -1) g.trail = [];
    else if (cut > 0) g.trail.splice(0, cut);
  }
}

// ---------- Drawing ----------

// The trail is drawn as continuous strokes (one per straight run) with a
// gradient that fades toward the tail, so overlapping alpha never "beads".
export function drawTrail(ctx, g, skin) {
  const pts = g.trail;
  if (pts.length < 2) return;
  const { s, ox, oy } = g.view;
  const tr = skin.fx.trail;
  const W = tr.width * s;
  // Split into straight runs (a corner or a pause starts a new run).
  const runs = [];
  let run = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = run[run.length - 1],
      b = pts[i];
    const straight = run.length < 2 || Math.abs((b.x - a.x) * (a.y - run[0].y) - (b.y - a.y) * (a.x - run[0].x)) < 1e-6;
    if (b.t - a.t > 0.12 || !straight) {
      if (run.length > 1) runs.push(run);
      run = b.t - a.t > 0.12 ? [b] : [a, b];
    } else run.push(b);
  }
  if (run.length > 1) runs.push(run);

  ctx.save();
  ctx.lineCap = 'round';
  for (const r of runs) {
    const tail = r[0],
      head = r[r.length - 1];
    const kh = 1 - (g.now - head.t) / TRAIL_LIFE,
      kt = Math.max(0, 1 - (g.now - tail.t) / TRAIL_LIFE);
    if (kh <= 0) continue;
    const x0 = ox + tail.x * s,
      y0 = oy + tail.y * s,
      x1 = ox + head.x * s,
      y1 = oy + head.y * s;
    if (Math.hypot(x1 - x0, y1 - y0) < 1) continue;
    const stroke = (color, width, alpha, offX = 0, offY = 0) => {
      const gr = ctx.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, hexA(color, alpha * kt * kt));
      gr.addColorStop(1, hexA(color, alpha * kh));
      ctx.strokeStyle = gr;
      ctx.lineWidth = Math.max(1, width);
      ctx.beginPath();
      ctx.moveTo(x0 + offX, y0 + offY);
      ctx.lineTo(x1 + offX, y1 + offY);
      ctx.stroke();
    };
    const w = W * (0.45 + 0.55 * kh);
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = -(y1 - y0) / len,
      ny = (x1 - x0) / len;
    if (tr.type === 'soft') {
      stroke(tr.color, w, 0.55);
    } else if (tr.type === 'glow') {
      stroke(tr.color, w * 1.7, 0.2);
      stroke(tr.color, w, 0.55);
      stroke('#ffffff', w * 0.3, 0.85);
    } else if (tr.type === 'smoke') {
      const wob = Math.sin(g.now * 18) * s * 0.04;
      stroke(tr.color, w * 1.4, 0.18, nx * wob, ny * wob);
      stroke(tr.color, w * 0.75, 0.32);
    } else if (tr.type === 'rainbow') {
      const bw = w / RAINBOW.length;
      RAINBOW.forEach((c, j) => {
        const off = (j - (RAINBOW.length - 1) / 2) * bw;
        stroke(c, bw + 0.8, tr.alpha ?? 0.8, nx * off, ny * off);
      });
    }
  }
  ctx.restore();
}

export function drawParticles(ctx, g, drawSparkle) {
  const { s, ox, oy } = g.view;
  for (const p of g.particles) {
    const t = (g.now - p.t0) / p.life;
    if (t >= 1 || t < 0) continue;
    const px = ox + p.x * s,
      py = oy + p.y * s;
    const r = p.r * s;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;
    switch (p.kind) {
      case 'spark':
      case 'star': {
        const tw = p.kind === 'star' ? 0.6 + 0.4 * Math.sin(g.now * 20 + p.t0 * 50) : 1;
        drawSparkle(ctx, px, py, r * 2.4 * tw * (1 - t * 0.4), p.rot);
        break;
      }
      case 'bubble': {
        const rr = r * (0.6 + t * 0.7);
        ctx.globalAlpha = t > 0.85 ? (1 - t) * 4 : 0.75;
        ctx.lineWidth = Math.max(1, s * 0.022);
        ctx.beginPath();
        ctx.arc(px, py, rr * (t > 0.85 ? 1.3 : 1), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha *= 0.25;
        ctx.fill();
        ctx.globalAlpha = 0.85 * (1 - t);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px - rr * 0.35, py - rr * 0.35, rr * 0.22, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'drop': {
        const a = Math.atan2(p.vy, p.vx);
        const st = 1 + Math.min(2, Math.hypot(p.vx, p.vy) * 0.6);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * st, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'confetti': {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.rot * 1.7));
        ctx.fillRect(-r, -r * 0.55, r * 2, r * 1.1);
        ctx.restore();
        break;
      }
      case 'smoke': {
        const rr = r * (1 + t * 1.6);
        const gr = ctx.createRadialGradient(px, py, 0, px, py, rr);
        gr.addColorStop(0, p.color);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.45 * (1 - t);
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'fuzz': {
        ctx.lineWidth = Math.max(1, s * 0.02);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(p.rot) * r * 1.6, py + Math.sin(p.rot) * r * 1.6);
        ctx.stroke();
        break;
      }
      case 'light': {
        const gr = ctx.createRadialGradient(px, py, 0, px, py, r * 1.6);
        gr.addColorStop(0, '#ffffff');
        gr.addColorStop(0.35, p.color);
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(px, py, r * 1.6, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'ray': {
        const d0 = s * (0.15 + t * 0.5),
          d1 = s * (0.35 + t * 0.7);
        ctx.lineWidth = Math.max(1.5, s * 0.05 * (1 - t));
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(p.angle) * d0, py + Math.sin(p.angle) * d0);
        ctx.lineTo(px + Math.cos(p.angle) * d1, py + Math.sin(p.angle) * d1);
        ctx.stroke();
        break;
      }
      case 'coin': {
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(Math.cos(p.rot * 1.5), 1);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff3b0';
        ctx.beginPath();
        ctx.arc(-r * 0.25, -r * 0.25, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'wave': {
        ctx.globalAlpha = 0.55 * (1 - t);
        ctx.lineWidth = Math.max(1, s * 0.05 * (1 - t));
        ctx.beginPath();
        ctx.arc(px, py, s * (0.15 + t * 0.55), 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      default: {
        // Paint particles and dust.
        if (p.star) drawSparkle(ctx, px, py, r * 2, g.now * 3 + p.t0);
        else {
          ctx.beginPath();
          ctx.arc(px, py, r * (1 - t * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  ctx.globalAlpha = 1;
}

// Glow halo, back half of the planet ring, disco light specks on the floor.
export function drawBallUnder(ctx, g, skin, cx, cy, r) {
  const fx = skin.fx;
  if (fx.glow) {
    const pulse = 1 + 0.08 * Math.sin(g.now * 4);
    const gr = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 2 * pulse);
    gr.addColorStop(0, hexA(fx.glow, 0.45));
    gr.addColorStop(1, hexA(fx.glow, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  if (fx.specks) {
    const cols = ['#ff6fd8', '#6fd8ff', '#fff36f', '#8dff6f'];
    for (let i = 0; i < 10; i++) {
      const a = g.now * 0.8 + i * 0.628,
        d = r * (1.6 + 0.9 * ((i * 7) % 3));
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(g.now * 6 + i);
      ctx.fillStyle = cols[i % 4];
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (fx.ring) drawRing(ctx, cx, cy, r, fx.ring, true);
}

export function drawBallOver(ctx, g, skin, cx, cy, r) {
  if (skin.fx.ring) drawRing(ctx, cx, cy, r, skin.fx.ring, false);
}

function drawRing(ctx, cx, cy, r, color, back) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.38);
  ctx.lineCap = 'butt';
  const a0 = back ? Math.PI : 0,
    a1 = back ? Math.PI * 2 : Math.PI;
  ctx.strokeStyle = color;
  ctx.globalAlpha = back ? 0.7 : 0.95;
  ctx.lineWidth = r * 0.2;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.62, r * 0.48, 0, a0, a1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(120,80,60,0.45)';
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.5, r * 0.43, 0, a0, a1);
  ctx.stroke();
  ctx.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
