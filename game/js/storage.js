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
  daily: { last: null, streak: 0, best: 0, done: {} },
  tutorialDone: false,
});

export const save = DEFAULTS();

export function loadSave() {
  try {
    const raw = sdk.getItem(KEY);
    if (raw) Object.assign(save, DEFAULTS(), JSON.parse(raw));
  } catch (e) {
    console.warn('save corrupted, starting fresh', e);
  }
  return save;
}

let pending = 0;
export function persist() {
  clearTimeout(pending);
  pending = setTimeout(() => sdk.setItem(KEY, JSON.stringify(save)), 150);
}

export function resetSave() {
  Object.keys(save).forEach((k) => delete save[k]);
  Object.assign(save, DEFAULTS());
  sdk.setItem(KEY, JSON.stringify(save));
}

export function totalStars() {
  return Object.values(save.stars).reduce((a, b) => a + b, 0);
}
