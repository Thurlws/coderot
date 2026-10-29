'use strict';
// Tiny synth: blips, arpeggios and a filtered-noise boom. Starts on the first key/tap (browser autoplay rules).

let AC = null, NOISE = null, muted = false;
function ensureAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    NOISE = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = NOISE.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (_) {}
}
function sfx(f, d = .1, type = 'square', v = .05, f2) {
  if (muted || !AC || !SET.volume) return;
  v *= SET.volume;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d);
}
function boom(d = .9, v = .35) {
  if (muted || !AC || !NOISE || !SET.volume) return;
  v *= SET.volume;
  const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = NOISE; f.type = 'lowpass'; f.frequency.setValueAtTime(2400, t); f.frequency.exponentialRampToValueAtTime(50, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d);
  s.connect(f).connect(g).connect(AC.destination); s.start(t); s.stop(t + d);
}
// ---------- music ----------
// A small synthwave band scheduled ahead on the audio clock (tight timing even when frames stutter):
// drums, a filtered saw bass, a detuned pad, a plucked arp and a lead through a delay, into a compressor.
// Two songs: CODE (A minor, 112 bpm) while you play, PROD (D minor, 140 bpm) during boss fights.
// Rot danger adds layers: arp at 25%, 16th hats + lead at 50%, a pumping pad at 80%.
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const SONGS = {
  code: { bpm: 112,
    chords: [[57, 60, 64], [57, 60, 65], [55, 60, 64], [55, 59, 62]], roots: [33, 29, 36, 31],
    bass: [1, 0, 1, 0, 2, 0, 1, 1, 1, 0, 1, 0, 2, 0, 1, 2], kick: [0, 8], snare: [4, 12],
    lead: [[0, 76, 3], [4, 74, 2], [6, 72, 2], [8, 69, 4], [12, 72, 2], [14, 74, 2],
      [16, 77, 4], [20, 76, 2], [22, 72, 6], [28, 69, 4],
      [32, 79, 3], [35, 76, 3], [38, 72, 2], [40, 76, 2], [42, 79, 2], [44, 84, 4],
      [48, 83, 4], [52, 79, 4], [56, 74, 6], [62, 71, 2]] },
  prod: { bpm: 140,
    chords: [[62, 65, 69], [62, 65, 70], [62, 67, 70], [61, 64, 69]], roots: [38, 34, 31, 33],
    bass: [1, 0, 1, 1, 2, 0, 1, 1, 1, 0, 1, 1, 2, 0, 2, 1], kick: [0, 4, 8, 12], snare: [4, 12],
    lead: [[0, 74, 2], [2, 77, 2], [4, 81, 4], [8, 79, 2], [10, 77, 2], [12, 76, 4],
      [16, 74, 2], [18, 77, 2], [20, 82, 4], [24, 81, 4], [28, 77, 4],
      [32, 79, 2], [34, 82, 2], [36, 86, 4], [40, 84, 2], [42, 82, 2], [44, 79, 4],
      [48, 81, 6], [54, 79, 2], [56, 76, 4], [60, 73, 4]] }};
let MUS = null, musSong = 'code', musStep = 0, musNext = 0;
function musBus() { // master chain, built once
  if (MUS) return MUS;
  const comp = AC.createDynamicsCompressor(), out = AC.createGain(), delay = AC.createDelay(1), fb = AC.createGain(), dlp = AC.createBiquadFilter(), send = AC.createGain();
  comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = .005; comp.release.value = .2;
  out.connect(comp).connect(AC.destination);
  dlp.type = 'lowpass'; dlp.frequency.value = 2500; fb.gain.value = .32;
  send.connect(delay); delay.connect(dlp).connect(fb).connect(delay); dlp.connect(out);
  return MUS = { out, send, delay };
}
function env(g, at, peak, a, dur, rel = .05) { // attack/hold/release on a gain param
  g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + a);
  g.gain.setValueAtTime(peak, at + Math.max(a, dur - rel)); g.gain.linearRampToValueAtTime(0, at + dur + rel);
}
function voice(type, f, at, dur, peak, { cut = 0, cutEnd = 0, q = 1, a = .005, detune = 0, send = 0, rel = .05 } = {}) {
  const o = AC.createOscillator(), g = AC.createGain(); let node = o;
  o.type = type; o.frequency.setValueAtTime(f, at); o.detune.value = detune;
  if (cut) {
    const fl = AC.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = q;
    fl.frequency.setValueAtTime(cut, at); if (cutEnd) fl.frequency.exponentialRampToValueAtTime(cutEnd, at + dur);
    node = node.connect(fl);
  }
  node.connect(g); g.connect(MUS.out); if (send) { const s = AC.createGain(); s.gain.value = send; g.connect(s).connect(MUS.send); }
  env(g, at, peak, a, dur, rel); o.start(at); o.stop(at + dur + rel + .02);
}
function noiseHit(at, dur, peak, type, freq, q = 1) {
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = NOISE; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(peak, at); g.gain.exponentialRampToValueAtTime(.0001, at + dur);
  s.connect(f).connect(g).connect(MUS.out); s.start(at, Math.random() * .5); s.stop(at + dur + .02);
}
function kick(at) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.frequency.setValueAtTime(160, at); o.frequency.exponentialRampToValueAtTime(42, at + .12);
  g.gain.setValueAtTime(.9, at); g.gain.exponentialRampToValueAtTime(.001, at + .38);
  o.connect(g).connect(MUS.out); o.start(at); o.stop(at + .4);
}
function playStep(S, i, at, danger, sixteenth) {
  const bar = (i >> 4) & 3, st = i & 15, ch = S.chords[bar], root = S.roots[bar], boss = S === SONGS.prod;
  if (S.kick.includes(st) || (boss && st === 14 && bar === 3)) kick(at);
  if (S.snare.includes(st)) { noiseHit(at, .2, .35, 'bandpass', 1800, .8); voice('triangle', 190, at, .08, .18); }
  if (bar === 3 && st >= 12 && boss) noiseHit(at, .1, .2, 'bandpass', 2400, .8); // fill
  if (st % 2 === 1 || (danger > .5 && st % 2 === 0)) noiseHit(at, st % 4 === 2 ? .12 : .04, st % 2 ? .09 : .05, 'highpass', 8000);
  const bm = S.bass[st];
  if (bm) voice('sawtooth', midi(root + (bm === 2 ? 12 : 0)), at, sixteenth * .9, boss ? .2 : .24, { cut: boss ? 1600 : 1100, cutEnd: 180, q: 6 });
  if (st === 0) for (const n of ch) for (const dt of [-8, 8]) // pad: two detuned saws per chord tone, one bar long
    voice('sawtooth', midi(n), at, sixteenth * 16, danger > .8 ? .05 : .035, { cut: 900 + danger * 1400, a: .25, detune: dt, rel: .3 });
  if (danger > .8 && st % 4 === 2) for (const n of ch) voice('sawtooth', midi(n + 12), at, sixteenth * 1.5, .03, { cut: 2500 }); // pumping stabs
  if (danger > .25 || boss) { const n = ch[st % 3] + 12 * (1 + (st >> 3 & 1)); voice('triangle', midi(n), at, sixteenth * .8, .07, { send: .35 }); }
  if (danger > .5 || boss) for (const [s, n, len] of S.lead) if (s === (i & 63)) voice('square', midi(n), at, sixteenth * len, .06, { cut: 3200, a: .01, send: .5, detune: 5 });
}
function musicTick(dt, danger, boss) { // called every frame while playing; schedules ~150ms ahead
  if (!SET.music || muted || !AC || !SET.volume) { musNext = 0; return; }
  musBus(); MUS.out.gain.value = .5 * SET.volume;
  const want = boss ? 'prod' : 'code';
  if (musNext < AC.currentTime) musNext = AC.currentTime + .05; // resume after a pause without a burst of late notes
  while (musNext < AC.currentTime + .15) {
    if (want !== musSong && (musStep & 15) === 0) { musSong = want; musStep = 0; } // switch songs on a bar line
    const S = SONGS[musSong], six = 60 / S.bpm / 4;
    MUS.delay.delayTime.value = six * 3; // dotted 8th echo
    playStep(S, musStep, musNext, danger, six); musNext += six; musStep++;
  }
}
const arp = (notes, gap = .07, type = 'square', v = .05) => notes.forEach((n, i) => setTimeout(() => sfx(n, .18, type, v), i * gap * 1000));
