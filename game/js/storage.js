import { sdk } from './sdk.js';

const KEY = 'slideandpaint_save_v1';

const DEFAULTS = () => ({
  v: 1,
  unlocked: 1, // highest campaign level the player may open
  current: 1, // level shown when pressing Play
  stars: {}, // level number -> best stars (1..3)
  hints: 3,
  skin: 'classic',
  adSkins: [],
  sfx: true,
  music: true,
  shake: true,
  showMoves: true,
  daily: { last: null, streak: 0, best: 0, done: {} },
  tutorialDone: false,
  tipsDone: false,
});

export const save = DEFAULTS();

// Progress lives in the CrazyGames data module when the SDK is available
// (cloud-synced for logged-in players), otherwise in localStorage.
export function loadSave() {
  let raw = null;
  try {
    raw = sdk.getItem(KEY);
    // First run on CrazyGames after playing without the SDK: migrate the local save.
    if (!raw && sdk.cloudSave) {
      raw = localStorage.getItem(KEY);
      if (raw) sdk.setItem(KEY, raw);
    }
  } catch (e) {
    /* storage blocked */
  }
  Object.keys(save).forEach((k) => delete save[k]);
  Object.assign(save, DEFAULTS());
  try {
    if (raw) {
      const data = JSON.parse(raw);
      Object.assign(save, data, { daily: Object.assign(DEFAULTS().daily, data.daily) });
    }
  } catch (e) {
    console.warn('save corrupted, starting fresh', e);
  }
  return save;
}

let pending = 0;
export function persist() {
  clearTimeout(pending);
  pending = setTimeout(flushSave, 150);
}

// Write immediately (level complete, tab hidden, page closing).
export function flushSave() {
  clearTimeout(pending);
  pending = 0;
  sdk.setItem(KEY, JSON.stringify(save));
}

export function resetSave() {
  Object.keys(save).forEach((k) => delete save[k]);
  Object.assign(save, DEFAULTS());
  sdk.setItem(KEY, JSON.stringify(save));
}

export function totalStars() {
  return Object.values(save.stars).reduce((a, b) => a + b, 0);
}
