// Level model, movement rules, generator and solver.
// Shared by the game (hints, daily challenge) and tools/generate-levels.mjs.

export const DIRS = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
export const DIR_NAMES = ['up', 'right', 'down', 'left'];

// Small deterministic PRNG (mulberry32).
export function makeRng(seed) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  return rng;
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Compact level encoding: "w,h,sx,sy,par:rows" where rows is w*h chars of '#'/'.'.
export function decodeLevel(str) {
  const [head, cells] = str.split(':');
  const [w, h, sx, sy, par] = head.split(',').map(Number);
  return makeLevel(w, h, cells, sx, sy, par);
}

export function encodeLevel(lv) {
  let cells = '';
  for (let i = 0; i < lv.w * lv.h; i++) cells += lv.floor[i] ? '.' : '#';
  return `${lv.w},${lv.h},${lv.sx},${lv.sy},${lv.par}:${cells}`;
}

export function makeLevel(w, h, cells, sx, sy, par = 0) {
  const floor = new Uint8Array(w * h);
  const floorIndex = new Int16Array(w * h).fill(-1);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (cells[i] === '.') {
      floor[i] = 1;
      floorIndex[i] = n++;
    }
  }
  return { w, h, sx, sy, par, floor, floorIndex, floorCount: n };
}

export function isFloor(lv, x, y) {
  return x >= 0 && y >= 0 && x < lv.w && y < lv.h && lv.floor[y * lv.w + x] === 1;
}

// Roll from (x,y) in a direction until the next cell is a wall.
// Returns the stop position and the list of cell indices travelled (excluding the start).
export function slide(lv, x, y, dir) {
  const [dx, dy] = DIRS[dir];
  const path = [];
  while (isFloor(lv, x + dx, y + dy)) {
    x += dx;
    y += dy;
    path.push(y * lv.w + x);
  }
  return { x, y, path };
}

// ---------- Solver ----------

const POP16 = new Uint8Array(65536);
for (let i = 1; i < 65536; i++) POP16[i] = POP16[i >> 1] + (i & 1);
function popcount(b) {
  let n = 0;
  while (b) {
    n += POP16[Number(b & 0xffffn)];
    b >>= 16n;
  }
  return n;
}

function buildMoveTable(lv) {
  const table = new Map();
  return (pos) => {
    let entry = table.get(pos);
    if (!entry) {
      entry = [];
      const x = pos % lv.w;
      const y = (pos - x) / lv.w;
      for (const dir of DIR_NAMES) {
        const r = slide(lv, x, y, dir);
        if (!r.path.length) continue;
        let mask = 0n;
        for (const c of r.path) mask |= 1n << BigInt(lv.floorIndex[c]);
        entry.push({ dir, to: r.y * lv.w + r.x, mask });
      }
      table.set(pos, entry);
    }
    return entry;
  };
}

export function maskFromPainted(lv, painted) {
  let m = 0n;
  for (let i = 0; i < lv.w * lv.h; i++) if (painted[i]) m |= 1n << BigInt(lv.floorIndex[i]);
  return m;
}

// Beam search for a short move sequence that paints every floor cell.
// painted: Uint8Array per cell (or null for "only the start cell").
export function solve(lv, x, y, painted = null, beamWidth = 600, maxDepth = 120) {
  const moves = buildMoveTable(lv);
  const full = (1n << BigInt(lv.floorCount)) - 1n;
  const start = y * lv.w + x;
  let mask = painted ? maskFromPainted(lv, painted) : 1n << BigInt(lv.floorIndex[start]);
  if (mask === full) return [];
  let beam = [{ pos: start, mask, count: popcount(mask), path: null }];
  const seen = new Set([start + ':' + mask.toString(36)]);
  for (let depth = 0; depth < maxDepth && beam.length; depth++) {
    const next = [];
    for (const s of beam) {
      for (const mv of moves(s.pos)) {
        const nm = s.mask | mv.mask;
        const key = mv.to + ':' + nm.toString(36);
        if (seen.has(key)) continue;
        seen.add(key);
        const node = { pos: mv.to, mask: nm, count: s.count + popcount(mv.mask & ~s.mask), path: { dir: mv.dir, prev: s.path } };
        if (nm === full) {
          const out = [];
          for (let p = node.path; p; p = p.prev) out.push(p.dir);
          return out.reverse();
        }
        next.push(node);
      }
    }
    next.sort((a, b) => b.count - a.count);
    beam = next.length > beamWidth ? next.slice(0, beamWidth) : next;
  }
  return null;
}

// Fallback: shortest sequence of moves (ignoring paint) that reaches any unpainted cell.
export function greedyNext(lv, x, y, painted) {
  const moves = buildMoveTable(lv);
  const start = y * lv.w + x;
  const prev = new Map([[start, null]]);
  const queue = [start];
  while (queue.length) {
    const pos = queue.shift();
    for (const mv of moves(pos)) {
      let fresh = false;
      const x0 = pos % lv.w;
      const r = slide(lv, x0, (pos - x0) / lv.w, mv.dir);
      for (const c of r.path) if (!painted[c]) fresh = true;
      if (fresh) {
        const out = [mv.dir];
        for (let p = pos; prev.get(p); p = prev.get(p).from) out.push(prev.get(p).dir);
        return out.reverse();
      }
      if (!prev.has(mv.to)) {
        prev.set(mv.to, { from: pos, dir: mv.dir });
        queue.push(mv.to);
      }
    }
  }
  return null;
}

// Every stop position reachable from the start must be able to reach every other one,
// so a player can never get permanently stuck.
export function isStronglyConnected(lv) {
  const moves = buildMoveTable(lv);
  const start = lv.sy * lv.w + lv.sx;
  const reach = new Set([start]);
  const rev = new Map();
  const queue = [start];
  while (queue.length) {
    const p = queue.shift();
    for (const mv of moves(p)) {
      if (!rev.has(mv.to)) rev.set(mv.to, []);
      rev.get(mv.to).push(p);
      if (!reach.has(mv.to)) {
        reach.add(mv.to);
        queue.push(mv.to);
      }
    }
  }
  const back = new Set([start]);
  const q2 = [start];
  while (q2.length) {
    const p = q2.shift();
    for (const f of rev.get(p) || []) {
      if (!back.has(f)) {
        back.add(f);
        q2.push(f);
      }
    }
  }
  for (const p of reach) if (!back.has(p)) return false;
  return true;
}

// ---------- Generator ----------
// Carves floor by simulating ball moves. Each move's stopping cell is permanently
// marked as wall, so replaying the carve sequence always paints the whole board.
export function generate(rng, { w, h, moves, minFill = 0.42, maxLen = 99, beam = 600 }) {
  for (let attempt = 0; attempt < 400; attempt++) {
    const cell = new Uint8Array(w * h); // 0 unknown, 1 floor, 2 wall
    let x = rng.int(0, w - 1);
    let y = rng.int(0, h - 1);
    const sx = x,
      sy = y;
    cell[y * w + x] = 1;
    const seq = [];
    let lastDir = null;
    let stale = 0;
    for (let tries = 0; seq.length < moves && tries < moves * 40; tries++) {
      const dir = rng.pick(DIR_NAMES);
      if (dir === lastDir) continue;
      const [dx, dy] = DIRS[dir];
      // How far could we go?
      let max = 0;
      while (true) {
        const nx = x + dx * (max + 1),
          ny = y + dy * (max + 1);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || cell[ny * w + nx] === 2) break;
        max++;
      }
      if (max === 0) continue;
      const len = rng.int(1, Math.min(max, maxLen));
      const ex = x + dx * len,
        ey = y + dy * len;
      const bx = ex + dx,
        by = ey + dy;
      const inside = bx >= 0 && by >= 0 && bx < w && by < h;
      if (inside && cell[by * w + bx] === 1) continue; // can't stop here
      let fresh = 0;
      for (let i = 1; i <= len; i++) if (cell[(y + dy * i) * w + x + dx * i] !== 1) fresh++;
      if (fresh === 0 && rng() < 0.85) {
        if (++stale > 30) break;
        continue;
      }
      for (let i = 1; i <= len; i++) cell[(y + dy * i) * w + x + dx * i] = 1;
      if (inside) cell[by * w + bx] = 2;
      x = ex;
      y = ey;
      lastDir = dir;
      seq.push(dir);
    }
    if (seq.length < Math.max(2, moves * 0.7)) continue;

    // Crop to the floor bounding box.
    let x0 = w,
      y0 = h,
      x1 = -1,
      y1 = -1,
      count = 0;
    for (let yy = 0; yy < h; yy++)
      for (let xx = 0; xx < w; xx++)
        if (cell[yy * w + xx] === 1) {
          count++;
          x0 = Math.min(x0, xx);
          x1 = Math.max(x1, xx);
          y0 = Math.min(y0, yy);
          y1 = Math.max(y1, yy);
        }
    const cw = x1 - x0 + 1,
      ch = y1 - y0 + 1;
    if (count / (cw * ch) < minFill) continue;
    if (cw < Math.min(4, w) || ch < Math.min(4, h)) continue;
    let cells = '';
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) cells += cell[yy * w + xx] === 1 ? '.' : '#';
    const lv = makeLevel(cw, ch, cells, sx - x0, sy - y0);
    if (!isStronglyConnected(lv)) continue;

    // Verify the carve sequence solves it, then look for a shorter solution for par.
    if (!checkSolution(lv, seq)) continue;
    const best = solve(lv, lv.sx, lv.sy, null, beam);
    lv.par = best && best.length < seq.length ? best.length : seq.length;
    if (lv.par < Math.min(2, moves)) continue;
    lv.solution = best && best.length < seq.length ? best : seq;
    return lv;
  }
  return null;
}

export function checkSolution(lv, seq) {
  const painted = new Uint8Array(lv.w * lv.h);
  let x = lv.sx,
    y = lv.sy;
  painted[y * lv.w + x] = 1;
  for (const d of seq) {
    const r = slide(lv, x, y, d);
    for (const c of r.path) painted[c] = 1;
    x = r.x;
    y = r.y;
  }
  for (let i = 0; i < lv.w * lv.h; i++) if (lv.floor[i] && !painted[i]) return false;
  return true;
}

// Difficulty schedule shared by the campaign generator and the daily challenge.
export function difficultyFor(n) {
  // n = 1-based level number
  const t = Math.min(1, (n - 1) / 160);
  const w = Math.round(5 + t * 7 + (n % 3 === 0 ? 1 : 0));
  const h = Math.round(6 + t * 9 + (n % 4 === 1 ? 1 : 0));
  const moves = Math.round(4 + t * 30 + (n % 5) * 0.6);
  const label = n <= 15 ? 'EASY' : n <= 50 ? 'MEDIUM' : n <= 120 ? 'HARD' : 'EXPERT';
  return { w, h, moves, label };
}
