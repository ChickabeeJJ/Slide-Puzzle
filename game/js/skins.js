// Ball skins: each is a 3D surface model (tex) + material (mat) + effects (fx).
// tex(x, y, z, out, t, viewZ) receives a point on the unit sphere in the ball's
// own (rotating) space and writes out = [r, g, b, specMul, metal, emissive].
// `stars` = total stars needed to unlock, `ad` = unlocked by a rewarded ad.
import { renderSphere, previewRot, fbm, noise3, hash } from './ball3d.js';

const set = (o, r, g, b) => {
  o[0] = r;
  o[1] = g;
  o[2] = b;
};
const mix = (o, a, b, t) => {
  o[0] = a[0] + (b[0] - a[0]) * t;
  o[1] = a[1] + (b[1] - a[1]) * t;
  o[2] = a[2] + (b[2] - a[2]) * t;
};
function hsv(o, h, s, v) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6),
    f = h * 6 - i,
    p = v * (1 - s),
    q = v * (1 - f * s),
    u = v * (1 - (1 - f) * s);
  const c = [
    [v, u, p],
    [q, v, p],
    [p, v, u],
    [p, q, v],
    [u, p, v],
    [v, p, q],
  ][i % 6];
  set(o, c[0], c[1], c[2]);
}
const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

// Evenly spread points (polka dots).
const DOTS = Array.from({ length: 18 }, (_, i) => {
  const y = 1 - ((i + 0.5) / 18) * 2,
    r = Math.sqrt(1 - y * y),
    a = i * 2.39996;
  return [Math.cos(a) * r, y, Math.sin(a) * r];
});

export const SKINS = [
  {
    id: 'classic',
    name: 'Classic',
    stars: 0,
    base: '#ffffff',
    mat: { amb: 0.5, spec: 0.9, shin: 70, rim: 0.18 },
    // Pearl white with a seam, so the roll is visible.
    tex(x, y, z, o) {
      set(o, 0.96 + 0.03 * x, 0.96, 0.95 - 0.02 * x);
      const seam = Math.abs(z);
      if (seam < 0.035) set(o, 0.68, 0.73, 0.84);
      else if (seam < 0.07) set(o, 0.88, 0.9, 0.94);
    },
    fx: { trail: { type: 'soft', color: '#ffffff', width: 0.55 }, emit: { kind: 'dust', colors: ['#ffffff', '#e8e6df'], rate: 3 }, impact: { kind: 'dust', colors: ['#ffffff', '#dedbd2'], count: 8 } },
  },
  {
    id: 'sunny',
    name: 'Sunny',
    stars: 10,
    base: '#ffd23f',
    mat: { amb: 0.5, spec: 0.6, shin: 40, rim: 0.25, rimColor: [1, 0.6, 0.1] },
    // Smiley face on one side, sunburst rays on the back.
    tex(x, y, z, o) {
      set(o, 1, 0.82 - 0.08 * y, 0.2);
      if (z > 0) {
        const eye = Math.min(Math.hypot(x - 0.2, y + 0.18), Math.hypot(x + 0.2, y + 0.18));
        const mouth = Math.abs(Math.hypot(x, y + 0.02) - 0.34);
        if (eye < 0.075 || (mouth < 0.035 && y > 0.1)) set(o, 0.36, 0.2, 0.08);
        else if (Math.min(Math.hypot(x - 0.36, y - 0.08), Math.hypot(x + 0.36, y - 0.08)) < 0.08) set(o, 1, 0.55, 0.35);
      } else if (Math.sin(Math.atan2(y, x) * 8) > 0.55) set(o, 1, 0.68, 0.12);
    },
    fx: { trail: { type: 'glow', color: '#ffd23f', width: 0.6 }, emit: { kind: 'spark', colors: ['#fff3a6', '#ffd23f', '#ff9f1c'], rate: 4 }, impact: { kind: 'ray', colors: ['#ffd23f', '#ff9f1c'], count: 10 } },
  },
  {
    id: 'mint',
    name: 'Mint',
    stars: 25,
    base: '#7fe3c4',
    mat: { amb: 0.5, spec: 1, shin: 110, rim: 0.2 },
    // Peppermint candy swirl.
    tex(x, y, z, o) {
      const a = Math.atan2(y, x) * 6 + z * 7;
      if (Math.sin(a) > 0.1) set(o, 0.97, 0.99, 0.97);
      else set(o, 0.3, 0.86, 0.68);
    },
    fx: { trail: { type: 'soft', color: '#9ff0d6', width: 0.55 }, emit: { kind: 'confetti', colors: ['#ffffff', '#52d6aa', '#c8fbe8'], rate: 3 }, impact: { kind: 'star', colors: ['#ffffff', '#52d6aa'], count: 8 } },
  },
  {
    id: 'bubblegum',
    name: 'Bubblegum',
    stars: 45,
    base: '#ff8cc0',
    mat: { amb: 0.5, spec: 0.75, shin: 45, rim: 0.3, rimColor: [1, 0.85, 0.95] },
    // Glossy pink with polka dots.
    tex(x, y, z, o) {
      set(o, 1, 0.55, 0.74);
      for (let i = 0; i < DOTS.length; i++) {
        const d = DOTS[i];
        if (x * d[0] + y * d[1] + z * d[2] > 0.965) {
          if (i % 2) set(o, 1, 0.96, 0.98);
          else set(o, 0.9, 0.25, 0.55);
          break;
        }
      }
    },
    fx: { trail: { type: 'soft', color: '#ffb3d6', width: 0.6 }, emit: { kind: 'bubble', colors: ['#ff8cc0', '#ffc8e1'], rate: 2.2 }, impact: { kind: 'bubble', colors: ['#ff8cc0', '#ffd6ea'], count: 7 } },
  },
  {
    id: 'beach',
    name: 'Beach Ball',
    stars: 70,
    base: '#ff5a5a',
    mat: { amb: 0.5, spec: 0.85, shin: 60, rim: 0.18 },
    // Six coloured gores with white caps.
    tex(x, y, z, o) {
      if (Math.abs(y) > 0.9) return set(o, 0.98, 0.98, 0.97);
      const seg = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 6) % 6;
      const c = [
        [1, 0.32, 0.32],
        [1, 1, 1],
        [1, 0.82, 0.22],
        [1, 1, 1],
        [0.22, 0.62, 1],
        [1, 1, 1],
      ][seg];
      set(o, c[0], c[1], c[2]);
    },
    fx: { trail: { type: 'soft', color: '#9fd8ff', width: 0.55 }, emit: { kind: 'drop', colors: ['#5ab8ff', '#bfe6ff', '#ffffff'], rate: 3.5 }, impact: { kind: 'drop', colors: ['#5ab8ff', '#ffffff'], count: 10 } },
  },
  {
    id: 'eight',
    name: 'Eight Ball',
    stars: 100,
    base: '#24262e',
    mat: { amb: 0.45, spec: 1.2, shin: 130, rim: 0.35, rimColor: [0.6, 0.65, 0.8] },
    tex(x, y, z, o) {
      set(o, 0.07, 0.075, 0.09);
      if (z > 0.8) {
        set(o, 0.97, 0.97, 0.95);
        const a = Math.abs(Math.hypot(x, y + 0.12) - 0.1),
          b = Math.abs(Math.hypot(x, y - 0.11) - 0.12);
        if (Math.min(a, b) < 0.042) set(o, 0.07, 0.075, 0.09);
      }
    },
    fx: { trail: { type: 'smoke', color: '#3a3d4a', width: 0.7 }, emit: { kind: 'smoke', colors: ['#5b5f6e', '#8a8ea0'], rate: 2.5 }, impact: { kind: 'spark', colors: ['#ffffff', '#c8cde0'], count: 9 } },
  },
  {
    id: 'tennis',
    name: 'Tennis',
    stars: 140,
    base: '#d4f04c',
    mat: { amb: 0.55, spec: 0.12, shin: 8, rim: 0.45, rimColor: [0.95, 1, 0.75] },
    // Felt fuzz + the curved seam.
    tex(x, y, z, o) {
      const f = 0.86 + 0.24 * noise3(x * 22, y * 22, z * 22);
      set(o, 0.84 * f, 0.95 * f, 0.28 * f);
      const seam = 0.62 * Math.cos(2 * Math.atan2(y, x)) * Math.sqrt(1 - Math.min(1, z * z) * 0.3);
      if (Math.abs(z - seam) < 0.06) set(o, 0.98, 0.98, 0.94);
    },
    fx: { trail: { type: 'soft', color: '#e6fb8a', width: 0.5 }, emit: { kind: 'fuzz', colors: ['#d4f04c', '#f2ffb8'], rate: 4 }, impact: { kind: 'fuzz', colors: ['#d4f04c', '#ffffff'], count: 12 } },
  },
  {
    id: 'planet',
    name: 'Planet',
    stars: 190,
    base: '#a78bfa',
    mat: { amb: 0.4, spec: 0.3, shin: 20, rim: 0.55, rimColor: [0.75, 0.8, 1] },
    // Gas-giant bands with turbulence.
    tex(x, y, z, o) {
      const v = y * 5 + fbm(x * 2.5 + 7, y * 2.5, z * 2.5) * 2.2;
      const t = 0.5 + 0.5 * Math.sin(v * 1.7);
      mix(o, [0.48, 0.36, 0.86], [0.98, 0.82, 0.72], t);
      if (Math.hypot(x - 0.35, y - 0.3, z - 0.75) < 0.17) set(o, 0.85, 0.42, 0.42);
    },
    fx: { trail: { type: 'glow', color: '#c4b0ff', width: 0.6 }, emit: { kind: 'star', colors: ['#ffffff', '#d6c8ff', '#ffd6c0'], rate: 2.5 }, impact: { kind: 'star', colors: ['#ffffff', '#c4b0ff'], count: 9 }, ring: '#f0d9b5' },
  },
  {
    id: 'melon',
    name: 'Melon',
    stars: 250,
    base: '#6cc95a',
    mat: { amb: 0.5, spec: 0.55, shin: 35, rim: 0.2 },
    tex(x, y, z, o) {
      const a = Math.atan2(y, z) * 7 + 0.7 * Math.sin(x * 9);
      const n = 0.92 + 0.12 * noise3(x * 9, y * 9, z * 9);
      if (Math.sin(a) > 0.25) set(o, 0.12 * n, 0.42 * n, 0.16 * n);
      else set(o, 0.45 * n, 0.8 * n, 0.36 * n);
      if (x > 0.96) set(o, 0.5, 0.42, 0.2);
    },
    fx: { trail: { type: 'soft', color: '#ff8fa0', width: 0.55 }, emit: { kind: 'drop', colors: ['#ff4f6d', '#ff8fa0', '#2b2b2b'], rate: 3.5 }, impact: { kind: 'drop', colors: ['#ff4f6d', '#ff8fa0'], count: 10 } },
  },
  {
    id: 'eye',
    name: 'Eyeball',
    stars: 320,
    base: '#ffffff',
    mat: { amb: 0.5, spec: 1.1, shin: 120, rim: 0.2, rimColor: [1, 0.85, 0.85] },
    tex(x, y, z, o) {
      set(o, 0.98, 0.96, 0.94);
      if (z > 0.8) {
        const r = Math.hypot(x, y);
        const streak = 0.85 + 0.3 * noise3(Math.atan2(y, x) * 4, r * 20, 1);
        mix(o, [0.18 * streak, 0.62 * streak, 0.95 * streak], [0.08, 0.3, 0.6], smooth(0.35, 0.6, r));
        if (r < 0.22) set(o, 0.03, 0.03, 0.05);
      } else if (z < 0.45) {
        // A few thin veins creeping in from the back.
        const n = noise3(x * 3 + 5, y * 3, z * 3);
        if (Math.abs(n - 0.5) < 0.006 + (0.45 - z) * 0.012) set(o, 0.88, 0.32, 0.34);
      }
    },
    fx: { trail: { type: 'soft', color: '#cfe6ff', width: 0.5 }, emit: { kind: 'spark', colors: ['#7dc4ff', '#ffffff'], rate: 2.5 }, impact: { kind: 'spark', colors: ['#7dc4ff', '#ffffff'], count: 8 } },
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    stars: 420,
    base: '#ff5a5a',
    mat: { amb: 0.5, spec: 0.8, shin: 60, rim: 0.2 },
    tex(x, y, z, o) {
      const band = Math.floor((y * 0.5 + 0.5) * 7);
      const edge = ((y * 0.5 + 0.5) * 7) % 1;
      hsv(o, band / 7, 0.72, 1);
      if (edge < 0.08) set(o, 1, 1, 1);
    },
    fx: { trail: { type: 'rainbow', width: 0.7 }, emit: { kind: 'confetti', colors: ['#ff4d4d', '#ff9f1c', '#ffe14d', '#4cd964', '#3fa7ff', '#8e5cff'], rate: 4 }, impact: { kind: 'confetti', colors: ['#ff4d4d', '#ffe14d', '#4cd964', '#3fa7ff', '#8e5cff'], count: 14 } },
  },
  {
    id: 'galaxy',
    name: 'Galaxy',
    ad: true,
    base: '#3b2a7a',
    mat: { amb: 0.5, spec: 0.9, shin: 100, rim: 0.7, rimColor: [0.6, 0.45, 1], emis: 0.45 },
    // Swirling nebula with twinkling stars.
    tex(x, y, z, o, t) {
      const n = fbm(x * 2.2 + t * 0.15, y * 2.2, z * 2.2 + t * 0.1);
      mix(o, [0.05, 0.03, 0.18], [0.55, 0.2, 0.75], smooth(0.35, 0.75, n));
      const m = fbm(x * 3 + 9, y * 3, z * 3);
      if (m > 0.6) mix(o, [o[0], o[1], o[2]], [0.2, 0.75, 1], (m - 0.6) * 2.5);
      const cx = Math.floor(x * 26),
        cy = Math.floor(y * 26),
        cz = Math.floor(z * 26);
      const h = hash(cx, cy, cz);
      if (h > 0.965) {
        const tw = 0.6 + 0.4 * Math.sin(t * 5 + h * 80);
        set(o, tw, tw, 0.9 + 0.1 * tw);
        o[5] = 1;
      }
    },
    fx: { trail: { type: 'glow', color: '#9b6bff', width: 0.7 }, emit: { kind: 'star', colors: ['#ffffff', '#b49bff', '#7fe0ff', '#ff8ce8'], rate: 4.5 }, impact: { kind: 'star', colors: ['#ffffff', '#b49bff', '#7fe0ff'], count: 14 }, glow: '#8d5cff' },
  },
  {
    id: 'gold',
    name: 'Gold',
    ad: true,
    base: '#f5c542',
    mat: { amb: 0.4, spec: 1.3, shin: 55, rim: 0.3, rimColor: [1, 0.9, 0.6], metal: 1 },
    // Polished gold with an engraved band and a star emblem.
    tex(x, y, z, o) {
      const n = 0.94 + 0.08 * noise3(x * 30, y * 30, z * 30);
      set(o, 1 * n, 0.76 * n, 0.28 * n);
      if (Math.abs(y) < 0.05) set(o, 0.75, 0.52, 0.16);
      if (z > 0.86) {
        const a = Math.atan2(y, x),
          r = Math.hypot(x, y);
        const star = 0.28 * (0.55 + 0.45 * Math.cos(5 * a)) + 0.06;
        if (r < star) set(o, 1, 0.92, 0.6);
      }
    },
    fx: { trail: { type: 'glow', color: '#ffd76a', width: 0.65 }, emit: { kind: 'spark', colors: ['#fff6c9', '#ffd76a', '#ffb52e'], rate: 5 }, impact: { kind: 'coin', colors: ['#ffd76a', '#ffb52e'], count: 9 }, glow: '#ffcc40' },
  },
  {
    id: 'disco',
    name: 'Disco',
    ad: true,
    base: '#dfe5f0',
    mat: { amb: 0.4, spec: 1.1, shin: 30, rim: 0.4, metal: 0.85 },
    // Mirror tiles that catch the light and flash in colour.
    tex(x, y, z, o, t) {
      const lat = Math.asin(Math.max(-1, Math.min(1, y))),
        lon = Math.atan2(z, x);
      const rows = 12,
        row = Math.floor(((lat + Math.PI / 2) / Math.PI) * rows);
      const cols = Math.max(4, Math.round(rows * 2 * Math.cos(((row + 0.5) / rows) * Math.PI - Math.PI / 2)));
      const fu = ((lat + Math.PI / 2) / Math.PI) * rows - row;
      const fv = ((lon + Math.PI) / (Math.PI * 2)) * cols;
      const col = Math.floor(fv);
      if (fu < 0.1 || fv - col < 0.1) return set(o, 0.25, 0.27, 0.32);
      const h = hash(row, col, 7);
      const flash = hash(row, col, Math.floor(t * 8)) > 0.93;
      if (flash) {
        hsv(o, h * 3, 0.55, 1);
        o[4] = 0;
        o[5] = 1;
      } else set(o, 0.7 + 0.3 * h, 0.72 + 0.28 * h, 0.78 + 0.22 * h);
    },
    fx: { trail: { type: 'rainbow', width: 0.6, alpha: 0.5 }, emit: { kind: 'light', colors: ['#ff6fd8', '#6fd8ff', '#fff36f', '#8dff6f'], rate: 4 }, impact: { kind: 'light', colors: ['#ff6fd8', '#6fd8ff', '#fff36f'], count: 12 }, glow: '#c9d6ff', specks: true },
  },
];

export function skinById(id) {
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

// Draws a ball. `rot` is a 3x3 rotation matrix (gameplay) or a number (preview
// spin angle). sx/sy squash-and-stretch; t animates living skins.
export function drawBall(ctx, x, y, r, skin, rot = 0, sx = 1, sy = 1, t = 0) {
  const R = typeof rot === 'number' ? previewRot(rot) : rot;
  const m = ctx.getTransform();
  const scale = Math.hypot(m.a, m.b) || 1;
  const N = Math.max(12, Math.min(180, Math.ceil(2 * r * scale * Math.max(sx, sy))));
  const img = renderSphere(N, skin, R, t);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sx, sy);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, -r, -r, r * 2, r * 2);
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
