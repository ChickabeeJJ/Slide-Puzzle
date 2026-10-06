// Tiny real-time 3D sphere renderer (no WebGL / no dependencies).
// Each ball is ray-cast per pixel into a small offscreen buffer: the view-space
// normal is rotated into the ball's object space with its rotation matrix, the
// skin's 3D surface function gives albedo/material there, and the pixel is lit
// with diffuse + Blinn-Phong specular + fresnel rim + environment reflection.
// Rolling is a true 3D rotation, so patterns turn exactly like a rolling ball.

const L = norm([-0.45, -0.6, 0.66]); // light: upper-left, toward the viewer
const H = norm([L[0], L[1], L[2] + 1]); // half vector with view dir (0,0,1)

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

// ---------- Rotation matrices (row-major 3x3, object -> view) ----------
export function rotIdentity() {
  return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
}

export function rotAxis(x, y, z, a) {
  const l = Math.hypot(x, y, z) || 1;
  x /= l;
  y /= l;
  z /= l;
  const c = Math.cos(a),
    s = Math.sin(a),
    t = 1 - c;
  return new Float64Array([t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c]);
}

export function rotMul(A, B) {
  const o = new Float64Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return o;
}

// Roll the ball `ang` radians in screen direction (dx, dy). The board is the
// x/y plane and +z points at the viewer, so the axis is up x direction.
export function rollBall(R, dx, dy, ang) {
  const M = rotMul(rotAxis(-dy, dx, 0, ang), R);
  // Re-orthonormalise (Gram-Schmidt on rows) to stop drift over long sessions.
  const a = norm([M[0], M[1], M[2]]);
  let b = [M[3], M[4], M[5]];
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  b = norm([b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]]);
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  R.set([a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]]);
}

// A pleasant 3/4 orientation for previews; `a` spins it.
export function previewRot(a) {
  return rotMul(rotAxis(1, 0, 0, -0.35), rotAxis(0, 1, 0, a));
}

// ---------- Noise ----------
function hash3(x, y, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440670441)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const hash = hash3;

export function noise3(x, y, z) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z);
  const xf = x - xi,
    yf = y - yi,
    zf = z - zi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf),
    w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w,
  );
}

export function fbm(x, y, z) {
  return noise3(x, y, z) * 0.55 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.15;
}

// ---------- Per-size geometry cache ----------
const geoCache = new Map();
function geom(N) {
  let G = geoCache.get(N);
  if (G) return G;
  const n = N * N;
  G = {
    nx: new Float32Array(n),
    ny: new Float32Array(n),
    nz: new Float32Array(n),
    a: new Float32Array(n),
    dif: new Float32Array(n),
    ndh: new Float32Array(n),
    fres: new Float32Array(n),
    env: new Float32Array(n),
  };
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      let u = ((i + 0.5) / N) * 2 - 1,
        v = ((j + 0.5) / N) * 2 - 1;
      const d = Math.hypot(u, v);
      G.a[k] = Math.max(0, Math.min(1, (1 - d) * N * 0.5 + 0.5));
      if (G.a[k] === 0) continue;
      if (d > 0.999) {
        u /= d / 0.999;
        v /= d / 0.999;
      }
      const z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
      G.nx[k] = u;
      G.ny[k] = v;
      G.nz[k] = z;
      G.dif[k] = Math.max(0, u * L[0] + v * L[1] + z * L[2]);
      G.ndh[k] = Math.max(0, u * H[0] + v * H[1] + z * H[2]);
      G.fres[k] = Math.pow(1 - z, 3);
      // Environment seen in the mirror direction: bright sky/window above, warm floor below.
      const ry = 2 * z * v,
        rz = 2 * z * z - 1,
        rx = 2 * z * u;
      const sky = 0.45 + 0.55 * Math.max(0, -ry);
      const glint = Math.pow(Math.max(0, rx * L[0] + ry * L[1] + rz * L[2]), 24) * 1.6;
      G.env[k] = rz < -0.2 ? 0.32 + 0.2 * (1 + rz) : sky + glint;
    }
  geoCache.set(N, G);
  return G;
}

const buffers = new Map();
function buffer(N) {
  let b = buffers.get(N);
  if (!b) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = N;
    const ctx = canvas.getContext('2d');
    b = { canvas, ctx, img: ctx.createImageData(N, N) };
    buffers.set(N, b);
  }
  return b;
}

// out = [r, g, b, specMul, metal, emissive] (0..1); skins write into it.
const OUT = new Float64Array(6);

export function renderSphere(N, skin, R, t) {
  const G = geom(N);
  const { canvas, ctx, img } = buffer(N);
  const d = img.data;
  const m = skin.mat;
  const amb = m.amb ?? 0.42,
    spec = m.spec ?? 0.8,
    shin = m.shin ?? 60,
    rim = m.rim ?? 0.2;
  const rc = m.rimColor || [1, 1, 1];
  const tex = skin.tex;
  for (let k = 0, p = 0; k < N * N; k++, p += 4) {
    const a = G.a[k];
    if (a === 0) {
      d[p + 3] = 0;
      continue;
    }
    const nx = G.nx[k],
      ny = G.ny[k],
      nz = G.nz[k];
    // View normal -> object space (R transposed).
    const ox = R[0] * nx + R[3] * ny + R[6] * nz,
      oy = R[1] * nx + R[4] * ny + R[7] * nz,
      oz = R[2] * nx + R[5] * ny + R[8] * nz;
    OUT[3] = 1;
    OUT[4] = m.metal || 0;
    OUT[5] = m.emis || 0;
    tex(ox, oy, oz, OUT, t, nz);
    const metal = OUT[4],
      emis = OUT[5];
    const shade = amb + (1 - amb) * G.dif[k];
    const lit = shade * (1 - metal) + G.env[k] * metal * 1.05;
    const hl = spec * OUT[3] * Math.pow(G.ndh[k], shin);
    const fr = G.fres[k] * rim;
    for (let c = 0; c < 3; c++) {
      const alb = OUT[c];
      let v = alb * (lit * (1 - emis) + emis);
      v += hl * (metal > 0.5 ? 0.35 + alb : 1);
      v += fr * rc[c];
      d[p + c] = v >= 1 ? 255 : v <= 0 ? 0 : v * 255;
    }
    d[p + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
