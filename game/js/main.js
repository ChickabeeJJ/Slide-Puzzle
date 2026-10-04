import { sdk } from './sdk.js';
import { save, loadSave, persist, flushSave, totalStars } from './storage.js';
import { unlockAudio, setAudioFlags, sfx } from './audio.js';
import { SKINS, skinById, drawBall } from './skins.js';
import { drawGame, layoutBoard, paintFor } from './render.js';
import { LEVELS } from './levels.js';
import { decodeLevel, slide, solve, greedyNext, makeRng, hashString, generate, difficultyFor, DIRS } from './levelgen.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');

const canvas = $('#game');
const ctx = canvas.getContext('2d');
let W = 0,
  H = 0,
  DPR = 1;

// Render state.
const g = {
  lv: null,
  view: { s: 1, ox: 0, oy: 0 },
  painted: null,
  paintTime: null,
  paintedCount: 0,
  color: '#3ae5de',
  ball: { x: 0, y: 0, moving: false, dir: 'right', travel: 0, roll: 0, squash: null },
  particles: [],
  hintPts: null,
  hintSeq: null,
  celebrate: null,
  shake: null,
  intro: 0,
  now: 0,
  skin: SKINS[0],
  timers: [],
};

// Game-flow state.
const play = { mode: 'campaign', n: 1, moves: 0, history: [], queued: [], complete: false, move: null, stars: 0 };
let screen = 'play';
let modalOpen = false;
let booted = false;
let settingsReturn = 'menu';
let lastPaintSfx = 0;

const later = (sec, fn) => g.timers.push({ at: g.now + sec, fn });

// ---------- Levels ----------
const generated = new Map();
function campaignLevel(n) {
  if (n <= LEVELS.length) return decodeLevel(LEVELS[n - 1]);
  // Endless levels beyond the hand-verified campaign, deterministic per level number.
  if (!generated.has(n)) {
    const d = difficultyFor(160 + (n % 40));
    const rng = makeRng(0xbeef + n * 7919);
    let lv = null;
    while (!lv) lv = generate(rng, { w: d.w, h: d.h, moves: d.moves, beam: 300 });
    generated.set(n, lv);
  }
  return generated.get(n);
}
const labelFor = (n) => (n > LEVELS.length ? 'EXPERT' : difficultyFor(n).label);

const pad = (v) => String(v).padStart(2, '0');
function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dailyLevel(key) {
  if (!generated.has(key)) {
    const h = hashString('daily:' + key);
    const d = difficultyFor(90 + (h % 70));
    const rng = makeRng(h);
    let lv = null;
    while (!lv) lv = generate(rng, { w: d.w, h: d.h, moves: d.moves, beam: 300 });
    generated.set(key, lv);
  }
  return generated.get(key);
}

// ---------- Level flow ----------
function startLevel(mode, n) {
  const lv = mode === 'daily' ? dailyLevel(n) : campaignLevel(n);
  Object.assign(play, { mode, n, moves: 0, history: [], queued: [], complete: false, move: null, stars: 0 });
  g.lv = lv;
  g.painted = new Uint8Array(lv.w * lv.h);
  g.paintTime = new Float64Array(lv.w * lv.h);
  g.paintedCount = 0;
  g.color = mode === 'daily' ? '#4f8dff' : paintFor(n);
  g.ball = { x: lv.sx, y: lv.sy, moving: false, dir: 'right', travel: 0, roll: 0, squash: null };
  g.particles = [];
  g.celebrate = null;
  g.timers = [];
  g.intro = g.now;
  clearHint();
  paintCell(lv.sy * lv.w + lv.sx, true);
  layout();
  g.tut = null;
  $$('.tut-pulse').forEach((e) => e.classList.remove('tut-pulse'));
  if (mode === 'campaign' && n === 1 && !save.tutorialDone) {
    // Mini tutorial: a hand shows each swipe along the solution, with step-by-step tips.
    g.hintSeq = solve(lv, lv.sx, lv.sy, g.painted, 400);
    g.tut = { step: 0, t0: g.now };
    refreshHintPts();
    tutorialText();
  } else if (mode === 'campaign' && n === 2 && !save.tipsDone) {
    tutorialTip(`Stuck? <b>↶ Undo</b> a move or tap the <b>💡 Hint</b>`);
    $('#btn-undo').classList.add('tut-pulse');
    $('#btn-hint').classList.add('tut-pulse');
  } else {
    $('#tutorial').classList.add('hidden');
  }
  showScreen('play');
  updateHud();
}

function paintCell(i, silent = false) {
  if (g.painted[i]) return;
  g.painted[i] = 1;
  g.paintTime[i] = g.now;
  g.paintedCount++;
  if (silent) return;
  const x = i % g.lv.w,
    y = (i - x) / g.lv.w;
  for (let k = 0; k < 2; k++) {
    g.particles.push({
      x: x + 0.2 + Math.random() * 0.6,
      y: y + 0.2 + Math.random() * 0.6,
      r: 0.04 + Math.random() * 0.05,
      color: Math.random() < 0.5 ? '#ffffff' : g.color,
      t0: g.now,
      life: 0.35 + Math.random() * 0.3,
      vx: (Math.random() - 0.5) * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      star: Math.random() < 0.3,
    });
  }
  if (g.now - lastPaintSfx > 0.03) {
    lastPaintSfx = g.now;
    sfx.paint(g.paintedCount / g.lv.floorCount);
  }
}

const IS_TOUCH = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const ARROWS = { up: '↑', down: '↓', left: '←', right: '→' };

function tutorialTip(html) {
  const t = $('#tutorial');
  t.innerHTML = html;
  t.classList.remove('hidden');
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
}

function tutorialText() {
  const step = g.tut.step;
  const dir = g.hintSeq && g.hintSeq[0];
  const how = dir ? (IS_TOUCH ? `Swipe <b>${dir}</b>` : `Swipe or press <b>${ARROWS[dir]}</b>`) : '';
  const lines = [
    `${how} to roll the ball`,
    `It rolls until it hits a wall!<br>${how} again`,
    `Paint <b>every tile</b> to win!`,
  ];
  tutorialTip(lines[Math.min(step, lines.length - 1)]);
}

function tryMove(dir) {
  if (screen !== 'play' || play.complete || modalOpen || sdk.adPlaying) return;
  if (g.ball.moving) {
    if (play.queued.length < 3) play.queued.push(dir);
    return;
  }
  const b = g.ball;
  const r = slide(g.lv, b.x, b.y, dir);
  if (!r.path.length) {
    const [dx, dy] = DIRS[dir];
    if (save.shake) g.shake = { dx, dy, t0: g.now, k: 0.5 };
    return;
  }
  play.history.push({ x: b.x, y: b.y, painted: g.painted.slice(), count: g.paintedCount, moves: play.moves });
  play.moves++;
  if (g.hintSeq && g.hintSeq[0] === dir) g.hintSeq.shift();
  else clearHint();
  g.hintPts = null;
  b.moving = true;
  b.dir = dir;
  b.travel = 0;
  play.move = { fx: b.x, fy: b.y, tx: r.x, ty: r.y, path: r.path, t0: g.now, dur: Math.max(0.09, r.path.length / 24), done: 0 };
  sfx.roll(r.path.length);
  if (g.tut) {
    g.tut.step++;
    g.tut.t0 = g.now;
  } else if (play.mode === 'campaign' && play.n === 2 && play.moves >= 3) {
    $('#tutorial').classList.add('hidden');
    $$('.tut-pulse').forEach((e) => e.classList.remove('tut-pulse'));
    save.tipsDone = true;
    persist();
  }
  updateHud();
}

function finishMove() {
  const b = g.ball,
    m = play.move;
  b.moving = false;
  b.x = m.tx;
  b.y = m.ty;
  const [dx, dy] = DIRS[b.dir];
  b.squash = { t0: g.now, dx, dy };
  if (save.shake) g.shake = { dx, dy, t0: g.now, k: 1 };
  sfx.bump();
  for (let k = 0; k < 6; k++) {
    g.particles.push({
      x: b.x + 0.5 + dx * 0.4 + (Math.random() - 0.5) * 0.5 * (dy ? 1 : 0.2),
      y: b.y + 0.5 + dy * 0.4 + (Math.random() - 0.5) * 0.5 * (dx ? 1 : 0.2),
      r: 0.05 + Math.random() * 0.05,
      color: g.color,
      t0: g.now,
      life: 0.4,
      vx: -dx * (1 + Math.random() * 2) + (Math.random() - 0.5),
      vy: -dy * (1 + Math.random() * 2) + (Math.random() - 0.5),
    });
  }
  play.move = null;
  if (g.paintedCount === g.lv.floorCount) return completeLevel();
  if (g.hintSeq && g.hintSeq.length) refreshHintPts();
  else clearHint();
  if (g.tut) {
    // Player went off-script: recompute the guide from here.
    if (!g.hintSeq || !g.hintSeq.length) {
      g.hintSeq = solve(g.lv, g.ball.x, g.ball.y, g.painted, 400);
      refreshHintPts();
    }
    tutorialText();
  }
  if (play.queued.length) tryMove(play.queued.shift());
}

function update(dt) {
  g.now += dt;
  const b = g.ball;
  if (b.moving && play.move) {
    const m = play.move;
    const p = Math.min(1, (g.now - m.t0) / m.dur);
    const e = p * p * 0.35 + p * 0.65;
    const dist = e * m.path.length;
    const [dx, dy] = DIRS[b.dir];
    const prev = b.travel;
    b.x = m.fx + dx * dist;
    b.y = m.fy + dy * dist;
    b.travel = dist;
    b.roll += (dist - prev) * 1.6 * (dx || dy);
    while (m.done < m.path.length && dist >= m.done + 0.45) paintCell(m.path[m.done++]);
    if (p >= 1) {
      while (m.done < m.path.length) paintCell(m.path[m.done++]);
      finishMove();
    }
  }
  for (const p of g.particles) {
    p.x += (p.vx || 0) * dt;
    p.y += (p.vy || 0) * dt;
  }
  g.particles = g.particles.filter((p) => g.now - p.t0 < p.life);
  if (g.timers.length) {
    const due = g.timers.filter((t) => t.at <= g.now);
    g.timers = g.timers.filter((t) => t.at > g.now);
    due.forEach((t) => t.fn());
  }
}

function starsFor(moves, par) {
  if (moves <= par) return 3;
  if (moves <= par + Math.max(2, Math.ceil(par * 0.3))) return 2;
  return 1;
}

function completeLevel() {
  play.complete = true;
  play.queued = [];
  if (g.tut) {
    g.tut = null;
    $('#tutorial').classList.add('hidden');
  }
  clearHint();
  const stars = starsFor(play.moves, g.lv.par);
  play.stars = stars;
  const words = stars === 3 ? ['PERFECT!', 'OUTSTANDING!', 'BRILLIANT!', 'FLAWLESS!'] : ['GREAT!', 'AWESOME!', 'AMAZING!', 'NICE!', 'WELL DONE!'];
  g.celebrate = {
    t0: g.now,
    x: g.ball.x,
    y: g.ball.y,
    text: words[Math.floor(Math.random() * words.length)],
    sparkles: Array.from({ length: 12 }, () => ({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, s: 0.5 + Math.random() * 0.7, d: Math.random() * 0.5 })),
  };
  sfx.win();
  sdk.happytime();
  const before = totalStars();
  recordProgress(stars);
  flushSave();
  const unlocked = SKINS.filter((s) => !s.ad && s.stars > before && s.stars <= totalStars());
  syncGameplay();
  later(1.35, () => showResults(unlocked));
}

function recordProgress(stars) {
  if (play.mode === 'campaign') {
    const n = play.n;
    save.stars[n] = Math.max(save.stars[n] || 0, stars);
    save.unlocked = Math.max(save.unlocked, n + 1);
    if (n >= save.current) save.current = n + 1;
    if (n === 1) save.tutorialDone = true;
  } else {
    const d = save.daily;
    const key = play.n;
    if (!d.done[key]) {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      d.streak = d.last === dayKey(y) ? d.streak + 1 : 1;
      d.last = key;
      d.best = Math.max(d.best, d.streak);
      // Keep the history small.
      const keys = Object.keys(d.done).sort();
      while (keys.length > 30) delete d.done[keys.shift()];
    }
    d.done[key] = Math.max(d.done[key] || 0, stars);
  }
  persist();
}

function showResults(newSkins) {
  const daily = play.mode === 'daily';
  $('#res-title').textContent = daily ? 'Daily Challenge!' : `Level ${play.n} Complete!`;
  $('#res-info').textContent = `Moves ${play.moves} · Par ${g.lv.par}`;
  let extra = '';
  if (daily) extra = `🔥 Streak: ${save.daily.streak} day${save.daily.streak === 1 ? '' : 's'}`;
  else if (play.stars < 3) extra = `Finish in ${g.lv.par} moves for 3 stars`;
  if (newSkins.length) extra = `New ball unlocked: ${newSkins.map((s) => s.name).join(', ')}!`;
  $('#res-extra').textContent = extra;
  $('#res-next span').textContent = daily ? 'LEVELS' : 'NEXT';
  const spans = $$('.res-stars span');
  spans.forEach((s) => s.classList.remove('on'));
  openModal('#results');
  spans.forEach((s, i) => {
    if (i < play.stars)
      setTimeout(() => {
        s.classList.add('on');
        sfx.star(i);
      }, 200 + i * 220);
  });
  if (newSkins.length) setTimeout(() => sfx.unlock(), 900);
}

async function goNext() {
  closeModal('#results');
  const wasDaily = play.mode === 'daily';
  const next = wasDaily ? save.current : play.n + 1;
  // Natural break between levels: offer a midgame ad (the platform controls frequency).
  if (wasDaily || play.n >= 3) await sdk.requestAd('midgame');
  startLevel('campaign', next);
}

function replay() {
  closeModal('#results');
  startLevel(play.mode, play.n);
}

function undo() {
  if (g.ball.moving || play.complete || !play.history.length || screen !== 'play' || modalOpen) return;
  const h = play.history.pop();
  g.painted = h.painted;
  g.paintedCount = h.count;
  play.moves = h.moves;
  g.ball.x = h.x;
  g.ball.y = h.y;
  g.ball.squash = null;
  clearHint();
  sfx.undo();
  updateHud();
}

function restart() {
  if (screen !== 'play' || modalOpen || play.complete) return;
  sfx.click();
  startLevel(play.mode, play.n);
}

// ---------- Hints ----------
function clearHint() {
  g.hintSeq = null;
  g.hintPts = null;
}

function refreshHintPts() {
  if (!g.hintSeq || !g.hintSeq.length) {
    g.hintPts = null;
    return;
  }
  let x = g.ball.x,
    y = g.ball.y;
  const pts = [[x, y]];
  for (const d of g.hintSeq.slice(0, 3)) {
    const r = slide(g.lv, x, y, d);
    x = r.x;
    y = r.y;
    pts.push([x, y]);
  }
  g.hintPts = pts;
}

async function useHint() {
  if (screen !== 'play' || play.complete || g.ball.moving || modalOpen) return;
  if (g.hintSeq && g.hintSeq.length) {
    refreshHintPts();
    return;
  }
  if (save.hints <= 0) {
    const r = await sdk.requestAd('rewarded');
    if (r === false) {
      toast('No ad available right now — try again soon!');
      return;
    }
    save.hints += 1;
    persist();
  }
  save.hints--;
  persist();
  const lv = g.lv;
  g.hintSeq = solve(lv, g.ball.x, g.ball.y, g.painted, 500, 250) || greedyNext(lv, g.ball.x, g.ball.y, g.painted);
  refreshHintPts();
  sfx.hint();
  updateHud();
}

// ---------- HUD & screens ----------
function updateHud() {
  const daily = play.mode === 'daily';
  const label = daily ? 'DAILY' : labelFor(play.n);
  const pill = $('#diff-pill');
  pill.textContent = label;
  pill.className = 'pill ' + label;
  $('#level-name').textContent = daily ? formatDay(play.n) : `Level ${play.n}`;
  $('#move-counter').textContent = `Moves ${play.moves} · Par ${g.lv ? g.lv.par : 0}`;
  $('#move-counter').classList.toggle('hidden', !save.showMoves);
  $('#btn-undo').disabled = !play.history.length;
  const hasHints = save.hints > 0;
  $('#hint-badge').textContent = save.hints;
  $('#hint-badge').classList.toggle('hidden', !hasHints);
  $('#hint-ad').classList.toggle('hidden', hasHints);
}

function formatDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showScreen(name) {
  screen = name;
  $('#hud').classList.toggle('hidden', name !== 'play');
  for (const id of ['menu', 'levels', 'skins', 'settings']) $('#' + id).classList.toggle('hidden', id !== name);
  if (name === 'menu') renderMenu();
  if (name === 'levels') renderLevels();
  if (name === 'skins') renderSkins();
  if (name === 'settings') renderSettings();
  syncGameplay();
}

function syncGameplay() {
  if (!booted) return;
  sdk.setGameplay(screen === 'play' && !play.complete && !modalOpen && !sdk.adPlaying && !document.hidden);
}

function openModal(sel) {
  modalOpen = true;
  $(sel).classList.remove('hidden');
  syncGameplay();
}
function closeModal(sel) {
  $(sel).classList.add('hidden');
  modalOpen = !$('#results').classList.contains('hidden') || !$('#dialog').classList.contains('hidden');
  syncGameplay();
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

function dialog({ title, html, ok = 'OK', cancel = null }) {
  return new Promise((resolve) => {
    $('#dlg-title').textContent = title;
    $('#dlg-body').innerHTML = html;
    $('#dlg-ok').textContent = ok;
    $('#dlg-cancel').classList.toggle('hidden', !cancel);
    if (cancel) $('#dlg-cancel').textContent = cancel;
    openModal('#dialog');
    const finish = (v) => {
      $('#dlg-ok').onclick = $('#dlg-cancel').onclick = null;
      closeModal('#dialog');
      resolve(v);
    };
    $('#dlg-ok').onclick = () => finish(true);
    $('#dlg-cancel').onclick = () => finish(false);
  });
}

function renderMenu() {
  $('#play-sub').textContent = `Level ${save.current}`;
  $('#menu-stars').textContent = totalStars();
  const done = save.daily.done[dayKey()];
  const sub = $('#daily-sub');
  sub.textContent = done ? (save.daily.streak > 1 ? `🔥${save.daily.streak}` : '✓') : 'NEW';
  sub.classList.toggle('done', !!done);
  const solved = Math.min(LEVELS.length, Object.keys(save.stars).filter((n) => n <= LEVELS.length).length);
  const pct = Math.round((solved / LEVELS.length) * 100);
  $('#progress-text').textContent = save.current > LEVELS.length ? `Endless · Level ${save.current}` : `Level ${save.current} of ${LEVELS.length}`;
  $('#progress-pct').textContent = `${pct}%`;
  $('#progress-fill').style.width = `${Math.max(3, pct)}%`;
  $('#btn-sound').classList.toggle('off', !(save.sfx || save.music));
  $('#save-note').textContent = sdk.cloudSave ? (sdk.loggedIn ? '☁ Progress saved to your CrazyGames account' : '☁ Progress saved · log in to sync across devices') : '';
}

// Animated demo in the main menu: a ball paints a loop of tiles, changing colour each lap.
const DEMO_PAINTS = ['#3ae5de', '#fd7861', '#fbbd2c', '#a45cf2', '#5ad16b'];
const DEMO_PATH = (() => {
  const p = [];
  for (let x = 0; x < 7; x++) p.push([x, 0]);
  for (let y = 1; y < 3; y++) p.push([6, y]);
  for (let x = 5; x >= 0; x--) p.push([x, 2]);
  p.push([0, 1]);
  return p;
})();
function drawMenuDemo(t) {
  const cv = $('#menu-demo');
  if (!cv.offsetWidth) return;
  const w = cv.offsetWidth,
    h = cv.offsetHeight;
  if (cv.width !== Math.round(w * DPR)) {
    cv.width = Math.round(w * DPR);
    cv.height = Math.round(h * DPR);
  }
  const c = cv.getContext('2d');
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, w, h);
  const s = Math.min(w / 7, h / 3);
  const ox = (w - s * 7) / 2,
    oy = (h - s * 3) / 2;
  const n = DEMO_PATH.length;
  const pos = (t * 7) % n;
  const lap = Math.floor((t * 7) / n);
  const cur = DEMO_PAINTS[lap % DEMO_PAINTS.length],
    prev = DEMO_PAINTS[(lap + DEMO_PAINTS.length - 1) % DEMO_PAINTS.length];
  const gap = s * 0.05;
  DEMO_PATH.forEach(([x, y], i) => {
    c.fillStyle = '#454d61';
    c.fillRect(ox + x * s, oy + y * s, s + 0.5, s + 0.5);
    c.fillStyle = i <= pos ? cur : prev;
    c.fillRect(ox + x * s + gap, oy + y * s + gap, s - gap * 2, s - gap * 2);
  });
  // Inner raised wall.
  c.fillStyle = '#d5ccbb';
  c.fillRect(ox + s, oy + s, s * 5, s);
  c.fillStyle = '#fff8e4';
  c.fillRect(ox + s, oy + s, s * 5, s * 0.72);
  const i = Math.floor(pos),
    f = pos - i;
  const [ax, ay] = DEMO_PATH[i],
    [bx, by] = DEMO_PATH[(i + 1) % n];
  const bxp = ox + (ax + (bx - ax) * f + 0.5) * s,
    byp = oy + (ay + (by - ay) * f + 0.5) * s;
  c.fillStyle = 'rgba(25,25,45,0.25)';
  c.beginPath();
  c.ellipse(bxp + s * 0.08, byp + s * 0.16, s * 0.36, s * 0.24, 0, 0, Math.PI * 2);
  c.fill();
  drawBall(c, bxp, byp, s * 0.36, g.skin, t * 6);
}

let levelPage = 0;
const PER_PAGE = 20;
function renderLevels(keepPage = false) {
  const maxLevel = Math.max(LEVELS.length, Math.ceil(save.unlocked / PER_PAGE) * PER_PAGE);
  const pages = Math.ceil(maxLevel / PER_PAGE);
  if (!keepPage) levelPage = Math.floor((save.current - 1) / PER_PAGE);
  levelPage = Math.max(0, Math.min(pages - 1, levelPage));
  $$('.stars-total').forEach((e) => (e.textContent = totalStars()));
  const grid = $('#level-grid');
  grid.innerHTML = '';
  for (let n = levelPage * PER_PAGE + 1; n <= (levelPage + 1) * PER_PAGE; n++) {
    const b = document.createElement('button');
    const stars = save.stars[n] || 0;
    const locked = n > save.unlocked;
    b.className = 'lvl' + (locked ? ' locked' : stars ? ' done' : n === save.current ? ' current' : '');
    b.innerHTML = locked ? `<span>🔒</span><small>${n}</small>` : `<span>${n}</span><small><b>${'★'.repeat(stars)}</b>${'☆'.repeat(3 - stars)}</small>`;
    if (!locked)
      b.onclick = () => {
        sfx.click();
        startLevel('campaign', n);
      };
    grid.appendChild(b);
  }
  $('#page-label').textContent = `${levelPage * PER_PAGE + 1}–${(levelPage + 1) * PER_PAGE}`;
  $('#page-prev').disabled = levelPage === 0;
  $('#page-next').disabled = levelPage >= pages - 1;
}

function skinUnlocked(s) {
  return s.ad ? save.adSkins.includes(s.id) : totalStars() >= s.stars;
}

function renderSkins() {
  $$('.stars-total').forEach((e) => (e.textContent = totalStars()));
  const grid = $('#skin-grid');
  grid.innerHTML = '';
  for (const s of SKINS) {
    const open = skinUnlocked(s);
    const card = document.createElement('button');
    card.className = 'skin' + (open ? '' : ' locked') + (save.skin === s.id ? ' equipped' : '');
    const cv = document.createElement('canvas');
    cv.width = cv.height = 160;
    const c = cv.getContext('2d');
    c.fillStyle = 'rgba(30,30,50,0.18)';
    c.beginPath();
    c.ellipse(86, 118, 52, 18, 0, 0, Math.PI * 2);
    c.fill();
    drawBall(c, 80, 76, 56, s, 0.4);
    card.appendChild(cv);
    const cost = open ? (save.skin === s.id ? 'Equipped' : 'Tap to use') : s.ad ? '▶ Watch ad' : `★ ${s.stars}`;
    card.insertAdjacentHTML('beforeend', `<span class="name">${s.name}</span><span class="cost${!open && s.ad ? ' ad' : ''}">${cost}</span>`);
    card.onclick = () => pickSkin(s);
    grid.appendChild(card);
  }
}

async function pickSkin(s) {
  if (skinUnlocked(s)) {
    save.skin = s.id;
    g.skin = s;
    persist();
    sfx.click();
    renderSkins();
    return;
  }
  if (s.ad) {
    const r = await sdk.requestAd('rewarded');
    if (r === false) return toast('No ad available right now — try again soon!');
    save.adSkins.push(s.id);
    save.skin = s.id;
    g.skin = s;
    persist();
    sfx.unlock();
    toast(`${s.name} unlocked!`);
    renderSkins();
  } else {
    sfx.error();
    toast(`Collect ${s.stars} ★ to unlock ${s.name}`);
  }
}

function renderSettings() {
  $('#opt-sfx').checked = save.sfx;
  $('#opt-music').checked = save.music;
  $('#opt-shake').checked = save.shake;
  $('#opt-moves').checked = save.showMoves;
}

function applyAudio() {
  setAudioFlags({ sfx: save.sfx, music: save.music, forceMute: sdk.adPlaying || sdk.platformMuted });
}

const PRIVACY_HTML = `
<p><b>Your data.</b> Slide &amp; Paint saves only your game progress (levels, stars, unlocked balls and settings). On CrazyGames this is stored with your CrazyGames account so it syncs across devices; elsewhere it stays in your browser's local storage.</p>
<p>We do not collect names, emails or any other personal information, and the game has no chat or user-generated content.</p>
<p><b>Ads.</b> Optional video ads are provided by CrazyGames. Their Privacy Policy and Terms of Use, available on crazygames.com, apply to ads and accounts.</p>
<p><b>Terms.</b> By playing you agree to use the game for personal entertainment. Progress can be reset at any time from Settings.</p>`;

// ---------- Layout & loop ----------
function layout() {
  const r = $('#app').getBoundingClientRect();
  W = r.width;
  H = r.height;
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  if (!g.lv) return;
  const hudHidden = $('#hud').classList.contains('hidden');
  if (hudHidden) $('#hud').classList.remove('hidden');
  const a = $('#board-area').getBoundingClientRect();
  if (hudHidden) $('#hud').classList.add('hidden');
  g.view = layoutBoard(g.lv, { x: a.left - r.left, y: a.top - r.top, w: a.width, h: a.height });
}

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawGame(ctx, W, H, g);
}

let last = 0;
function frame(t) {
  const dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
  last = t;
  update(dt);
  if (screen === 'menu') drawMenuDemo(t / 1000);
  else render();
  requestAnimationFrame(frame);
}

// ---------- Input ----------
const KEYS = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};
const BLOCKED_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown', 'Home', 'End']);

function onKey(e) {
  unlockAudio();
  if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
  if (e.repeat && !KEYS[e.code]) return;
  if (!$('#dialog').classList.contains('hidden')) {
    if (e.code === 'Enter') $('#dlg-ok').click();
    return;
  }
  if (!$('#results').classList.contains('hidden')) {
    if (e.code === 'Enter' || e.code === 'Space') goNext();
    if (e.code === 'KeyR') replay();
    return;
  }
  if (screen === 'play') {
    if (KEYS[e.code]) return tryMove(KEYS[e.code]);
    if (e.code === 'KeyZ') return undo();
    if (e.code === 'KeyR') return restart();
    if (e.code === 'KeyH') return useHint();
    if (e.code === 'KeyM') return showScreen('menu');
  } else if (e.code === 'KeyM') {
    if (screen === 'settings' && settingsReturn === 'play') {
      settingsReturn = 'menu';
      return showScreen('play');
    }
    showScreen(screen === 'menu' ? 'play' : 'menu');
  } else if (screen === 'menu' && (e.code === 'Enter' || e.code === 'Space')) {
    $('#btn-play').click();
  }
}

let swipe = null;
function onPointerDown(e) {
  unlockAudio();
  if (screen !== 'play' || modalOpen || e.target.closest('button')) return;
  swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
}
function onPointerMove(e) {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x,
    dy = e.clientY - swipe.y;
  const th = Math.max(18, Math.min(40, g.view.s * 0.45));
  if (Math.hypot(dx, dy) < th) return;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  tryMove(dir);
  // Allow chaining swipes without lifting the finger.
  swipe.x = e.clientX;
  swipe.y = e.clientY;
}
function onPointerUp(e) {
  if (swipe && e.pointerId === swipe.id) swipe = null;
}

function bindUi() {
  const click = (sel, fn) =>
    $(sel).addEventListener('click', (e) => {
      unlockAudio();
      sfx.click();
      fn(e);
    });
  click('#btn-back', () => showScreen('menu'));
  click('#btn-gear', () => {
    settingsReturn = screen;
    showScreen('settings');
  });
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-restart').addEventListener('click', restart);
  $('#btn-hint').addEventListener('click', () => {
    unlockAudio();
    useHint();
  });
  click('#btn-play', () => {
    if (g.lv && play.mode === 'campaign' && play.n === save.current && !play.complete) showScreen('play');
    else startLevel('campaign', save.current);
  });
  click('#btn-levels', () => showScreen('levels'));
  click('#btn-skins', () => showScreen('skins'));
  click('#btn-settings', () => {
    settingsReturn = 'menu';
    showScreen('settings');
  });
  click('#btn-daily', () => {
    const key = dayKey();
    startLevel('daily', key);
    const done = save.daily.done[key];
    toast(done ? 'Already solved today — play again for a better score!' : `Daily Challenge · Streak ${save.daily.streak} 🔥`);
  });
  $$('[data-back]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.click();
      const back = b.closest('#settings') ? settingsReturn : 'menu';
      settingsReturn = 'menu';
      showScreen(back);
    }),
  );
  click('#page-prev', () => {
    levelPage--;
    renderLevels(true);
  });
  click('#page-next', () => {
    levelPage++;
    renderLevels(true);
  });
  click('#res-next', goNext);
  click('#res-replay', replay);
  $('#opt-sfx').addEventListener('change', (e) => {
    save.sfx = e.target.checked;
    persist();
    applyAudio();
    sfx.click();
  });
  $('#opt-shake').addEventListener('change', (e) => {
    save.shake = e.target.checked;
    persist();
    sfx.click();
  });
  $('#opt-moves').addEventListener('change', (e) => {
    save.showMoves = e.target.checked;
    persist();
    updateHud();
    sfx.click();
  });
  $('#opt-music').addEventListener('change', (e) => {
    save.music = e.target.checked;
    persist();
    applyAudio();
  });
  click('#btn-privacy-menu', () => dialog({ title: 'Privacy & Terms', html: PRIVACY_HTML }));
  click('#btn-sound', () => {
    const on = !(save.sfx || save.music);
    save.sfx = save.music = on;
    persist();
    applyAudio();
    renderMenu();
  });

  window.addEventListener('keydown', onKey, { passive: false });
  const app = $('#app');
  app.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('wheel', (e) => e.target.closest('.grid, .settings-list') || e.preventDefault(), { passive: false });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', layout);
  // Never lose progress when the tab is hidden or closed.
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSave();
    setAudioFlags({ hidden: document.hidden });
    syncGameplay();
  });
  // iOS only treats touchend/click as audio-unlocking gestures.
  for (const ev of ['touchend', 'click']) window.addEventListener(ev, unlockAudio, { passive: true });
  sdk.onChange(() => {
    applyAudio();
    syncGameplay();
  });
}

// ---------- Boot ----------
async function boot() {
  // Split the logo into letters for per-letter paint colours.
  const l2 = $('.logo .l2');
  l2.innerHTML = [...l2.textContent].map((c) => `<span>${c}</span>`).join('');

  if (!CAPTURE) await sdk.init();
  sdk.loadingStart();
  loadSave();
  g.skin = skinById(save.skin);
  // Logging in/out on CrazyGames swaps to that account's cloud save.
  sdk.watchUser(() => {
    loadSave();
    g.skin = skinById(save.skin);
    applyAudio();
    if (screen === 'menu') renderMenu();
    else if (screen === 'play' && !play.complete) startLevel('campaign', save.current);
  });
  applyAudio();
  bindUi();
  // Fonts are preloaded and use font-display: swap, so don't wait for them;
  // the canvas redraws every frame and picks the font up as soon as it lands.
  startLevel('campaign', Math.min(save.current, Math.max(1, save.unlocked)));
  sdk.loadingStop();
  booted = true;
  syncGameplay();
  if (CAPTURE) {
    window.__cap = { g, play, save, startLevel, tryMove, update, render, layout, useHint, showScreen, solve, slide, skinById };
  } else {
    requestAnimationFrame(frame);
  }
}

boot();
