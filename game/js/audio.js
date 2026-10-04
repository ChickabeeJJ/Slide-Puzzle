// All sound is synthesized with WebAudio: no audio files to download.
// The context is only created after the first user gesture (browser autoplay rules).

let ctx = null;
let master, sfxBus, musicBus;
let noiseBuf = null;
const flags = { sfx: true, music: true, forceMute: false, hidden: false };

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyVolumes();
    startMusic();
  }
  if (ctx.state === 'suspended' && !flags.hidden) ctx.resume();
}

export function setAudioFlags(next) {
  Object.assign(flags, next);
  applyVolumes();
  if (ctx) {
    if (flags.hidden) ctx.suspend();
    else ctx.resume();
  }
}

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(flags.forceMute ? 0 : 1, t, 0.02);
  sfxBus.gain.setTargetAtTime(flags.sfx ? 0.9 : 0, t, 0.02);
  musicBus.gain.setTargetAtTime(flags.music ? 0.32 : 0, t, 0.1);
}

function canPlay() {
  return ctx && flags.sfx && !flags.forceMute && ctx.state === 'running';
}

function tone(freq, { type = 'sine', dur = 0.15, vol = 0.3, at = 0, slide = 0, attack = 0.005, bus = sfxBus } = {}) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(bus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.2, freq = 1200, q = 0.8, type = 'bandpass', at = 0, sweep = 0 } = {}) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(freq + sweep, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(sfxBus);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  roll(cells) {
    if (!canPlay()) return;
    const dur = Math.min(0.5, 0.06 + cells * 0.045);
    noise({ dur, vol: 0.16, freq: 500, sweep: 900, q: 1.2 });
  },
  bump() {
    if (!canPlay()) return;
    tone(150, { type: 'sine', dur: 0.12, vol: 0.35, slide: -80 });
    noise({ dur: 0.06, vol: 0.12, freq: 2500, q: 2 });
  },
  paint(progress) {
    if (!canPlay()) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    const step = scale[Math.min(scale.length - 1, Math.floor(progress * scale.length))];
    tone(523.25 * Math.pow(2, step / 12), { type: 'triangle', dur: 0.09, vol: 0.06 });
  },
  win() {
    if (!canPlay()) return;
    [0, 4, 7, 12, 16].forEach((s, i) => tone(523.25 * Math.pow(2, s / 12), { type: 'triangle', dur: 0.35, vol: 0.18, at: i * 0.075 }));
    tone(1046.5, { type: 'sine', dur: 0.8, vol: 0.12, at: 0.4 });
  },
  star(i) {
    if (!canPlay()) return;
    tone(880 * Math.pow(2, (i * 4) / 12), { type: 'sine', dur: 0.25, vol: 0.2 });
    tone(1760 * Math.pow(2, (i * 4) / 12), { type: 'sine', dur: 0.15, vol: 0.06, at: 0.02 });
  },
  click() {
    if (!canPlay()) return;
    tone(660, { type: 'sine', dur: 0.06, vol: 0.12, slide: 200 });
  },
  undo() {
    if (!canPlay()) return;
    tone(500, { type: 'sine', dur: 0.1, vol: 0.12, slide: -250 });
  },
  hint() {
    if (!canPlay()) return;
    [0, 7, 12].forEach((s, i) => tone(784 * Math.pow(2, s / 12), { type: 'sine', dur: 0.2, vol: 0.12, at: i * 0.06 }));
  },
  unlock() {
    if (!canPlay()) return;
    [0, 4, 7, 11, 14].forEach((s, i) => tone(659 * Math.pow(2, s / 12), { type: 'triangle', dur: 0.3, vol: 0.14, at: i * 0.05 }));
  },
  error() {
    if (!canPlay()) return;
    tone(220, { type: 'square', dur: 0.12, vol: 0.05 });
  },
};

// Gentle generative music: soft pentatonic arpeggios over slow chords.
let musicTimer = 0;
function startMusic() {
  const chords = [
    [0, 4, 7, 11],
    [-3, 0, 4, 7],
    [-7, -3, 0, 4],
    [-5, -1, 2, 7],
  ];
  const root = 261.63;
  let step = 0;
  let next = ctx.currentTime + 0.1;
  const beat = 0.42;
  const tick = () => {
    if (!ctx) return;
    while (next < ctx.currentTime + 0.6) {
      const chord = chords[Math.floor(step / 8) % chords.length];
      const at = next - ctx.currentTime;
      if (flags.music && !flags.forceMute) {
        if (step % 8 === 0) {
          chord.forEach((s) => tone((root / 2) * Math.pow(2, s / 12), { type: 'sine', dur: beat * 8, vol: 0.05, at, attack: 0.4, bus: musicBus }));
        }
        const pattern = [0, 2, 1, 3, 2, 1, 3, 0];
        if (step % 2 === 0 || Math.random() < 0.35) {
          const s = chord[pattern[step % 8]] + 12;
          tone(root * Math.pow(2, s / 12), { type: 'triangle', dur: beat * 1.6, vol: 0.045, at, attack: 0.02, bus: musicBus });
        }
      }
      next += beat;
      step++;
    }
  };
  clearInterval(musicTimer);
  musicTimer = setInterval(tick, 150);
}
