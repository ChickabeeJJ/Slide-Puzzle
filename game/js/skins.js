// Ball skins. `stars` = total stars needed to unlock, `ad` = unlocked by watching a rewarded ad.
export const SKINS = [
  { id: 'classic', name: 'Classic', stars: 0, base: '#ffffff', shade: '#cfd2cc' },
  { id: 'sunny', name: 'Sunny', stars: 10, base: '#ffe066', shade: '#e3a91c' },
  { id: 'mint', name: 'Mint', stars: 25, base: '#a8f0d1', shade: '#3fb98a' },
  { id: 'bubblegum', name: 'Bubblegum', stars: 45, base: '#ffb3d1', shade: '#e0588f' },
  { id: 'beach', name: 'Beach Ball', stars: 70, base: '#ffffff', shade: '#cfd2cc', pattern: 'beach' },
  { id: 'eight', name: 'Eight Ball', stars: 100, base: '#3a3d46', shade: '#111216', pattern: 'eight' },
  { id: 'tennis', name: 'Tennis', stars: 140, base: '#d8f25a', shade: '#9bbb17', pattern: 'tennis' },
  { id: 'planet', name: 'Planet', stars: 190, base: '#b48cff', shade: '#6a3fd1', pattern: 'planet' },
  { id: 'melon', name: 'Melon', stars: 250, base: '#7bd36a', shade: '#2f8a3a', pattern: 'melon' },
  { id: 'eye', name: 'Eyeball', stars: 320, base: '#ffffff', shade: '#d7d0d0', pattern: 'eye' },
  { id: 'rainbow', name: 'Rainbow', stars: 420, base: '#ffffff', shade: '#cccccc', pattern: 'rainbow' },
  { id: 'galaxy', name: 'Galaxy', ad: true, base: '#3b2a7a', shade: '#140c33', pattern: 'galaxy' },
  { id: 'gold', name: 'Gold', ad: true, base: '#ffe38a', shade: '#c08a12', pattern: 'shine' },
  { id: 'disco', name: 'Disco', ad: true, base: '#e4e9f2', shade: '#8d96a8', pattern: 'disco' },
];

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

// Draws a glossy 3D sphere: base shading, pattern, core shadow, bounced light,
// rim light, fresnel edge and a sharp specular highlight with a soft bloom.
// `roll` is a rotation (radians) used to animate patterns.
export function drawBall(ctx, x, y, r, skin, roll = 0, sx = 1, sy = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.closePath();
  // Diffuse body: light from the upper left.
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.05, -r * 0.08, -r * 0.1, r * 1.12);
  g.addColorStop(0, lighten(skin.base, 0.45));
  g.addColorStop(0.35, skin.base);
  g.addColorStop(0.8, mix(skin.base, skin.shade, 0.75));
  g.addColorStop(1, darkenColor(skin.shade, 0.25));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  ctx.clip();
  drawPattern(ctx, r, skin, roll);
  // Core shadow on the lower right, laid over the pattern so it reads as a sphere.
  const core = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.25, -r * 0.1, -r * 0.12, r * 1.25);
  core.addColorStop(0, 'rgba(0,0,0,0)');
  core.addColorStop(0.55, 'rgba(0,0,0,0.04)');
  core.addColorStop(0.85, 'rgba(20,20,40,0.24)');
  core.addColorStop(1, 'rgba(20,20,40,0.42)');
  ctx.fillStyle = core;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  // Bounced light from the floor along the bottom edge.
  const bounce = ctx.createRadialGradient(r * 0.1, r * 1.05, r * 0.1, r * 0.1, r * 1.05, r * 0.75);
  bounce.addColorStop(0, 'rgba(255,255,255,0.28)');
  bounce.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bounce;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  // Rim light on the top-left edge.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = r * 0.09;
  ctx.beginPath();
  ctx.arc(r * 0.05, r * 0.05, r * 0.99, Math.PI * 0.95, Math.PI * 1.55);
  ctx.stroke();
  ctx.restore();
  // Fine outline so light balls stay readable on light tiles.
  ctx.lineWidth = Math.max(1, r * 0.035);
  ctx.strokeStyle = 'rgba(40,40,60,0.18)';
  ctx.stroke();
  // Soft highlight bloom + sharp specular.
  const h = ctx.createRadialGradient(-r * 0.36, -r * 0.42, 0, -r * 0.36, -r * 0.42, r * 0.5);
  h.addColorStop(0, 'rgba(255,255,255,0.75)');
  h.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = h;
  ctx.beginPath();
  ctx.arc(-r * 0.36, -r * 0.42, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, -r * 0.46, r * 0.17, r * 0.1, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-r * 0.12, -r * 0.6, r * 0.045, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function parse(c) {
  if (c.startsWith('#')) {
    const n = parseInt(c.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  return c.match(/\d+/g).slice(0, 3).map(Number);
}
function mix(a, b, t) {
  const A = parse(a),
    B = parse(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
function darkenColor(c, amt) {
  return `rgb(${parse(c).map((v) => Math.round(v * (1 - amt))).join(',')})`;
}

function drawPattern(ctx, r, skin, roll) {
  const p = skin.pattern;
  if (!p) return;
  ctx.save();
  ctx.rotate(roll);
  switch (p) {
    case 'beach': {
      const cols = ['#ff5a5a', '#ffd23f', '#3fa7ff', '#ffffff', '#ff5a5a', '#ffd23f'];
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, (i * Math.PI) / 3, ((i + 1) * Math.PI) / 3);
        ctx.fill();
      }
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'eight': {
      ctx.rotate(-roll);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(r * 0.05, r * 0.02, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = `700 ${r * 0.6}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('8', r * 0.05, r * 0.06);
      break;
    }
    case 'tennis': {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.arc(-r * 1.15, 0, r * 0.95, -0.9, 0.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r * 1.15, 0, r * 0.95, Math.PI - 0.9, Math.PI + 0.9);
      ctx.stroke();
      break;
    }
    case 'planet': {
      ctx.rotate(-roll - 0.4);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-r, -r * 0.12, r * 2, r * 0.14);
      ctx.fillStyle = 'rgba(80,30,160,0.35)';
      ctx.fillRect(-r, r * 0.25, r * 2, r * 0.16);
      ctx.fillRect(-r, -r * 0.5, r * 2, r * 0.1);
      break;
    }
    case 'melon': {
      ctx.fillStyle = '#2f8a3a';
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.ellipse(i * r * 0.36, 0, r * 0.08, r * 1.1, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'eye': {
      ctx.rotate(-roll);
      ctx.fillStyle = '#3fa1ff';
      ctx.beginPath();
      ctx.arc(r * 0.15, r * 0.1, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(r * 0.18, r * 0.12, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,60,60,0.5)';
      ctx.lineWidth = r * 0.04;
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3 + 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.quadraticCurveTo(Math.cos(a + 0.3) * r * 0.75, Math.sin(a + 0.3) * r * 0.75, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
        ctx.stroke();
      }
      break;
    }
    case 'rainbow': {
      const cols = ['#ff4d4d', '#ff9f1c', '#ffe14d', '#4cd964', '#3fa7ff', '#8e5cff'];
      cols.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(-r, -r + (i * 2 * r) / 6, r * 2, (2 * r) / 6 + 1);
      });
      break;
    }
    case 'galaxy': {
      const g = ctx.createRadialGradient(r * 0.2, r * 0.1, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(255,120,220,0.6)');
      g.addColorStop(1, 'rgba(255,120,220,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, 2 * r, 2 * r);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39996,
          d = r * Math.sqrt((i + 0.5) / 14) * 0.95;
        ctx.globalAlpha = 0.5 + (i % 3) * 0.25;
        ctx.fillRect(Math.cos(a) * d, Math.sin(a) * d, r * 0.07, r * 0.07);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'shine': {
      ctx.rotate(-roll - 0.6);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(-r, -r * 0.2, r * 2, r * 0.18);
      ctx.fillRect(-r, r * 0.12, r * 2, r * 0.07);
      break;
    }
    case 'disco': {
      const n = 6,
        cs = (2 * r) / n;
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const v = ((i * 7 + j * 13) % 5) / 5;
          ctx.fillStyle = `hsl(${(i * 40 + j * 25) % 360},60%,${60 + v * 30}%)`;
          ctx.fillRect(-r + i * cs + 1, -r + j * cs + 1, cs - 2, cs - 2);
        }
      break;
    }
  }
  ctx.restore();
}

export function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16,
    g = (n >> 8) & 255,
    b = n & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return `rgb(${r},${g},${b})`;
}

export function darken(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round((n >> 16) * (1 - amt)),
    g = Math.round(((n >> 8) & 255) * (1 - amt)),
    b = Math.round((n & 255) * (1 - amt));
  return `rgb(${r},${g},${b})`;
}
