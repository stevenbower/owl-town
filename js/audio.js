// Tiny chiptune synth: sound effects and a looping background tune (Web Audio, no files).
(function () {
  'use strict';

  let ac = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  try { muted = localStorage.getItem('owl-muted') === '1'; } catch (e) { /* storage unavailable */ }

  function init() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ac.destination);
    musicGain = ac.createGain();
    musicGain.gain.value = 0.5;
    musicGain.connect(master);
    // iOS: playing one silent buffer inside the gesture fully unlocks audio
    const buf = ac.createBuffer(1, 1, 22050);
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    src.start(0);
  }

  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  function tone({ type = 'square', f0, f1 = f0, t = 0, dur = 0.1, vol = 0.15, dest }) {
    if (!ac) return;
    const start = ac.currentTime + t;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g);
    g.connect(dest || master);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  const SFX = {
    jump: () => tone({ f0: 380, f1: 760, dur: 0.12, vol: 0.09 }),
    flap: () => { tone({ type: 'triangle', f0: 520, f1: 900, dur: 0.08, vol: 0.14 }); tone({ type: 'triangle', f0: 700, f1: 1100, t: 0.05, dur: 0.06, vol: 0.08 }); },
    apple: () => [72, 76, 79, 84].forEach((n, i) => tone({ f0: midi(n), t: i * 0.06, dur: 0.12, vol: 0.1 })),
    dot: () => tone({ type: 'sine', f0: 1300, f1: 1900, dur: 0.07, vol: 0.12 }),
    stomp: () => { tone({ f0: 320, f1: 90, dur: 0.13, vol: 0.12 }); tone({ type: 'sine', f0: midi(84), t: 0.08, dur: 0.1, vol: 0.1 }); },
    bounce: () => tone({ type: 'sine', f0: 180, f1: 980, dur: 0.25, vol: 0.18 }),
    hurt: () => { tone({ type: 'sawtooth', f0: 440, f1: 110, dur: 0.35, vol: 0.1 }); },
    fall: () => tone({ type: 'triangle', f0: 700, f1: 80, dur: 0.6, vol: 0.18 }),
    locked: () => { tone({ f0: 220, dur: 0.1, vol: 0.08 }); tone({ f0: 196, t: 0.12, dur: 0.14, vol: 0.08 }); },
    unlock: () => [76, 79, 83, 88, 91].forEach((n, i) => tone({ type: 'triangle', f0: midi(n), t: i * 0.07, dur: 0.2, vol: 0.15 })),
    clear: () => {
      const seq = [[72, 0], [76, 0.12], [79, 0.24], [84, 0.36], [79, 0.52], [84, 0.64]];
      seq.forEach(([n, t]) => tone({ f0: midi(n), t, dur: 0.18, vol: 0.1 }));
      tone({ type: 'triangle', f0: midi(48), t: 0.64, dur: 0.5, vol: 0.18 });
    },
    home: () => {
      const seq = [72, 74, 76, 77, 79, 81, 83, 84];
      seq.forEach((n, i) => tone({ type: 'triangle', f0: midi(n), t: i * 0.09, dur: 0.3, vol: 0.14 }));
      [60, 64, 67, 72].forEach((n) => tone({ f0: midi(n), t: 0.8, dur: 1.2, vol: 0.05 }));
    },
    start: () => [67, 72, 76, 79].forEach((n, i) => tone({ f0: midi(n), t: i * 0.08, dur: 0.14, vol: 0.09 })),
  };

  // --- Music ---------------------------------------------------------------
  // 8th-note steps. null = rest.
  const MELODY = [
    76, 79, 84, 79, 81, 79, 76, null,
    77, 81, 84, 81, 79, null, 76, null,
    74, 76, 77, 79, 81, 79, 77, 76,
    74, null, 79, null, 72, null, null, null,
    76, 79, 84, 79, 81, 79, 76, null,
    77, 81, 84, 86, 88, null, 84, null,
    86, 84, 83, 81, 79, 77, 76, 74,
    72, null, 76, null, 72, null, null, null,
  ];
  const BASS = [48, 48, 43, 43, 41, 41, 48, 48, 50, 50, 43, 43, 43, 43, 48, 48,
                48, 48, 43, 43, 41, 41, 45, 45, 50, 50, 43, 43, 48, 43, 48, 48];
  const STEP = 60 / 138 / 2;
  let playing = false;
  let step = 0;
  let nextTime = 0;
  let timer = null;

  function schedule() {
    while (nextTime < ac.currentTime + 0.12) {
      const t = nextTime - ac.currentTime;
      const n = MELODY[step % MELODY.length];
      if (n) tone({ f0: midi(n), t, dur: STEP * 0.9, vol: 0.055, dest: musicGain });
      if (step % 2 === 0) {
        const b = BASS[(step / 2) % BASS.length];
        tone({ type: 'triangle', f0: midi(b), t, dur: STEP * 1.7, vol: 0.16, dest: musicGain });
      }
      if (step % 4 === 2) tone({ type: 'square', f0: 3000, f1: 1500, t, dur: 0.02, vol: 0.015, dest: musicGain });
      step++;
      nextTime += STEP;
    }
  }

  window.Sound = {
    init,
    play(name) {
      if (!ac || muted) return;
      const f = SFX[name];
      if (f) f();
    },
    startMusic() {
      if (!ac || playing) return;
      playing = true;
      step = 0;
      nextTime = ac.currentTime + 0.05;
      timer = setInterval(schedule, 25);
    },
    stopMusic() {
      playing = false;
      clearInterval(timer);
    },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('owl-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.6, ac.currentTime, 0.02);
      return muted;
    },
    get muted() { return muted; },
  };
})();
