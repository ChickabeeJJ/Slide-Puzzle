// Renders the CrazyGames store assets into marketing/:
//   covers:  cover-landscape-1920x1080.png, cover-portrait-800x1200.png, cover-square-800x800.png
//   videos:  video-landscape-1920x1080.mp4, video-portrait-1080x1620.mp4 (silent, H.264, 30 fps)
// Usage: node tools/capture.mjs   (needs Playwright + Chromium and ffmpeg)
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require('/opt/node-tools/node_modules/playwright'));
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'marketing');
const TMP = path.join(ROOT, '.capture-tmp');
const PORT = 8093;
const FPS = 30;
mkdirSync(OUT, { recursive: true });

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const base = `http://localhost:${PORT}`;
const browser = await chromium.launch();

try {
  // ---------- Covers ----------
  const covers = { landscape: [1920, 1080], portrait: [800, 1200], square: [800, 800] };
  for (const [kind, [w, h]] of Object.entries(covers)) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await page.goto(`${base}/tools/marketing/cover.html?kind=${kind}`);
    await page.waitForFunction(() => window.__ready);
    await page.locator('#c').screenshot({ path: path.join(OUT, `cover-${kind}-${w}x${h}.png`) });
    await page.close();
    console.log('cover', kind);
  }

  // ---------- Videos ----------
  // Each video: the static cover as the opening frame, then real gameplay of three levels.
  const videos = [
    { name: 'video-landscape-1920x1080', w: 1920, h: 1080, cover: 'cover-landscape-1920x1080.png' },
    { name: 'video-portrait-1080x1620', w: 1080, h: 1620, cover: null },
  ];
  for (const v of process.env.COVERS_ONLY ? [] : videos) {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
    // Portrait cover is 2:3 like the video, so it is scaled up for the opening frame.
    const coverFile = v.cover || 'cover-portrait-800x1200.png';
    const page = await browser.newPage({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: 1 });
    await page.goto(`${base}/game/index.html?capture`);
    await page.waitForFunction(() => window.__cap);
    let frame = 0;
    const shot = async () => {
      await page.screenshot({ path: path.join(TMP, `f${String(frame++).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 94 });
    };
    const step = async (n = 1) => {
      for (let i = 0; i < n; i++) {
        await page.evaluate((dt) => {
          window.__cap.update(dt);
          window.__cap.render();
        }, 1 / FPS);
        await shot();
      }
    };
    const plan = [
      { level: 45, skin: 'classic' },
      { level: 39, skin: 'beach' },
      { level: 82, skin: 'gold' },
    ];
    for (const p of plan) {
      const moves = await page.evaluate(({ level, skin }) => {
        const c = window.__cap;
        c.save.tutorialDone = true;
        c.g.skin = c.skinById(skin);
        c.startLevel('campaign', level);
        return c.solve(c.g.lv, c.g.ball.x, c.g.ball.y, c.g.painted, 4000);
      }, p);
      await step(10);
      for (const d of moves) {
        await page.evaluate((d) => window.__cap.tryMove(d), d);
        // Roll until the ball stops, then a short beat like a quick human player.
        for (let i = 0; i < 40; i++) {
          await step(1);
          if (!(await page.evaluate(() => window.__cap.g.ball.moving))) break;
        }
        await step(3);
      }
      await step(Math.round(FPS * 1.2)); // celebration
    }
    await page.close();
    const seconds = frame / FPS;
    console.log(v.name, 'gameplay seconds', seconds.toFixed(1));

    // Cover (1.0s) crossfades into gameplay; total trimmed to <= 20s; no audio track.
    const out = path.join(OUT, `${v.name}.mp4`);
    const fade = 0.4,
      hold = 1.0;
    const maxGameplay = 20 - hold;
    execFileSync('ffmpeg', [
      '-y', '-v', 'error',
      '-loop', '1', '-t', String(hold + fade), '-framerate', String(FPS), '-i', path.join(OUT, coverFile),
      '-framerate', String(FPS), '-i', path.join(TMP, 'f%05d.jpg'),
      '-filter_complex',
      `[0:v]scale=${v.w}:${v.h}:force_original_aspect_ratio=increase,crop=${v.w}:${v.h},setsar=1,format=yuv420p,fps=${FPS}[a];` +
        `[1:v]trim=duration=${Math.min(seconds, maxGameplay)},setpts=PTS-STARTPTS,scale=${v.w}:${v.h},setsar=1,format=yuv420p,fps=${FPS}[b];` +
        `[a][b]xfade=transition=fade:duration=${fade}:offset=${hold}[v]`,
      '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', String(FPS),
      out,
    ]);
    console.log('video', out);
  }
} finally {
  await browser.close();
  server.kill();
  rmSync(TMP, { recursive: true, force: true });
}
