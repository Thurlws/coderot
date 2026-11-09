'use strict';
// Sound. Cues are sampled one-shots in audio/sfx (decoded into Web Audio buffers; on file:// fetch is blocked, so
// they fall back to plain <audio> elements). Music + ambience beds are streamed <audio> files in audio/music that
// crossfade between channels: menu, battle, boss, the clinic (cyberware screen) and the city bed on game over.
// Time dilation pitches the music down and slows world sounds, like the game does.

let AC = null, OUT = null, LOOPS = null, muted = false; // LOOPS: looping beds (Sandevistan, scanner), silenced while paused
// cue name -> default volume. Also the preload list.
const CUE = {
  hover: .22, click: .5, tab: .5, open: .55, close: .5, on: .5, off: .5, up: .5, down: .5, money: .7, buyfail: .6, jackin: .7,
  glitch: .5, splash: .6, press: .6, cwopen: .7, cwclose: .6, zoomin: .6, zoomout: .5, install: .8, equip: .7, eq_launcher: .7,
  eq_blades: .7, eq_wire: .7, eq_arms: .7, unequip: .6, capacity: .35, cwupg: .7,
  wave: .65, clear: .7, update: .6, levelup: .7, perk: .7, perkmax: .8, area: .6, alert: .8, flatline: .85, death: .75,
  loot: .6, lootepic: .6, lootleg: .6, overclock: .6, recharge: .45, empty: .4, tag: .45, popup: .4, loadstart: .5,
  shot_debugger: .3, shot_refactorer: .42, shot_hacker: .2, shot_sysadmin: .3, shot_qa: .5, shot_devops: .32, shot_turret: .18,
  hit: .28, crit: .35, armor: .3, armorbreak: .8, kill: .45, killbig: .7, hurt: .8, hurtbig: .9, deflect: .7,
  expl_s: .55, expl_m: .7, expl_l: .9, cyberexpl: .8, lock: .3, lockend: .35, mine: .6, superland: .8, aid: .6, quickhack: .8,
  hackok: .6, link: .55, launcher: .45, whip: .5, whipback: .35, monowire: .5, blade: .5, bladehit: .45, fist: .55, slam: .7,
  ankles: .4, berserk_on: .85, berserk_off: .6, camo_on: .75, camo_off: .6, sandy_on: .9, sandy_off: .8, sandy_loop: .35,
  sandy_dash: .55, speedboost: .6, kerenz_on: .6, kerenz_off: .45, focus_on: .7, focus_off: .5, lowhp: .55, reboot: .75,
  secondheart: .9, heal: .7, healkill: .6, reflex: .65, memboost: .6, emp: .7, uiglitch: .7, warp: .6, dash: .45, blink: .6,
  drone_on: .5, drone_die: .5, bossdie: .9, partbreak: .7, weakhit: .4, cannon: .85, bossaim: .6,
  scan_on: .6, scan_off: .5, scan_loop: .28, scan_done: .45, qh_up: .5, qh_done: .55, qh_hover: .35, qh_press: .6, qh_fail: .5, qh_tag: .4,
  qh_ping: .6, qh_short: .7, qh_freeze: .65, qh_blind: .6, qh_burn: .6, qh_spread: .6, qh_spreadx: .65, qh_panic: .8, cw_cap: .4, access: .6, cw_step: .5, maxtac: .9, bw_up: .8, bw_hit: .95 };
// world sounds that slow down with time dilation (your own gun and cyberware keep their pitch)
const WORLD_CUE = new Set(['hit', 'crit', 'armor', 'kill', 'killbig', 'expl_s', 'expl_m', 'expl_l', 'cannon', 'bossdie', 'partbreak', 'weakhit', 'popup', 'shot_turret']);
const BUF = {}, LAST = {};
let voices = 0;

function ensureAudio() { // first key / tap / click: browsers only allow sound after a gesture
  if (!AC) try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    OUT = AC.createGain(); OUT.connect(comp).connect(AC.destination); LOOPS = AC.createGain(); LOOPS.connect(OUT);
    for (const n in CUE) fetch('audio/sfx/' + n + '.wav').then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
      .then(b => AC.decodeAudioData(b)).then(d => { BUF[n] = d; }, () => {});
  } catch (_) {}
  if (AC && AC.state === 'suspended') AC.resume();
  for (const a of Object.values(TRK)) if (a.want > 0 && a.paused) a.play().catch(() => {}); // retry music the browser blocked
}
const sfxVol = () => (muted ? 0 : SET.volume);
// Play a cue. gap = minimum seconds between two plays of the same cue (rapid fire would otherwise stack up).
function cue(n, v = 1, rate = 1, gap = .035) {
  if (!sfxVol() || !(n in CUE)) return null;
  const now = performance.now() / 1000; if (now - (LAST[n] || -9) < gap) return null; LAST[n] = now;
  if (worldK() < 1 && WORLD_CUE.has(n)) rate *= .62;
  v *= CUE[n] * sfxVol();
  const b = BUF[n];
  if (!b || !AC) { // not decoded (yet / file://): an <audio> element still plays it
    if (voices > 14) return null;
    const a = new Audio('audio/sfx/' + n + '.wav'); a.volume = Math.min(1, v); a.preservesPitch = false; a.playbackRate = rate;
    voices++; a.onended = a.onerror = () => voices--; a.play().catch(() => voices--); return null;
  }
  if (voices > 40) return null;
  const s = AC.createBufferSource(), g = AC.createGain();
  s.buffer = b; s.playbackRate.value = rate; g.gain.value = v; s.connect(g).connect(OUT); s.start();
  voices++; s.onended = () => voices--;
  return { s, g };
}
// A looping cue (the Sandevistan bed). Returns a stop(fade) function.
function loopCue(n, v = 1) {
  const b = BUF[n], vol = (CUE[n] || 1) * v * sfxVol();
  if (b && AC) {
    const s = AC.createBufferSource(), g = AC.createGain(); s.buffer = b; s.loop = true; g.gain.value = 0;
    g.gain.linearRampToValueAtTime(vol, AC.currentTime + .25); s.connect(g).connect(LOOPS); s.start();
    return (fade = .3) => { g.gain.cancelScheduledValues(AC.currentTime); g.gain.setValueAtTime(g.gain.value, AC.currentTime); g.gain.linearRampToValueAtTime(0, AC.currentTime + fade); s.stop(AC.currentTime + fade + .05); };
  }
  const a = new Audio('audio/sfx/' + n + '.wav'); a.loop = true; a.volume = Math.min(1, vol); a.play().catch(() => {});
  return () => a.pause();
}

// ---------- music ----------
const nums = (p, n) => Array.from({ length: n }, (_, i) => p + (i + 1));
const TRACKS = { menu: ['menu_amb'], battle: nums('battle', 17), boss: nums('bossfight', 10), clinic: ['clinic_room'], over: ['city'] }; // idle tracks got new file names so a browser can't serve the old cached ones
const TRK = {}; // name -> <audio>, created on first use
// battle + boss playlists play in random order: any track but the one that just played
const nextIdx = ch => { const n = TRACKS[ch].length; return ((musIdx[ch] ?? -1) + 1 + Math.floor(Math.random() * (n - 1))) % n; };
let musCh = '', musIdx = {}, musRate = 1;
musIdx = { battle: Math.floor(Math.random() * TRACKS.battle.length), boss: Math.floor(Math.random() * TRACKS.boss.length) }; // a random first track each session
function trk(name) {
  if (TRK[name]) return TRK[name];
  const a = TRK[name] = new Audio('audio/music/' + name + '.mp3');
  a.preload = 'auto'; a.volume = 0; a.want = 0; a.loop = TRACKS.battle.indexOf(name) < 0 && TRACKS.boss.indexOf(name) < 0;
  a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = false;
  return a;
}
// What should be playing right now. Bed = an ambience layered under (or instead of) the music.
function musicWant() {
  if (mode !== 'game') return ['menu', cwEl.hidden ? '' : 'clinic'];
  if (world.phase === 'over') return ['', 'over'];
  return [bossAlive() || deaths.some(d => !d.done) ? 'boss' : 'battle', ''];
}
function musicTick(dt) { // every frame: fade each track toward its target volume, advance playlists, follow time dilation
  const [ch, bed] = musicWant(), on = SET.music && !muted;
  if (ch && ch !== musCh) { // channel change: next track of that playlist from the top (menu + beds resume where they were)
    if (musCh === 'battle' || musCh === 'boss') musIdx[musCh] = nextIdx(musCh);
    musCh = ch; const a = trk(TRACKS[ch][musIdx[ch] || 0]); if (ch !== 'menu') a.currentTime = 0;
  }
  if (!ch) musCh = '';
  const cur = musCh && trk(TRACKS[musCh][musIdx[musCh] || 0]);
  if (cur && !cur.loop && cur.duration && cur.currentTime > cur.duration - 3) { // playlist: crossfade into the next track
    musIdx[musCh] = nextIdx(musCh); const nx = trk(TRACKS[musCh][musIdx[musCh]]); nx.currentTime = 0;
  }
  const playing = musCh && trk(TRACKS[musCh][musIdx[musCh] || 0]), bedA = bed && trk(TRACKS[bed][0]);
  const hold = paused && mode === 'game'; // pausing the game pauses the music (it resumes where it stopped)
  const sandy = mode === 'game' && worldK() < 1; // time dilation: the music drops back, quieter and slower
  const duck = (sandy ? .4 : 1) * (bed === 'clinic' ? .45 : 1), base = on && !hold ? SET.volume * SET.mvol : 0;
  if (LOOPS) LOOPS.gain.value += ((hold ? 0 : 1) - LOOPS.gain.value) * Math.min(1, dt * 12);
  musRate += ((worldK() < 1 ? .78 : slowmo > 0 ? .85 : 1) - musRate) * Math.min(1, dt * 6);
  for (const a of Object.values(TRK)) {
    const isBed = a === bedA;
    a.want = isBed ? (on && !hold ? SET.volume * .7 : 0) : a === playing ? base * duck : 0;
    const k = Math.min(1, dt / (a.want > a.volume ? .6 : hold || sandy ? .15 : musCh === 'boss' ? .3 : 1.4)); // fade in 0.6 s, out 1.4 s (pause / dilation / a boss arriving: fast)
    a.volume = clamp(a.volume + (a.want - a.volume) * k + Math.sign(a.want - a.volume) * dt * .02, 0, 1);
    if (!isBed) { const r = Math.round(musRate * 100) / 100; if (a.playbackRate !== r) a.playbackRate = r; }
    if (a.want > 0 && a.paused) a.play().catch(() => {});
    if (a.want === 0 && a.volume < .005 && !a.paused) a.pause();
  }
}
