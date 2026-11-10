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
let shake = 0, flash = 0, flashCol = '255,97,89', hitstop = 0, glitch = 0, chroma = 0, slowmo = 0, myPing = 0;
// Time dilation (Sandevistan, Reflex Tuner): dil = real seconds left, dilK = world speed meanwhile, dilOff = cue when it ends.
let dil = 0, dilK = 1, dilOff = '', dilT0 = 0, ghosts = [];
let deaths = [], newUnlocks = []; // boss death sequences in progress (render.js) · skins unlocked by the last run
let nick = 'DEV' + (100 + Math.random() * 900 | 0), myDiff = 'normal', myAutoSkip = false, myMetaOnline = true, myColor = 0, best = 0, newBest = false;
try {
  nick = localStorage.getItem('coderot-nick') || nick;
  localStorage.removeItem('coderot-class'); // classes are gone (builds replaced them)
  myDiff = DIFFS[localStorage.getItem('coderot-diff')] ? localStorage.getItem('coderot-diff') : myDiff;
  myAutoSkip = localStorage.getItem('coderot-autoskip') === '1';
  myMetaOnline = localStorage.getItem('coderot-metaonline') !== '0';
  best = +localStorage.getItem('coderot-best') || 0;
} catch (_) {}
const dif = () => DIFFS[world.diff] || DIFFS.normal;

// Player settings (settings panel in main.js). Reduced-motion users start with shake and glitch off.
const SET_DEFAULT = { shake: true, flash: true, glitch: true, bloom: true, particles: true, numbers: true, music: true, volume: .8, mvol: .7 };
const SET = { ...SET_DEFAULT };
if (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) Object.assign(SET, { shake: false, glitch: false });
try { const s = JSON.parse(localStorage.getItem('coderot-settings') || '{}'); for (const k in SET_DEFAULT) if (typeof s[k] === typeof SET_DEFAULT[k]) SET[k] = s[k]; } catch (_) {}
const saveSettings = () => { try { localStorage.setItem('coderot-settings', JSON.stringify(SET)); } catch (_) {} };

// The authoritative world lives on the host (or locally in solo); clients mirror it from snapshots.
const world = { diff: 'normal', muts: [], autoskip: false, meta: true, sw: 0, phase: 'wait', wave: 0, run: 0, nk: 0, hl: 0, ht: '', nx: MW / 2, ny: MH / 2, bugs: [], pows: [], shots: [], dep: [], queue: [], spawnT: 0, breakT: 0, nid: 1, bm: 1 };
let hintT = -9; // last time a mechanic hint popped up
let rot = new Float32Array(NC), cleanedAt = new Float32Array(NC).fill(-9);
// The map is fixed (COLS x ROWS tiles, MW x MH px). The view is a camera over it: 720 tall, as many tiles wide as the screen's
// shape asks for (32 = 16:9 up to 48 = ultrawide). While a boss is alive the camera and every player stay inside ARENA.
const screenCols = () => { const r = C.getBoundingClientRect(); return clamp(Math.round(H * r.width / Math.max(1, r.height) / CELL), 32, 48); };
function setView(cols) {
  cols = clamp(cols | 0, 32, 48); if (cols * CELL === W) return false;
  W = cols * CELL; resize(); mkLayers(); placeTouch(); return true;
}
const cam = { x: (MW - W) / 2, y: (MH - H) / 2 };
const bounds = () => (mode === 'game' && bossAlive() ? ARENA : { x: 0, y: 0, w: MW, h: MH }); // where players (and the camera) can be
const inView = (x, y, m = 0) => x > cam.x - m && x < cam.x + W + m && y > cam.y - m && y < cam.y + H + m;
const popS = (x, y, text, col, size) => pop(cam.x + x, cam.y + y, text, col, size); // a pop at a screen position
function camTick(dt, snap) { // follow your ship (menu: the middle of the map), never showing past the edge of the bounds
  const B = bounds(), play = mode === 'game' && world.run, fx = play ? me.x : MW / 2, fy = play ? me.y : MH / 2;
  const fit = (lo, len, view, f) => (len <= view ? lo + (len - view) / 2 : clamp(f - view / 2, lo, lo + len - view));
  const k = snap ? 1 : Math.min(1, dt * 7);
  cam.x += (fit(B.x, B.w, W, fx) - cam.x) * k; cam.y += (fit(B.y, B.h, H, fy) - cam.y) * k;
}
const seen = { run: 0, wave: 0, nk: 0, hl: 0, sw: 0, bk: 0, cleared: false, phase: 'wait' };
const others = new Map();  // remote players by peer id
const gone = new Map();    // ids this client already removed locally, so a stale snapshot doesn't resurrect them
let isHost = true, rotFrac = 0;
let pend = { h: new Map(), c: new Set(), e: [] }; // client actions waiting to be sent to the host

let bullets = [], parts = [], rings = [], pops = [], smudges = [], turrets = [], minions = [], beacons = [], uiButtons = [], kbFocus = 0; // kbFocus: keyboard-selected canvas button

const UP0 = () => Object.fromEntries(Object.keys(UPG).map(k => [k, 0]));
// ---------- your build: level (from XP), attributes, perks, weapon, skill + super ----------
function lvInfo(xp = META.xp) { // level, XP into it, XP for the next
  let lv = 1; while (lv < BAL.xp.cap && xp >= xpNeed(lv)) { xp -= xpNeed(lv); lv++; }
  return { lv, into: xp, need: lv < BAL.xp.cap ? xpNeed(lv) : 0 };
}
const myLv = () => lvInfo().lv;
const attrOf = a => META.at[a] || BAL.attr.start;
const attrSpent = () => AK.reduce((n, a) => n + attrOf(a) - BAL.attr.start, 0);
const perkSpent = () => Object.keys(META.pk).reduce((n, k) => n + (PERK[k] && !PERK[k].free ? META.pk[k] : 0), 0);
const attrPts = (lv = myLv()) => (lv - 1) * BAL.attr.perLv - attrSpent();
const perkPts = (lv = myLv()) => (lv - 1) * BAL.attr.perkPerLv + Math.floor(lv / BAL.attr.perkBonus) - perkSpent();
const abOwns = id => !!ABIL[id] && (ABIL[id].free || (META.pk[id] || 0) >= 1);
const wpOwns = id => !!WEAPONS[id] && (!WEAPONS[id].cost || (META.wp.own[id] || 0) >= 1);
const respecCost = () => BAL.attr.respec[0] + BAL.attr.respec[1] * myLv();
function build(on = world.meta !== false) { // what a run starts with. on = false (a room whose host turned progression off): base stats
  const at = {}, cp = {}, S = BAL.stat;
  for (const a of AK) at[a] = on ? clamp(attrOf(a), BAL.attr.start, BAL.attr.max) : BAL.attr.start;
  for (const k in PERK) if (PERK[k].free || (on && META.pk[k])) cp[k] = PERK[k].free ? 1 : Math.min(PERK[k].max, META.pk[k]);
  const wp = wpOwns(META.wp.eq) ? META.wp.eq : 'pulse', mk = on ? clamp(META.wp.own[wp] || 1, 1, BAL.wpn.mkMax) : 1; // weapon + abilities always yours
  const sk = abOwns(META.ab.skill) ? META.ab.skill : 'breakpoint', su = abOwns(META.ab.sup) ? META.ab.sup : 'halt';
  const d = a => at[a] - BAL.attr.start;
  const pk = { hp: Math.floor(d('body') / S.body.hpEvery), speed: S.reflex.speed * d('reflex'), dash: S.reflex.dash * d('reflex'),
    ram: Math.floor(d('net') / S.net.ramEvery), hack: S.net.hack * d('net'), crit: S.focus.crit * d('focus'), sup: S.focus.sup * d('focus') };
  for (const k in cp) for (const s in PERK[k].mod || {}) pk[s] = (pk[s] || 0) + PERK[k].mod[s] * cp[k]; // perk mods, read through cwMod
  return { at, cp, pk, wp, mk, sk, su, wdmg: 1 + S.weapon * d(WEAPONS[wp].attr) + BAL.wpn.mkDmg * (mk - 1), summ: 1 + S.tech.summon * d('tech') + (pk.summ || 0) }; // summ: TECH + turret perks
}
function mkMe() {
  const on = world.meta !== false, B = build(on), cp = B.cp, eq = on ? { ...META.cw.eq } : {}, hp = BAL.player.hp + B.pk.hp + cwModOf(eq, 'hp');
  return { wp: B.wp, mk: B.mk, ab: { skill: B.sk, sup: B.su }, at: B.at, wdmg: B.wdmg, summ: B.summ, lv: on ? myLv() : 1,
    x: MW / 2 + rand(-80, 80), y: MH / 2 + rand(-50, 50), vx: 0, vy: 0, fx: 1, fy: 0, a: 0, hp, mh: hp,
    cd: 0, dashT: 0, dashCd: 0, inv: 1.5, hist: [], debt: 0, healT: 3, edge: false, door: null, watch: null, route: null, down: false, rev: 0, score: 0, chain: 0, chainT: 0, pw: {}, trail: [], sup: 25 * (cp.warm || 0), superT: 0, superMax: 6, supK: '', noCharge: 0,
    up: UP0(), syn: {}, picks: cp.head || 0, rerolls: cp.reroll || 0, offer: null, firing: false, duckCd: 0, skillCd: 0, stress: 0, t: 0, kills: 0, bosses: 0,
    cw: eq, osCd: 0, osT: 0, heartUsed: false, bioW: -1, latW: -1, panW: -1, cwT: {}, wire: null,
    ram: 99, scan: false, scanLock: false, scanP: 0, qq: [], marks: new Map(), dots: [], wakes: [], arcs: [], supUses: 0, // netdeck RAM (clamped to max on the first tick), quickhack state
    hk: on ? (META.cw.qh.length ? META.cw.qh : QHK).filter(qOwns) : QHK.filter(k => !QH[k].cost), // the quickhacks slotted in the deck
    pk: B.pk, cp };
}

// Lifetime stats per difficulty, keyed 'normal'. Sandbox runs never count.
let STATS = {};
try { STATS = JSON.parse(localStorage.getItem('coderot-stats') || '{}') || {}; } catch (_) {}
const statOf = diff => STATS[diff] || { best: 0, wave: 0, runs: 0, kills: 0, bosses: 0 };
for (const k of Object.keys(STATS)) if (k.includes('/')) { // old saves were per class ('qa/normal'): merge them per difficulty
  const d = k.split('/')[1], o = STATS[k], n = statOf(d); delete STATS[k];
  if (DIFFS[d] && o) STATS[d] = { best: Math.max(n.best, o.best | 0), wave: Math.max(n.wave, o.wave | 0), runs: n.runs + (o.runs | 0), kills: n.kills + (o.kills | 0), bosses: n.bosses + (o.bosses | 0) };
}
function lifetime() { // totals for skin unlocks
  const t = { bosses: 0, kills: 0, wave: 0, nightmare: 0 };
  for (const k in STATS) { const s = STATS[k]; t.bosses += s.bosses; t.kills += s.kills; t.wave = Math.max(t.wave, s.wave); if (k === 'nightmare') t.nightmare = Math.max(t.nightmare, s.wave); }
  return t;
}
const unlocked = () => { const t = lifetime(); return SKINS.filter(s => s.ok(t)).map(s => s.id); };
let mySkin = 'none', myMuts = [];
try { mySkin = localStorage.getItem('coderot-skin') || 'none'; myMuts = JSON.parse(localStorage.getItem('coderot-muts') || '[]').filter(k => MUTS[k]); } catch (_) {}
const mut = k => world.muts.includes(k);
const mutScore = () => world.muts.reduce((m, k) => m * MUTS[k].score, 1);
function recordRun() {
  const s = statOf(world.diff);
  STATS[world.diff] = { best: Math.max(s.best, me.score | 0), wave: Math.max(s.wave, world.wave), runs: s.runs + 1, kills: s.kills + me.kills, bosses: s.bosses + me.bosses };
  try { localStorage.setItem('coderot-stats', JSON.stringify(STATS)); } catch (_) {}
  saveMeta(); // bytes + XP were banked live (earn); this just writes them
}
// BYTES: the currency, earned live during real runs (kills, wave clears, bosses, data stashes: earn), spent in CHARACTER and the clinic.
let bytes = 0, runBytes = 0, runXp = 0, runDrops = [];
try {
  const c = localStorage.getItem('coderot-bytes'), old = localStorage.getItem('coderot-creds') ?? localStorage.getItem('coderot-commits'); // earlier names: creds, commits
  bytes = Math.max(0, Math.floor(+(c ?? old) || 0));
  if (c == null && old != null) { localStorage.setItem('coderot-bytes', bytes); localStorage.removeItem('coderot-creds'); localStorage.removeItem('coderot-commits'); }
} catch (_) {}

// Progression save: XP, attributes, perk levels, equipped skill + super, weapons (MK per owned weapon), legendary blueprints,
// capacity shards, cyberware. Old class saves (cls / lv / perk / alt / eq) are dropped on load.
let META = { xp: 0, at: {}, pk: {}, ab: { skill: 'breakpoint', sup: 'halt' }, wp: { own: { pulse: 1 }, eq: 'pulse' }, bp: [], shards: 0,
  cw: { own: [], eq: { os: 'sandy' }, qh: [], qown: [] } };
const CW_OLD = { cortex: 'cpu', ocular: 'optics', circ: 'power', skel: 'frame', legs: 'drive' }; // sockets before the chassis rework
try {
  const s = JSON.parse(localStorage.getItem('coderot-meta') || '{}') || {}, obj = v => v && typeof v === 'object';
  META.xp = Math.max(0, num(s.xp));
  if (obj(s.at)) for (const a of AK) if (s.at[a] != null) META.at[a] = clamp(num(s.at[a], 3) | 0, BAL.attr.start, BAL.attr.max);
  if (obj(s.pk)) for (const k in s.pk) if (PERK[k] && !PERK[k].free) META.pk[k] = clamp(num(s.pk[k]) | 0, 0, PERK[k].max);
  if (obj(s.ab)) for (const k of ['skill', 'sup']) if (ABIL[s.ab[k]] && ABIL[s.ab[k]].k === k) META.ab[k] = s.ab[k];
  if (obj(s.wp) && obj(s.wp.own)) { for (const k in s.wp.own) if (WEAPONS[k]) META.wp.own[k] = clamp(num(s.wp.own[k]) | 0, 0, BAL.wpn.mkMax); if (WEAPONS[s.wp.eq]) META.wp.eq = s.wp.eq; }
  META.wp.own.pulse = Math.max(1, META.wp.own.pulse || 0);
  if (Array.isArray(s.bp)) META.bp = s.bp.filter(k => CW[k] && CW[k].bp);
  META.shards = clamp(num(s.shards) | 0, 0, BAL.cw.shardMax);
  const qs = a => (Array.isArray(a) ? a.filter(k => QH[k]) : []);
  if (s.cw && Array.isArray(s.cw.own) && s.cw.eq && typeof s.cw.eq === 'object') META.cw = { own: s.cw.own.filter(k => CW[k]), eq: s.cw.eq, qh: qs(s.cw.qh), qown: qs(s.cw.qown) };
} catch (_) {}
if (attrPts() < 0) META.at = {}; // spent more than the level allows (an edited save): refund
if (perkPts() < 0) META.pk = {};
const saveMeta = () => { try { localStorage.setItem('coderot-meta', JSON.stringify(META)); localStorage.setItem('coderot-bytes', Math.floor(bytes)); } catch (_) {} };
// bytes + XP from play. Sandbox never pays; difficulty scales both, BOSS RUSH cuts both (every wave is a boss there).
function earn(c, xp, x, y, label) {
  if (adminMode || mode !== 'game' || world.phase !== 'play') return;
  const m = (BAL.eco.diff[world.diff] || 1) * (mut('rush') ? BAL.eco.rush : 1), before = myLv();
  c *= m; xp *= m; bytes += c; runBytes += c; runXp += xp; META.xp += xp;
  if (label) pop(x, y, label + ' +' + fmt(c) + ' ¤', PAL.gold, 15);
  const now = myLv();
  if (now > before) {
    banner = { t: 2.8, big: 'LEVEL ' + now, sub: '+' + (perkPts(now) - perkPts(before)) + ' PERK · +' + (attrPts(now) - attrPts(before)) + ' ATTRIBUTE' };
    ring(me.x, me.y, 10, 600, .6, PAL.gold, 6); cue('perkmax'); saveMeta();
  }
}
const cwOwns = id => !CW[id].cost || META.cw.own.includes(id);
const qOwns = k => !!QH[k] && (!QH[k].cost || META.cw.qown.includes(k));
for (const sl in META.cw.eq) { // migrate old socket names, then drop anything that doesn't fit, isn't owned, or is installed twice
  const id = META.cw.eq[sl], D = CW[id]; delete META.cw.eq[sl];
  if (!D || !cwOwns(id) || Object.values(META.cw.eq).includes(id)) continue;
  const want = SOCKETS.includes(sl) && sockCat(sl) === D.slot ? sl : SOCKETS.find(k => sockCat(k) === D.slot && !META.cw.eq[k]);
  if (want && !META.cw.eq[want]) META.cw.eq[want] = id;
}
const cwLoad = (eq = META.cw.eq) => Object.values(eq).reduce((n, id) => n + CW[id].cap, 0);
const cwCap = () => Math.floor(BAL.cw.capBase + BAL.cw.capPerLv * (myLv() - 1) + BAL.stat.tech.cap * (attrOf('tech') - BAL.attr.start) + BAL.cw.shard * META.shards);
const cwBuyable = id => !CW[id].bp || META.bp.includes(id) || cwOwns(id); // legendaries need a blueprint from a boss
function cwValidate() { // after a load or a respec: uninstall what your level or capacity no longer allows (you keep owning it)
  for (const s of Object.keys(META.cw.eq)) if (CW[META.cw.eq[s]].lv > myLv()) delete META.cw.eq[s];
  const order = SOCKETS.filter(s => META.cw.eq[s] && s !== 'os').reverse();
  while (cwLoad() > cwCap() && order.length) delete META.cw.eq[order.shift()];
  if (cwLoad() > cwCap()) META.cw.eq = { os: 'sandy' };
  if (!META.cw.eq.os && cwLoad() + CW.sandy.cap <= cwCap()) META.cw.eq.os = 'sandy'; // a kernel you can no longer run: back to the starter
}
cwValidate();
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
  if (mode === 'game' && hasCw('popblock') && Math.random() < .5) return; // POPUP BLOCKER
  const w = rand(250, 330), h = rand(130, 165);
  smudges.push({ popup: true, w, h, x: clamp(x ?? rand(w / 2 + 20, W - w / 2 - 20), w / 2, W - w / 2), y: clamp(y ?? rand(h / 2 + 70, H - h / 2 - 50), h / 2 + 62, H - h / 2),
    vx: rand(-55, 55), vy: rand(-40, 40), life: 16, max: 16, text: text || pick(POPUPS), left: Math.random() < .3, trap: Math.random() < .4,
    ok: pick(['OK', 'CLOSE', 'NO THANKS', 'LATER', 'GOT IT']), breed: rand(3, 5), born: T });
  cue('popup', 1, rand(.9, 1.15), .05);
}
function closePopup(s, why) {
  if (s.life <= 0) return;
  s.life = 0; burst(s.x, s.y, BUG.adware.col, 10);
  if (why === 'trap') { // the OK button lied
    pop(s.x, s.y, 'NICE TRY', BUG.adware.col, 18);
    addPopup('ARE YOU SURE?', s.x - 60, s.y - 30); addPopup('ARE YOU REALLY SURE?', s.x + 60, s.y + 30);
  } else cue('close', .8);
}
function closeOldestPopup() { const s = smudges.find(x => x.popup && x.life > 0); if (s) closePopup(s); }
function smear(n) {
  for (let i = 0; i < n; i++) {
    if (i % 3 === 2) { if (smudges.length < 20) smudges.push({ x: rand(140, W - 140), y: rand(110, H - 110), r: rand(70, 150), life: 7, max: 7, seed: Math.random() * 99 }); }
    else addPopup();
  }
  glitch = Math.max(glitch, .4);
}
