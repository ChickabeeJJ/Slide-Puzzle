// Thin wrapper around the CrazyGames HTML5 SDK v3.
// Every call is safe when the SDK is missing (local dev, adblock, other hosts).

const state = {
  cg: null,
  env: 'none',
  gameplay: false,
  loading: false,
  adPlaying: false,
  muteFromPlatform: false,
  listeners: new Set(),
};

export const sdk = {
  get env() {
    return state.env;
  },
  get available() {
    return !!state.cg && state.env !== 'disabled';
  },
  get adPlaying() {
    return state.adPlaying;
  },
  get platformMuted() {
    return state.muteFromPlatform;
  },

  async init() {
    const CG = window.CrazyGames && window.CrazyGames.SDK;
    if (!CG) return;
    try {
      await CG.init();
      state.cg = CG;
      state.env = CG.environment || 'crazygames';
      try {
        state.muteFromPlatform = !!(CG.game.settings && CG.game.settings.muteAudio);
        CG.game.addSettingsChangeListener((settings) => {
          state.muteFromPlatform = !!settings.muteAudio;
          emit();
        });
      } catch (e) {
        /* settings not supported in this environment */
      }
    } catch (e) {
      console.warn('[sdk] init failed', e);
      state.cg = null;
    }
  },

  onChange(fn) {
    state.listeners.add(fn);
  },

  loadingStart() {
    if (state.loading) return;
    state.loading = true;
    call((cg) => cg.game.loadingStart());
  },
  loadingStop() {
    if (!state.loading) return;
    state.loading = false;
    call((cg) => cg.game.loadingStop());
  },

  // Idempotent: only forwards real transitions.
  setGameplay(on) {
    if (state.gameplay === on) return;
    state.gameplay = on;
    call((cg) => (on ? cg.game.gameplayStart() : cg.game.gameplayStop()));
  },

  happytime() {
    call((cg) => cg.game.happytime());
  },

  // Resolves true when a rewarded ad finished (reward should be granted),
  // or when a midgame ad finished/was skipped. Never rejects.
  requestAd(type, { onStart } = {}) {
    if (!sdk.available) {
      // No ad provider (local dev / adblock): never block the player.
      return Promise.resolve(type === 'rewarded' ? 'no-sdk' : false);
    }
    return new Promise((resolve) => {
      const wasPlaying = state.gameplay;
      const done = (result) => {
        state.adPlaying = false;
        emit();
        if (wasPlaying) sdk.setGameplay(true);
        resolve(result);
      };
      try {
        state.cg.ad.requestAd(type, {
          adStarted: () => {
            sdk.setGameplay(false);
            state.adPlaying = true;
            emit();
            onStart && onStart();
          },
          adFinished: () => done(true),
          adError: (err) => {
            console.info('[sdk] ad unavailable', err);
            done(false);
          },
        });
      } catch (e) {
        done(false);
      }
    });
  },

  // Persistent storage: CrazyGames cloud data module when available, localStorage otherwise.
  getItem(key) {
    try {
      if (sdk.available && state.cg.data) return state.cg.data.getItem(key);
    } catch (e) {
      /* fall through */
    }
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  },
  setItem(key, value) {
    try {
      if (sdk.available && state.cg.data) {
        state.cg.data.setItem(key, value);
        return;
      }
    } catch (e) {
      /* fall through */
    }
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* storage unavailable */
    }
  },
};

function call(fn) {
  if (!sdk.available) return;
  try {
    fn(state.cg);
  } catch (e) {
    console.warn('[sdk]', e);
  }
}

function emit() {
  for (const fn of state.listeners) fn();
}
