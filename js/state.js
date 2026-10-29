'use strict';
// Shared mutable game state + small effect helpers.

const C = document.getElementById('c'), X = C.getContext('2d');
let scale = 1, ox = 0, oy = 0;
function resize() {
  const r = C.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
  C.width = r.width * d; C.height = r.height * d;
  scale = Math.min(C.width / W, C.height / H); ox = (C.width - W * scale) / 2; oy = (C.height - H * scale) / 2;
}
addEventListener('resize', resize); resize();

let mode = 'menu', paused = false, T = 0, overT = 0, banner = null;
let shake = 0, flash = 0, flashCol = '255,40,80', hitstop = 0, glitch = 0, chroma = 0, slowmo = 0, myPing = 0;
let deaths = [], newUnlocks = []; // boss death sequences in progress (render.js) · skins unlocked by the last run
let nick = 'DEV' + (100 + Math.random() * 900 | 0), myClass = 'debugger', myDiff = 'normal', myAutoSkip = false, myColor = 0, best = 0, newBest = false;
try {
  nick = localStorage.getItem('coderot-nick') || nick;
  myClass = CLASSES[localStorage.getItem('coderot-class')] ? localStorage.getItem('coderot-class') : myClass;
  myDiff = DIFFS[localStorage.getItem('coderot-diff')] ? localStorage.getItem('coderot-diff') : myDiff;
  myAutoSkip = localStorage.getItem('coderot-autoskip') === '1';
  best = +localStorage.getItem('coderot-best') || 0;
} catch (_) {}
const dif = () => DIFFS[world.diff] || DIFFS.normal;

// Player settings (settings panel in main.js). Reduced-motion users start with shake and glitch off.
const SET_DEFAULT = { shake: true, flash: true, glitch: true, particles: true, numbers: true, music: true, volume: .8 };
const SET = { ...SET_DEFAULT };
if (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) Object.assign(SET, { shake: false, glitch: false });
try { const s = JSON.parse(localStorage.getItem('coderot-settings') || '{}'); for (const k in SET_DEFAULT) if (typeof s[k] === typeof SET_DEFAULT[k]) SET[k] = s[k]; } catch (_) {}
const saveSettings = () => { try { localStorage.setItem('coderot-settings', JSON.stringify(SET)); } catch (_) {} };

// The authoritative world lives on the host (or locally in solo); clients mirror it from snapshots.
const world = { diff: 'normal', muts: [], autoskip: false, waveT: 0, phase: 'wait', wave: 0, run: 0, nk: 0, hl: 0, ht: '', nx: W / 2, ny: H / 2, bugs: [], pows: [], shots: [], dep: [], queue: [], spawnT: 0, breakT: 0, nid: 1, bm: 1 };
let hintT = -9; // last time a mechanic hint popped up
const rot = new Float32Array(NC), cleanedAt = new Float32Array(NC).fill(-9);
const seen = { run: 0, wave: 0, nk: 0, hl: 0, bk: 0, cleared: false, phase: 'wait' };
const others = new Map();  // remote players by peer id
const gone = new Map();    // ids this client already removed locally, so a stale snapshot doesn't resurrect them
let isHost = true, rotFrac = 0;
let pend = { h: new Map(), c: new Set(), e: [] }; // client actions waiting to be sent to the host

let bullets = [], parts = [], rings = [], pops = [], smudges = [], turrets = [], uiButtons = [];

const UP0 = () => Object.fromEntries(Object.keys(UPG).map(k => [k, 0]));
function mkMe() {
  const K = CLASSES[myClass];
  return { cls: myClass, x: W / 2 + rand(-80, 80), y: H / 2 + rand(-50, 50), vx: 0, vy: 0, fx: 1, fy: 0, a: 0, hp: K.hp, mh: K.hp,
    cd: 0, dashT: 0, dashCd: 0, inv: 1.5, down: false, rev: 0, score: 0, chain: 0, chainT: 0, pw: {}, trail: [], sup: 0, superT: 0, noCharge: 0,
    up: UP0(), syn: {}, picks: 0, offer: null, firing: false, duckCd: 0, skillCd: 0, stress: 0, t: 0, kills: 0, bosses: 0 };
}

// Lifetime stats per class + difficulty, keyed 'debugger/normal'. Sandbox runs never count.
let STATS = {};
try { STATS = JSON.parse(localStorage.getItem('coderot-stats') || '{}') || {}; } catch (_) {}
const statOf = (cls, diff) => STATS[cls + '/' + diff] || { best: 0, wave: 0, runs: 0, kills: 0, bosses: 0 };
function lifetime() { // totals for skin unlocks
  const t = { bosses: 0, kills: 0, wave: 0, nightmare: 0 };
  for (const k in STATS) { const s = STATS[k]; t.bosses += s.bosses; t.kills += s.kills; t.wave = Math.max(t.wave, s.wave); if (k.endsWith('/nightmare')) t.nightmare = Math.max(t.nightmare, s.wave); }
  return t;
}
const unlocked = () => { const t = lifetime(); return SKINS.filter(s => s.ok(t)).map(s => s.id); };
let mySkin = 'none', myMuts = [];
try { mySkin = localStorage.getItem('coderot-skin') || 'none'; myMuts = JSON.parse(localStorage.getItem('coderot-muts') || '[]').filter(k => MUTS[k]); } catch (_) {}
const mut = k => world.muts.includes(k);
const mutScore = () => world.muts.reduce((m, k) => m * MUTS[k].score, 1);
function recordRun() {
  const s = statOf(me.cls, world.diff);
  STATS[me.cls + '/' + world.diff] = { best: Math.max(s.best, me.score | 0), wave: Math.max(s.wave, world.wave), runs: s.runs + 1,
    kills: s.kills + me.kills, bosses: s.bosses + me.bosses };
  try { localStorage.setItem('coderot-stats', JSON.stringify(STATS)); } catch (_) {}
}
let me = mkMe();

const pop = (x, y, text, col, size = 16) => pops.push({ x, y, text, col, size, life: 1 });
const ring = (x, y, r, vr, life, col, w = 3) => rings.push({ x, y, r, vr, life, max: life, col, w });
function burst(x, y, col, n, chars, sp = 420) {
  if (parts.length > 1400) return;
  if (!SET.particles) n = Math.ceil(n * .3);
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283), s = rand(60, sp), l = rand(.35, .9);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, col, ch: chars ? pick(BITS) : null });
  }
}
// Screen gunk from ADWARE hits: rot splats that fade, and fake popups that drift around, breed more popups,
// and stay up until you click their X (dash or ADBLOCK also clears them). The OK button is sometimes a trap.
const MAX_POPUPS = 10;
function addPopup(text, x, y) {
  if (smudges.filter(s => s.popup).length >= MAX_POPUPS) return;
  const w = rand(250, 330), h = rand(130, 165);
  smudges.push({ popup: true, w, h, x: clamp(x ?? rand(w / 2 + 20, W - w / 2 - 20), w / 2, W - w / 2), y: clamp(y ?? rand(h / 2 + 70, H - h / 2 - 50), h / 2 + 62, H - h / 2),
    vx: rand(-55, 55), vy: rand(-40, 40), life: 16, max: 16, text: text || pick(POPUPS), left: Math.random() < .3, trap: Math.random() < .4,
    ok: pick(['OK', 'CLOSE', 'NO THANKS', 'LATER', 'GOT IT']), breed: rand(3, 5), born: T });
  sfx(rand(900, 1500), .07, 'square', .05); setTimeout(() => sfx(rand(500, 800), .1, 'square', .04), 70);
}
function closePopup(s, why) {
  if (s.life <= 0) return;
  s.life = 0; burst(s.x, s.y, BUG.adware.col, 10);
  if (why === 'trap') { // the OK button lied
    pop(s.x, s.y, 'NICE TRY', BUG.adware.col, 18);
    addPopup('ARE YOU SURE?', s.x - 60, s.y - 30); addPopup('ARE YOU REALLY SURE?', s.x + 60, s.y + 30);
  } else sfx(1800, .05, 'triangle', .04);
}
function closeOldestPopup() { const s = smudges.find(x => x.popup && x.life > 0); if (s) closePopup(s); }
function smear(n) {
  for (let i = 0; i < n; i++) {
    if (i % 3 === 2) { if (smudges.length < 20) smudges.push({ x: rand(140, W - 140), y: rand(110, H - 110), r: rand(70, 150), life: 7, max: 7, seed: Math.random() * 99 }); }
    else addPopup();
  }
  glitch = Math.max(glitch, .4);
}
