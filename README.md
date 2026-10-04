# Slide & Paint

A relaxing maze-painting puzzle for **CrazyGames**: swipe the ball, it rolls until it hits a wall and paints every tile it crosses. Paint the whole board to win.

The look and feel follow the reference recording: cream backdrop, slate tiles, raised cream walls, one paint colour per level, a "HARD · Level N" header, back button, hint bulb with a video badge, and the purple "OUTSTANDING!" celebration. Everything is original code and art.

## What's in the box

| Path | What it is |
| --- | --- |
| `game/` | The game (plain HTML5 + Canvas, ES modules, no build step). This folder is what you upload. |
| `release/slide-and-paint-crazygames.zip` | Ready-to-upload build (`index.html` at the zip root, ~70 KB, 17 files). |
| `marketing/cover-landscape-1920x1080.png` | Cover 16:9 |
| `marketing/cover-portrait-800x1200.png` | Cover 2:3 |
| `marketing/cover-square-800x800.png` | Cover 1:1 |
| `marketing/video-landscape-1920x1080.mp4` | Preview video 16:9, 16.2 s, H.264, 30 fps, silent |
| `marketing/video-portrait-1080x1620.mp4` | Preview video 2:3, 16.2 s, H.264, 30 fps, silent |
| `tools/` | Level generator, store-asset renderer, build script |

## Features

- **200 verified campaign levels** (Easy → Medium → Hard → Expert). After level 200 the game continues endlessly with deterministic generated levels.
- **Never stuck:** every level is checked by a solver, and every reachable stop position can reach every other one, so no move can make a level unwinnable.
- **Stars and par:** each level has a par (shortest solution found by the solver). Finishing at par earns 3 stars.
- **Undo** (unlimited), **Restart**, and **Hints**. A hint draws the next 3 moves of a solution from the current position. You start with 3 free hints, and more come from opt-in rewarded ads.
- **Daily Challenge:** one seeded puzzle per day, with a streak counter.
- **14 ball skins:** 11 are unlocked with stars and 3 by watching a rewarded ad.
- **Level select** with pages, stars and locks.
- **Juice:** paint pops, a trail, squash on impact, screen bump, a ripple on completion, sparkles and praise words.
- **Synthesized audio** (WebAudio; no audio files): roll, bump, rising paint notes, a win jingle and soft generative music. Sound effects and music can each be toggled.
- **Controls:** swipe on touch, drag with the mouse, arrow keys or WASD. `Z` undo · `R` restart · `H` hint · `M` menu · `Enter` next.
- **Responsive:** works from 360×640 phones to 1920×1080 fullscreen, in both orientations, and is crisp on high-DPI screens.

## CrazyGames compliance checklist

Requirements researched from the CrazyGames developer docs (Technical, Gameplay, Game covers, Basic Launch, SDK v3).

**Technical**
- [x] Initial download ≤ 50 MB, and ≤ 20 MB for the mobile homepage: the whole game is ~150 KB.
- [x] File count ≤ 1500 (17 files); total ≤ 250 MB.
- [x] SDK v3 loaded from `https://sdk.crazygames.com/crazygames-sdk-v3.js` in `<head>`, with `await SDK.init()` before use.
- [x] `loadingStart` / `loadingStop` around boot, and **`gameplayStart` only once loading has stopped**, when the board is playable.
- [x] `gameplayStop` on menus, level-complete screen, dialogs and ads; `gameplayStart` when play resumes (events are de-duplicated).
- [x] `happytime()` on level completion.
- [x] Midgame ads only at a natural break (pressing *Next* between levels, from level 3). The platform controls frequency.
- [x] Rewarded ads are opt-in only (hint and skin unlock), and the reward is granted only on `adFinished`.
- [x] Audio muted and game paused while an ad plays, then restored on `adFinished` / `adError`.
- [x] Respects the platform's `settings.muteAudio` and listens for changes.
- [x] Progress saved through the SDK **data module** (cloud save across devices), falling back to `localStorage` off-platform.
- [x] Works without the SDK (adblock or other hosts): no errors, and the game never blocks.
- [x] Arrow keys, space, PageUp/PageDown, Home/End and the mouse wheel never scroll the page; the context menu is disabled.
- [x] **Restricted keys respected:** `Esc` is never bound or intercepted (CrazyGames uses it to exit fullscreen); the menu is on `M`, and Tab is left alone.
- [x] Safe-area insets (notches, rounded corners) respected on every edge in the CrazyGames app.
- [x] iOS audio unlocks on `touchend`/`click` and resumes after interruptions.
- [x] `gameplayStop` while the tab is hidden.
- [x] No audio before the first user interaction (autoplay policy).
- [x] Audio is suspended when the tab is hidden.
- [x] Runs in the iframe on any domain: relative paths, no sitelock, no external requests other than the SDK.
- [x] Legible at 800×450 with devicePixelRatio 1, and on mobile.

**Gameplay / content**
- [x] **No custom fullscreen button**, since CrazyGames provides one.
- [x] No external links, no external ads, no external login, and no other platform's branding or "more games" buttons.
- [x] In-game **Privacy & Terms** (main menu and Settings), as required for Basic Launch.
- [x] **Onboarding:** level 1 is a guided mini tutorial with an animated swipe hand, the solution path and step-by-step tips adapted to touch or keyboard. Level 2 points out Undo and Hint. English UI.
- [x] Fast to gameplay: the game boots straight into the current level.
- [x] Touch, mouse and keyboard controls; restricted browser keys are avoided.
- [x] Original art and code. The font is Fredoka (SIL OFL, licence in `game/assets/fonts/OFL.txt`).

**Store assets**
- [x] 3 covers: 1920×1080 (16:9), 800×1200 (2:3) and 800×800 (1:1). They have no borders, no logos or icons and no text other than the title, and they are illustrated rather than raw screenshots.
- [x] 2 preview videos: landscape 1920×1080 and portrait 1080×1620 (2:3). Each is 16.2 s (inside the 15–20 s window), silent (no audio track), H.264 MP4 at 30 fps, ~1.5 MB (limit 50 MB), and opens on the static cover before cutting to real gameplay.

> Note: some third-party guides list the portrait video as 1080×1920. The CrazyGames docs say portrait is "1080p – 2:3", which is 1080×1620. If the portal asks for 9:16, change the portrait entry in `tools/capture.mjs` to `w: 1080, h: 1920` and re-run it.

## Submission form text

- **Title:** Slide & Paint
- **Short description:** Roll the ball, paint every tile! A relaxing maze puzzle with 200+ levels.
- **Description:** Swipe to send the ball rolling. It won't stop until it hits a wall and paints every tile it passes. Fill the whole maze with colour to clear the level! Start easy, then work through twisty Expert mazes, aim for par to earn 3 stars, and play a new Daily Challenge every day. Stuck? Undo any move or grab a hint. Collect stars to unlock fun new balls like the Beach Ball, Eight Ball, Planet and Rainbow.
- **Controls:** Swipe or drag / Arrow keys or WASD to roll · Z undo · R restart · H hint · M menu
- **Suggested tags:** Puzzle, Maze, Casual, Relaxing, Mobile, Brain, Logic, Ball
- **Orientation:** Both (responsive)

## Deploying to Vercel

`vercel.json` serves the `game/` folder as a static site, with no build step. No Project Settings changes are needed. If the dashboard overrides it, set **Output Directory** to `game` and leave the build command empty.

## Development

```bash
npm run serve        # http://localhost:8080 (python3 static server)
npm run levels       # regenerate game/js/levels.js (deterministic, verified)
npm run build        # -> release/slide-and-paint-crazygames.zip
npm run marketing    # -> marketing/ covers + videos (Playwright Chromium + ffmpeg)
```

On localhost the CrazyGames SDK runs in its `local` environment, which shows demo ads. Use the CrazyGames QA tool after uploading to preview the game on the platform.
