'use strict';
// Constants, helpers and data tables. Loaded first; every other script reads these globals.

// ======================= BALANCE: every progression, economy, map and aim number lives here =======================
// Cyberware, quickhack and weapon prices further down are base values; the multipliers here are applied to them at load.
const BAL = {
  // ---- economy. Bytes (¤) come from play, never from score, so combo chains and score mutators can't be farmed ----
  eco: {
    kill: .01,      // bytes per enemy point value (BUG.pts): a BUG pays 1, a ZOMBIE PROCESS 10. Spawned children (fork splits,
                    // core-dump splits, rot-bred bugs, zombie spawn, boss summons) pay nothing
    wave: 6,        // per wave cleared, x the wave number (a skipped wave pays nothing)
    boss: 140,      // per boss kill, x the boss tier (wave / 5)
    stash: [14, 2.5], // DATA STASH on the map: base + per wave
    rush: .35,      // BOSS RUSH: every payout x this (every wave is a boss there)
    diff: { easy: .7, normal: 1, hard: 1.35, nightmare: 1.75 }},
  price: 2, // flat multiplier on every shop price: cyberware, quickhacks, weapon unlocks, MK upgrades (maxing everything: ~119k bytes at 1, ~238k at 2)
  // ---- player level. XP to go from level n to n+1 = base * n^exp ----
  xp: { kill: .06, wave: 25, boss: 300, stash: [12, 2], base: 220, exp: 1.6, cap: 30 }, // level 30 = ~561k XP
  // ---- attributes + perks. Points per level up; perkBonus = 1 extra perk point every N levels; respec = bytes base + per level ----
  attr: { start: 3, max: 20, perLv: 1, perkPerLv: 2, perkBonus: 5, respec: [250, 60] }, // 180 perk nodes: 2 points a level (~64 by 30) fills about a third
  stat: { // what each attribute point above the start value gives
    body: { hpEvery: 5 },                 // CHASSIS: +1 max HP per 5 points
    reflex: { speed: .012, dash: .015 },  // REFLEX: +1.2% move speed, -1.5% dash cooldown
    tech: { cap: 1.5, summon: .04 },      // TECH: +1.5 cyberware capacity, +4% turret / container / drone damage
    net: { ramEvery: 2, hack: .03 },      // NETRUN: +1 netdeck RAM per 2 points, +3% quickhack damage
    focus: { crit: .01, sup: .02 },       // FOCUS: +1% crit chance, +2% super charge
    weapon: .03 },                        // every weapon: +3% damage per point of its own attribute
  // ---- cyberware: capacity grows with level, TECH and boss-dropped capacity shards; tiers are gated by level, price and blueprints ----
  cw: { capBase: 8, capPerLv: 1, shard: 3, shardMax: 5, costMul: 10,
    tierMul: { common: 1, uncommon: 1, rare: 1.5, epic: 2.5, legendary: 4 },  // price = base cost x costMul x tierMul
    tierLv: { common: 1, uncommon: 3, rare: 8, epic: 14, legendary: 20 },    // player level needed to install
    bpChance: .35, shardChance: .3 }, // per boss kill: legendary blueprint (legendaries can't be bought without one) / capacity shard
  qh: { costMul: 10 }, // quickhack price = base cost x this; level + NETRUN needs are in QH
  // ---- weapons: unlock price + level in WEAPONS; MK.2-MK.4 upgrades cost mkCost[mk] bytes and need level mkLv[mk] ----
  wpn: { mkMax: 4, mkDmg: .2, mkCost: [0, 0, 900, 2600, 6500], mkLv: [0, 0, 6, 12, 18] },
  // ---- map: the world is cols x rows tiles; bosses fight in a locked arena in the middle ----
  map: { cols: 56, rows: 26, arena: [1600, 720], count: 1.6, spawn: 1.6, maxBugs: 140, maxBugsOnline: 110,
    aggro: 1100, hunt: 10, pips: 5, // bugs chase you inside aggro px; once a wave is down to its last hunt bugs, all of them come for you; the last pips get edge markers
    stashes: 3, stashLife: 80,
    rotSpread: .6, rotBreed: .2, idleRot: .1 }, // rot spreads + breeds bugs slower per tile than on the old one-screen arena (more map nobody is watching); idle = bugs out of aggro rot at this share
  // ---- the ship: base stats every build starts from ----
  player: { hp: 3, speed: 270, dashCd: .8 },
  // ---- aim: SMARTCURVE lock zone (the auto-aim area) = zone + zoneStep x ZONE level: 90 / 110 / 130 px (was 90 / 135 / 180) ----
  smart: { zone: 90, zoneStep: 20, accBase: .3, accStep: .15, maxLv: 4 }}; // accuracy = accBase + accStep x level (45..90%)

const CELL = 40, ROT_LIMIT = .6;
const COLS = BAL.map.cols, ROWS = BAL.map.rows, NC = COLS * ROWS, MW = COLS * CELL, MH = ROWS * CELL; // the world (rot grid)
const ARENA = { w: BAL.map.arena[0], h: BAL.map.arena[1], x: (MW - BAL.map.arena[0]) / 2, y: (MH - BAL.map.arena[1]) / 2 };
const H = 720; let W = 32 * CELL; // the view (camera): 720 tall, widens to fill wide screens (setView in state.js)
// Colours come from the cyberpunk-ui tokens: red = default ink + enemies, cyan = you / interactive, amber = goals + currency, green = positive.
const PAL = { bg: '#0B0F17', rot: '#FF3E34', gold: '#FFD741', white: '#EDE7E6', dim: '#9BB8B8', red: '#FF6159', ice: '#52DDDF', cyan: '#5EF6FF', green: '#1DED83',
  label: '#DF4A42', line: '#349197', panel: '#0E0E17', teal: '#4CA39A', purple: '#C583FF', orange: '#F86A32', acid: '#DFFF5E', hot: '#28FFFF' };
const PCOL = ['#5EF6FF', '#C583FF', '#FFD741', '#1DED83', '#64A1FF', '#EFA248', '#EDE7E6', '#00FFD5'];
const DISP = 'CoderotBytes, Rajdhani, "Arial Narrow", sans-serif', MONO = 'CoderotBytes, "Share Tech Mono", Consolas, monospace'; // CoderotBytes only draws ¤ (the BYTES mark, style.css)

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => Math.floor(n).toLocaleString('en-US');
const num = (v, d = 0) => Number.isFinite(+v) ? +v : d;
const pick = a => a[Math.random() * a.length | 0];
const hash = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// The arena: each row is a line of code, each cell a tile that can rot.
// LINES is the fallback; once the game's own source loads (main.js), every wave shows a different real snippet.
const LINES = [
  "import { hope } from './past';", '// TODO: fix before launch 2019', 'const bugs = new Set(legacy);', '',
  'export async function deploy() {', '  if (friday && !tests.pass) {', '    await ship({ force: true });', '  }',
  '  while (bugs.size) {', '    bugs.add(bugs.clone());', '  }', '  try { segfault(); }',
  '  catch { /* works on mine */ }', '  return spaghetti(prod);', '}', '',
  '// do NOT touch. load-bearing', 'export default coderot;'];
const CH = [];
let codeLabel = 'coderot.js';
const PANE = COLS / 2; // the map is a split editor: two panes side by side, each with its own line-number gutter
function setCode(lines, firstLine = 1, label = 'coderot.js') { // lines: up to 2 x ROWS strings (left pane, then right pane)
  codeLabel = label; CH.length = 0;
  const row = (i) => (String(firstLine + i).padStart(3, ' ').slice(-3) + ' ' + (lines[i] || '')).padEnd(PANE).slice(0, PANE);
  for (let r = 0; r < ROWS; r++) { const s = row(r) + row(r + ROWS); for (let c = 0; c < COLS; c++) CH.push(s[c]); }
}
setCode(LINES);
const GL = '#%&@$!?¥§▓▒░¿~', BITS = '{}()<>;=/*&|!01';

// Enemies. rot = how fast they rot the tile under them; charge = super meter gained per kill.
const BUG = {
  crawl: { name: 'BUG', r: 14, hp: 2, sp: 85, pts: 100, col: '#FF6159', rot: 1.6, charge: 3 },
  zip: { name: 'GLITCH', r: 10, hp: 1, sp: 200, pts: 150, col: '#DFFF5E', rot: 1.0, charge: 4 },
  fork: { name: 'FORK BOMB', r: 13, hp: 2, sp: 115, pts: 120, col: '#F47949', rot: 1.2, charge: 3 },
  forklet: { name: 'FORK', r: 8, hp: 1, sp: 160, pts: 40, col: '#F47949', rot: .8, charge: 1 },
  adware: { name: 'ADWARE', r: 16, hp: 4, sp: 80, pts: 300, col: '#FF2A4F', rot: 1.2, charge: 6 },
  leak: { name: 'MEMORY LEAK', r: 18, hp: 6, sp: 42, pts: 250, col: '#2570D4', rot: 3, charge: 6 },
  trojan: { name: 'TROJAN', r: 13, hp: 3, sp: 270, pts: 350, col: '#FFD741', rot: 1, charge: 6 },
  seg: { name: 'SEGFAULT', r: 28, hp: 14, sp: 50, pts: 600, col: '#FF3E34', rot: 2.6, charge: 15 },
  // Late-game elites (world.js). lock: a pair spinning a damaging beam between them (aux = partner id); kill both within 1.5s
  // or the dead one restarts. cache: phases out (untouchable) and jumps to a marked tile (aux = cell + 1), then flushes a ring of shots.
  // zombie: tanky, heals on rot, spits orphan processes; first death leaves a grave (aux > 0 = timer) that rises unless its tile is cleaned.
  lock: { name: 'DEADLOCK', r: 18, hp: 10, sp: 70, pts: 900, col: '#F86A32', rot: 1.2, charge: 10 },
  cache: { name: 'CACHE MISS', r: 17, hp: 9, sp: 55, pts: 800, col: '#78ADFF', rot: 1, charge: 9 },
  zombie: { name: 'ZOMBIE PROCESS', r: 22, hp: 20, sp: 42, pts: 1000, col: '#2E9C64', rot: 2, charge: 12 },
  boss: { name: 'BOSS', r: 62, hp: 300, sp: 40, pts: 5000, col: '#FF3E34', rot: 4, charge: 60 },
  // Boss parts: positioned by their boss (bosses.js), never chase on their own. pid = parent boss id.
  // immortal = can't be hurt (blocks bullets), fwd = passes damage to its boss, ghost = bullets pass through, noTouch = no contact damage.
  pillar: { name: 'DEPENDENCY', r: 17, hp: 12, sp: 0, pts: 250, col: '#F47949', rot: 0, charge: 4, part: true, noTouch: true },
  qr: { name: 'QR CODE', r: 28, hp: 1e9, sp: 0, pts: 0, col: '#EDE7E6', rot: 0, charge: 0, part: true, immortal: true, fwd: true, noTouch: true },
  arm: { name: 'NOODLE', r: 14, hp: 5, sp: 0, pts: 150, col: '#FFD741', rot: 0, charge: 3, part: true, noTouch: true },
  body: { name: 'LOOP BODY', r: 13, hp: 1e9, sp: 0, pts: 0, col: '#1DED83', rot: 0, charge: 0, part: true, immortal: true },
  pod: { name: 'CI POD', r: 15, hp: 14, sp: 0, pts: 300, col: '#FF3E34', rot: 0, charge: 5, part: true, noTouch: true },
  holo: { name: 'DECOY', r: 44, hp: 1e9, sp: 0, pts: 0, col: '#FF3E34', rot: 0, charge: 0, part: true, immortal: true, ghost: true, noTouch: true }};
const BT = Object.keys(BUG);
// One boss every 5 waves, in this order, then repeating with more HP. ai picks the brain in bosses.js;
// sides = outline polygon for the classic look (0 = noodle blob); r = hit radius.
const BOSSES = [
  { name: 'THE MONOLITH', ai: 'monolith', col: '#F86A32', sides: 6, r: 62, desc: 'shielded until you break its 3 pillars' },
  { name: 'LEGACY KERNEL', ai: 'kernel', col: '#9D2BF5', sides: 0, r: 66, desc: 'deprecated tiles burn · keep moving' },
  { name: 'SPAGHETTI PRIME', ai: 'spaghetti', col: '#FFD741', sides: 0, r: 58, desc: 'noodle arms grab you · dash free, cut 3 to stun' },
  { name: 'BLUE SCREEN', ai: 'bsod', col: '#2570D4', sides: 0, r: 70, desc: 'only the QR code takes damage · stop the reboot' },
  { name: 'INFINITE LOOP', ai: 'loop', col: '#1DED83', sides: 0, r: 24, desc: 'only the head takes damage · the body is a wall' },
  { name: 'THE FINAL DEPLOY', ai: 'deploy', col: '#FF3E34', sides: 0, r: 46, desc: 'break 4 CI pods before T-0 · beware decoys' }];
const SHOTS = ['orb', 'ad']; // enemy projectile kinds; 'ad' smears your screen
const POPUPS = ['YOU WON A FREE IPHONE', 'DOWNLOAD MORE RAM?', '37 VIRUSES FOUND', 'UPDATE JAVA NOW', 'HOT BUGS IN YOUR AREA',
  'CLICK TO DEBUG', 'npm WARN deprecated', 'core dumped', 'ARE YOU STILL THERE?', 'ACCEPT ALL COOKIES',
  'RATE US 5 STARS', 'TURN ON NOTIFICATIONS?', 'YOUR TRIAL HAS EXPIRED', 'RESTART TO UPDATE', 'SUBSCRIBE FOR MORE BUGS',
  'CONGRATS! YOU ARE VISITOR 1000000', 'ALLOW LOCATION ACCESS?', 'NEW SIGN-IN FROM PROD'];

const POW = {
  sudo: { col: PAL.gold, label: 'SUDO', tip: '+2 shots' },
  coffee: { col: '#C583FF', label: 'COFFEE', tip: '2x fire rate' },
  revert: { col: PAL.white, label: 'GIT REVERT', tip: 'area wipe' },
  patch: { col: '#1DED83', label: 'HOTFIX', tip: '+1 HP' },
  firewall: { col: '#64A1FF', label: 'FIREWALL', tip: 'shield' },
  duck: { col: '#FFFF4E', label: 'RUBBER DUCK', tip: 'turret buddy' },
  cell: { col: '#00FFD5', label: 'SUPER CELL', tip: '+30 super' },
  adblock: { col: '#1DED83', label: 'ADBLOCK', tip: 'clears screen gunk' },
  stash: { col: PAL.gold, label: 'DATA STASH', tip: '¤ bytes + XP' }}; // placed around the map each wave (BAL.map.stashes), never dropped
const PT = Object.keys(POW), PT_DROP = PT.filter(k => k !== 'stash');

const UPG = {
  fire: ['OVERCLOCK', '+20% fire rate'], shots: ['WIDE DIFF', '+1 projectile'], pierce: ['GREP -R', 'shots pierce +1 bug'],
  dmg: ['STRICT MODE', '+30% damage'], speed: ['HOT RELOAD', '+12% move speed'], clean: ['GARBAGE COLLECTOR', 'shots clean wider'],
  hp: ['UNIT TESTS', '+1 max HP, full heal'], bounce: ['RECURSION', 'shots bounce off walls'], homing: ['SMARTCURVE', '+15% smart lock-on chance'], zone: ['SMARTCURVE ZONE', 'bigger smart-lock zone'],
  orbit: ['DAEMON THREAD', '+1 orbiting drone'], dash: ['CTRL+Z', '-25% dash cooldown'], battery: ['FISSION CORE', 'faster super charge'],
  skill: ['HOTKEYS', '-20% skill cooldown'], range: ['LONG POLLING', '+30% shot range']};
// Hard caps for every build, so late game stays readable and still dangerous. A weapon's caps (WEAPONS.caps) can only go lower.
const UPG_MAX = { fire: 5, shots: 3, pierce: 4, dmg: 5, speed: 4, clean: 3, hp: 4, bounce: 2, homing: 4, zone: 2, orbit: 3, dash: 3, battery: 4, skill: 3, range: 3 };
const UPG_RARE = { homing: .7, zone: .7 }; // offer weight (1 = normal): the smart-gun upgrades turn up less often
// Synergies: own both upgrades at LV 2+ to unlock a bonus. Effects live in player.js (me.syn[key]).
const SYN = {
  tail: { name: 'TAIL CALL', desc: 'bounced shots deal +50% damage', need: ['bounce', 'homing'] },
  cron: { name: 'CRON JOB', desc: 'drones hit 2x and clean wider', need: ['orbit', 'clean'] },
  types: { name: 'TYPE CHECKER', desc: 'each pierced bug adds +25% damage', need: ['pierce', 'dmg'] },
  speedrun: { name: 'SPEEDRUN', desc: 'dashing shreds bugs you pass through', need: ['speed', 'dash'] },
  macro: { name: 'MACRO', desc: 'skills refund 12% super', need: ['skill', 'battery'] },
  lsp: { name: 'LANGUAGE SERVER', desc: 'smart-lock zone twice as big', need: ['homing', 'range'] }};
const SYN_LV = 2;
const SUPER_GAIN = [0, .10, .15, .20, .25]; // FISSION CORE bonus by level

// ---------- builds: no classes. Level up with XP, spend attribute points, unlock perks per attribute, equip any weapon ----------
// What each attribute point does is in BAL.stat; the CHARACTER screen (main.js) shows it from there.
const ATTR = {
  body: { name: 'CHASSIS', desc: 'Hull integrity. Max HP, close range, spread weapons, soaking hits.' },
  reflex: { name: 'REFLEX', desc: 'Speed and dash. Rapid-fire weapons and mobility tricks.' },
  tech: { name: 'TECH', desc: 'Cyberware capacity. Turrets, containers and ricochet tech.' },
  net: { name: 'NETRUN', desc: 'RAM and quickhacks. Smart weapons and network-wide supers.' },
  focus: { name: 'FOCUS', desc: 'Crits and super charge. Rails, precision and time control.' }};
const AK = Object.keys(ATTR);
// Weapons: inventory items anyone can equip (CHARACTER > INVENTORY). attr = the attribute that boosts it (BAL.stat.weapon per point)
// and the perks built around it. cost / lv = unlock price + level; MK upgrades in BAL.wpn. fire = seconds between shots,
// life = bullet lifetime, caps = lower in-run upgrade caps for this gun, sfx = shot sound, shape = ship outline (SHAPES).
const WEAPONS = {
  pulse: { name: 'PULSE BLASTER', attr: 'reflex', cost: 0, lv: 1, desc: 'Steady all-rounder.', shape: 'pulse', sfx: 'shot_debugger',
    fire: .14, dmg: 1, shots: 1, spread: .13, bspeed: 860, life: .8, pierce: 0, clean: .6 },
  needle: { name: 'NEEDLE SMG', attr: 'reflex', cost: 700, lv: 4, desc: 'Very fast, light hits.', shape: 'needle', sfx: 'shot_hacker', gap: .05,
    fire: .075, dmg: .6, shots: 1, spread: .08, bspeed: 980, life: .6, pierce: 0, clean: .4 },
  scatter: { name: 'SCATTER CANNON', attr: 'body', cost: 900, lv: 5, desc: '6-pellet shotgun. Brutal up close, short reach, heavy kick.', shape: 'scatter', sfx: 'shot_refactorer',
    fire: .42, dmg: 1, shots: 6, spread: .11, bspeed: 760, life: .38, pierce: 0, clean: 1, jitter: true, heavy: true, kick: 140, shake: 5, caps: { fire: 2, shots: 1 } },
  carbine: { name: 'RICOCHET CARBINE', attr: 'tech', cost: 900, lv: 6, desc: 'Tech rounds that bounce off the screen edge once.', shape: 'carbine', sfx: 'shot_sysadmin',
    fire: .16, dmg: 1, shots: 1, spread: .1, bspeed: 860, life: .9, pierce: 0, bounce: 1, clean: .6 },
  smart: { name: 'SMART SPRAYER', attr: 'net', cost: 1200, lv: 8, desc: 'Built-in SMARTCURVE (2 levels): shots curve into bugs in the lock zone.', shape: 'smart', sfx: 'shot_devops',
    fire: .2, dmg: .8, shots: 1, spread: .1, bspeed: 820, life: .9, pierce: 0, clean: .6, smart: 2 },
  rail: { name: 'RAIL LANCE', attr: 'focus', cost: 1500, lv: 10, desc: 'Slow railgun that pierces 3 bugs.', shape: 'rail', sfx: 'shot_qa',
    fire: .45, dmg: 4, shots: 1, spread: 0, bspeed: 1500, life: .9, pierce: 3, clean: .8, rail: true, heavy: true, kick: 110, shake: 4, caps: { fire: 2 } }};
const WK = Object.keys(WEAPONS);
const upgCap = (wp, k) => Math.min(UPG_MAX[k] || 99, ((WEAPONS[wp] || {}).caps || {})[k] || 99);
const SHAPES = { // ship outlines by weapon, nose pointing +x
  pulse: [[21, 0], [-12, -14], [-5, 0], [-12, 14]],
  scatter: [[18, -9], [18, 9], [-12, 16], [-6, 0], [-12, -16]],
  needle: [[27, 0], [-10, -9], [-4, 0], [-10, 9]],
  carbine: [[20, 0], [5, -14], [-12, -10], [-6, 0], [-12, 10], [5, 14]],
  rail: [[29, 0], [2, -5], [-10, -14], [-6, 0], [-10, 14], [2, 5]],
  smart: [[18, -8], [18, 8], [6, 14], [-12, 10], [-6, 0], [-12, -10], [6, -14]]};
// Skills (E) and supers (Q): unlocked by the ability perk with the same id, then equipped in CHARACTER. free = always yours.
// cd = skill cooldown (s); noCharge = seconds after the super during which kills don't charge the next one. Code: player.js.
const ABIL = {
  breakpoint: { k: 'skill', name: 'BREAKPOINT', desc: 'Freeze every bug near you for 3s.', cd: 10, free: true },
  rewrite: { k: 'skill', name: 'REWRITE', desc: 'Shockwave: wipes rot and blasts bugs away.', cd: 8 },
  extract: { k: 'skill', name: 'EXTRACT METHOD', desc: 'Pull nearby bugs into a tight cluster in front of you.', cd: 7 },
  blink: { k: 'skill', name: 'BLINK', desc: 'Teleport toward your aim, cleaning the path.', cd: 3.5 },
  backdoor: { k: 'skill', name: 'BACKDOOR', desc: 'Plant a backdoor, then use it again within 8s to teleport back.', cd: 6 },
  stress: { k: 'skill', name: 'STRESS TEST', desc: 'Triple fire rate for 3s.', cd: 11 },
  turret: { k: 'skill', name: 'DEPLOY TURRET', desc: 'Drop an auto-turret for 10s.', cd: 14 },
  spinup: { k: 'skill', name: 'SPIN UP', desc: 'Launch a container that hunts bugs for 20s (max 3).', cd: 6 },
  health: { k: 'skill', name: 'HEALTH CHECK', desc: 'Drop a beacon: devs inside regain 1 HP every 3s for 12s.', cd: 16 },
  route: { k: 'skill', name: 'ROUTE TRAFFIC', desc: 'Every container rushes the bug you aim at for 4s, hitting 2x.', cd: 8 },
  watch: { k: 'skill', name: 'WATCH EXPRESSION', desc: 'Tag the bug you aim at: it takes 2x damage from you for 6s.', cd: 9 },
  edge: { k: 'skill', name: 'EDGE CASE', desc: 'Your next shot is a wide 6x rail that pierces everything.', cd: 6 },
  halt: { k: 'sup', name: 'SYSTEM HALT', desc: 'Freeze every bug for 5s and delete all enemy shots.', free: true },
  rmrf: { k: 'sup', name: 'RM -RF', desc: 'Nuke: wipe every bug and all rot. Bosses lose 25% HP.' },
  debt: { k: 'sup', name: 'TECH DEBT', desc: '8s: every hit is absorbed, then paid back as one big shockwave.' },
  loadtest: { k: 'sup', name: 'LOAD TEST', desc: '6s of auto-aimed 4x fire rate rails that pierce everything.', noCharge: 7 },
  kube: { k: 'sup', name: 'KUBERNETES', desc: 'Deploy 6 fast containers for 10s.' },
  chaos: { k: 'sup', name: 'CHAOS MONKEY', desc: 'Every container explodes, then 3 fresh ones deploy.' },
  zeroday: { k: 'sup', name: 'ZERO DAY', desc: 'Release 36 homing exploits that hunt bugs down.', noCharge: 2.5 },
  mitm: { k: 'sup', name: 'MAN IN THE MIDDLE', desc: '7s: enemy shots that get close flip sides and hunt bugs.', noCharge: 2.5 },
  maint: { k: 'sup', name: 'MAINTENANCE WINDOW', desc: 'Shield every dev in the room for 6s.' },
  failover: { k: 'sup', name: 'FAILOVER', desc: 'Revive and fully heal ONE teammate (whoever needs it most), plus 3 turrets.' },
  smoke: { k: 'sup', name: 'SMOKE TEST', desc: '7s: every bug you kill fires a rail at the next nearest bug.', noCharge: 7 },
  rewind: { k: 'sup', name: 'REWIND', desc: 'Jump back to where you were 4s ago, with the HP you had then.' }};
// Perks: one tree per attribute. at = attribute, req = attribute level needed, each level costs 1 perk point.
// ab = unlocks the ABIL with the same id. mod = stat change per level, summed into cwMod (player.js). Effects without mod: player.js / world.js.
const PERK = {
  // CHASSIS
  rewrite: { at: 'body', req: 4, ab: 1 },
  plate: { at: 'body', req: 4, max: 2, name: 'HARDENED BUILD', desc: '+15% invulnerability after a hit', mod: { inv: .15 } },
  close: { at: 'body', req: 6, max: 3, name: 'POINT BLANK', desc: '+20% damage to bugs within 140px' },
  args: { at: 'body', req: 8, max: 2, name: 'EXTRA ARGS', desc: '+1 pellet for multi-shot weapons (SCATTER CANNON)' },
  extract: { at: 'body', req: 9, ab: 1 },
  unit: { at: 'body', req: 11, max: 2, name: 'UNIT TESTS+', desc: '+1 max HP', mod: { hp: 1 } },
  rmrf: { at: 'body', req: 12, ab: 1 },
  rp: { at: 'body', req: 15, max: 1, name: 'RESTORE POINT', desc: 'once per wave, a lethal hit leaves you at 1 HP' },
  debt: { at: 'body', req: 16, ab: 1 },
  heavy: { at: 'body', req: 4, max: 3, name: 'HEAVY COMMIT', desc: '+5% weapon damage', mod: { dmg: .05 } },
  fault: { at: 'body', req: 7, max: 3, name: 'FAULT TOLERANCE', desc: '+4% chance to deflect a hit', mod: { deflect: .04 } },
  brute: { at: 'body', req: 11, max: 2, name: 'BRUTE FORCE', desc: 'shots pierce +1 bug', mod: { pierce: 1 } },
  monolith: { at: 'body', req: 15, max: 1, name: 'MONOLITH', desc: '+1 shot per trigger pull', mod: { shots: 1 } },
  // REFLEX
  blink: { at: 'reflex', req: 3, ab: 1 },
  fast: { at: 'reflex', req: 4, max: 3, name: 'FAST CI', desc: '+8% fire rate', mod: { fire: .08 } },
  stress: { at: 'reflex', req: 6, ab: 1 },
  lowlat: { at: 'reflex', req: 6, max: 3, name: 'LOW LATENCY', desc: '+5% move speed', mod: { speed: .05 } },
  macros: { at: 'reflex', req: 8, max: 3, name: 'MACROS', desc: '-10% dash cooldown', mod: { dash: .1 } },
  backdoor: { at: 'reflex', req: 10, ab: 1 },
  hop: { at: 'reflex', req: 11, max: 2, name: 'LONG HOP', desc: 'BLINK goes 25% farther' },
  head: { at: 'reflex', req: 12, max: 2, name: 'HEAD START', desc: '+1 upgrade pick at the start of each run' },
  soak: { at: 'reflex', req: 14, max: 2, name: 'SOAK TEST', desc: 'STRESS TEST lasts +1s' },
  loadtest: { at: 'reflex', req: 16, ab: 1 },
  react: { at: 'reflex', req: 4, max: 2, name: 'SHORT CIRCUIT', desc: '+10% shot range', mod: { range: .1 } },
  rapid: { at: 'reflex', req: 11, max: 3, name: 'HOT LOOP', desc: '+6% fire rate', mod: { fire: .06 } },
  ghost: { at: 'reflex', req: 15, max: 1, name: 'ZERO LATENCY', desc: '-15% dash cooldown, +5% move speed', mod: { dash: .15, speed: .05 } },
  // TECH
  turret: { at: 'tech', req: 3, ab: 1 },
  spinup: { at: 'tech', req: 5, ab: 1 },
  medic: { at: 'tech', req: 5, max: 1, name: 'FIELD MEDIC', desc: 'revive teammates 2x faster' },
  lb: { at: 'tech', req: 7, max: 2, name: 'LOAD BALANCER', desc: '+1 turret at a time' },
  rep: { at: 'tech', req: 7, max: 2, name: 'REPLICA SET', desc: '+1 container at a time' },
  poll: { at: 'tech', req: 9, max: 2, name: 'FAST POLLING', desc: 'turrets fire 25% faster' },
  health: { at: 'tech', req: 10, ab: 1 },
  bite: { at: 'tech', req: 11, max: 3, name: 'RESOURCE LIMITS', desc: 'containers hit 25% harder' },
  route: { at: 'tech', req: 12, ab: 1 },
  kube: { at: 'tech', req: 14, ab: 1 },
  auto: { at: 'tech', req: 15, max: 2, name: 'AUTOSCALER', desc: 'KUBERNETES deploys +2 containers' },
  chaos: { at: 'tech', req: 17, ab: 1 },
  ops: { at: 'tech', req: 7, max: 2, name: 'SRE ROTATION', desc: '-8% cyberware cooldown', mod: { oscd: .08 } },
  sentry: { at: 'tech', req: 11, max: 3, name: 'HARDENED SENTRY', desc: '+10% turret / container damage', mod: { summ: .1 } },
  grid: { at: 'tech', req: 15, max: 1, name: 'DEFENSE GRID', desc: '+20% turret / container damage', mod: { summ: .2 } },
  // NETRUN
  mem: { at: 'net', req: 4, max: 3, name: 'MEMORY BANKS', desc: '+2 max netdeck RAM', mod: { ram: 2 } },
  watch: { at: 'net', req: 5, ab: 1 },
  reroll: { at: 'net', req: 5, max: 3, name: 'GIT STASH', desc: '+1 upgrade reroll per run (R)' },
  hot: { at: 'net', req: 6, max: 2, name: 'HOT SWAP', desc: '+20% RAM regen', mod: { ramr: .2 } },
  zeroday: { at: 'net', req: 7, ab: 1 },
  fup: { at: 'net', req: 8, max: 2, name: 'FAST UPLOAD', desc: '-15% quickhack upload time', mod: { upload: .15 } },
  qd: { at: 'net', req: 10, max: 2, name: 'STACK DEPTH', desc: '+1 quickhack queue slot per enemy', mod: { queue: 1 } },
  mitm: { at: 'net', req: 11, ab: 1 },
  sbuf: { at: 'net', req: 12, max: 2, name: 'SUPER BUFFER', desc: 'the RAM re-run of your super costs 2 less RAM', mod: { supram: 2 } },
  maint: { at: 'net', req: 14, ab: 1 },
  mass: { at: 'net', req: 15, max: 2, name: 'MASS EXPLOIT', desc: '+12 ZERO DAY exploits' },
  failover: { at: 'net', req: 16, ab: 1 },
  payload: { at: 'net', req: 4, max: 3, name: 'PAYLOAD', desc: '+8% quickhack damage', mod: { hack: .08 } },
  botnet: { at: 'net', req: 15, max: 1, name: 'BOTNET', desc: '+15% quickhack damage, -10% upload time', mod: { hack: .15, upload: .1 } },
  // FOCUS
  breakpoint: { at: 'focus', req: 0, ab: 1 },
  halt: { at: 'focus', req: 0, ab: 1 },
  warm: { at: 'focus', req: 4, max: 2, name: 'WARM CACHE', desc: 'start each run with +25% super' },
  cold: { at: 'focus', req: 6, max: 3, name: 'COLD READ', desc: '+20% damage to frozen bugs' },
  step: { at: 'focus', req: 7, max: 2, name: 'STEP THROUGH', desc: '-12% skill cooldown', mod: { skill: .12 } },
  edge: { at: 'focus', req: 8, ab: 1 },
  side: { at: 'focus', req: 10, max: 3, name: 'SIDE CHANNEL', desc: '+6% crit chance', mod: { crit: .06 } },
  dump: { at: 'focus', req: 11, max: 2, name: 'CORE DUMP', desc: 'frozen bugs you kill give +4% super' },
  pier: { at: 'focus', req: 12, max: 2, name: 'FULL COVERAGE', desc: 'rails pierce +1 bug (RAIL LANCE)' },
  reg: { at: 'focus', req: 14, max: 3, name: 'REGRESSION SUITE', desc: '+20% damage to bosses', mod: { boss: .2 } },
  smoke: { at: 'focus', req: 15, ab: 1 },
  rewind: { at: 'focus', req: 17, ab: 1 },
  aim: { at: 'focus', req: 4, max: 3, name: 'DEAD ZONE', desc: '+3% crit chance', mod: { crit: .03 } },
  shatter: { at: 'focus', req: 11, max: 2, name: 'SHATTER', desc: '+25% crit damage', mod: { critx: .25 } },
  profiler: { at: 'focus', req: 11, max: 3, name: 'PROFILER', desc: '+10% super charge', mod: { sup: .1 } }};
for (const k in PERK) { const P = PERK[k]; if (P.ab) Object.assign(P, { max: 1, name: ABIL[k].name, desc: ABIL[k].desc, free: !!ABIL[k].free }); }
// Perk trees: four tiers by requirement (<= 5 | 6-9 | 10-13 | 14+). A whole tier opens at once, at tierStart, so req is rounded down to it.
const PERK_TIERS = [5, 9, 13], tierStart = i => i ? PERK_TIERS[i - 1] + 1 : BAL.attr.start; // the attribute level a tier opens at
for (const k in PERK) { const P = PERK[k]; P.tier = PERK_TIERS.filter(v => P.req > v).length; P.req = tierStart(P.tier); }
// Sub-skills: small nodes that branch off a big one and open with its tier. id: [max level, name, effect, stat mods]
const PERK_SUB = {
  // CHASSIS
  bulk: [1, 'BULKHEAD', '+1 max HP', { hp: 1 }], guard: [2, 'CHECKSUM', '+3% chance to deflect a hit', { deflect: .03 }],
  mirror: [1, 'GRACE PERIOD', '+20% invulnerability after a hit', { inv: .2 }], salvage: [2, 'SALVAGE', '+15% power-up duration', { pw: .15 }],
  integ: [1, 'INTEGRATION TESTS', '+1 max HP', { hp: 1 }], canary: [2, 'CANARY BUILD', '+2% chance to deflect a hit', { deflect: .02 }],
  snap: [1, 'SNAPSHOT', '+25% invulnerability after a hit', { inv: .25 }], immut: [1, 'IMMUTABLE', '+1 max HP', { hp: 1 }],
  refac: [2, 'REFACTOR', '-6% skill cooldown', { skill: .06 }], lint: [2, 'LINTER', '+8% super charge', { sup: .08 }],
  inline: [2, 'INLINE', '+4% weapon damage', { dmg: .04 }], hoist: [1, 'HOIST', '-8% skill cooldown', { skill: .08 }],
  force: [2, 'FORCE FLAG', '+10% super charge', { sup: .1 }], elev: [2, 'ELEVATED', '+10% damage to bosses', { boss: .1 }],
  interest: [1, 'COMPOUND INTEREST', '+15% super charge', { sup: .15 }], refi: [1, 'REFINANCE', '-10% skill cooldown', { skill: .1 }],
  kick: [2, 'RECOIL SPRING', '+5% fire rate', { fire: .05 }], bigdiff: [2, 'BIG DIFF', '+10% shot range', { range: .1 }],
  shrap: [1, 'SHRAPNEL', 'shots ricochet once more', { bounce: 1 }],
  crunch: [2, 'CRUNCH TIME', '+5% weapon damage', { dmg: .05 }], threads: [2, 'WORKER THREADS', '+5% fire rate', { fire: .05 }],
  gc: [1, 'GARBAGE COLLECTOR', '+20% crit damage', { critx: .2 }], mmap: [1, 'MEMORY MAP', 'shots pierce +1 bug', { pierce: 1 }],
  // REFLEX
  trigger: [2, 'HAIR TRIGGER', '+4% fire rate', { fire: .04 }], tap: [1, 'DOUBLE TAP', '+10% shot range', { range: .1 }],
  redline: [1, 'REDLINE', '+5% weapon damage', { dmg: .05 }], burn: [1, 'BURN-IN', '-8% skill cooldown', { skill: .08 }],
  jit: [2, 'JIT', '+4% fire rate', { fire: .04 }], unroll: [1, 'LOOP UNROLL', 'shots pierce +1 bug', { pierce: 1 }],
  flame: [1, 'FLAME GRAPH', '+3% crit chance', { crit: .03 }], tail: [1, 'TAIL CALL', '+20% crit damage', { critx: .2 }],
  afterimg: [1, 'AFTERIMAGE', '+15% invulnerability after a hit', { inv: .15 }], vector: [1, 'VECTORIZE', '-8% dash cooldown', { dash: .08 }],
  sprint: [2, 'SPRINT', '+3% move speed', { speed: .03 }], drift: [1, 'DRIFT', '-8% dash cooldown', { dash: .08 }],
  hops: [1, 'MULTI-HOP', '-8% skill cooldown', { skill: .08 }], land: [1, 'SOFT LANDING', '+3% chance to deflect a hit', { deflect: .03 }],
  spike: [1, 'SPIKE TEST', '+15% super charge', { sup: .15 }], scale: [1, 'SCALE OUT', '+5% fire rate', { fire: .05 }],
  twitch: [2, 'TWITCH', '+3% move speed', { speed: .03 }], prefetch: [1, 'PREFETCH', '+10% shot range', { range: .1 }],
  combo: [2, 'COMBO KEYS', '-6% dash cooldown', { dash: .06 }], bind: [1, 'KEYBIND', '-6% skill cooldown', { skill: .06 }],
  tunnel: [1, 'TUNNEL', '+15% power-up duration', { pw: .15 }],
  nop: [1, 'NOP SLED', '+5% move speed', { speed: .05 }], yield: [1, 'YIELD', '+10% super charge', { sup: .1 }],
  // TECH
  mount: [1, 'QUICK MOUNT', '-6% skill cooldown', { skill: .06 }], ammo: [2, 'BELT FEED', '+8% turret / container damage', { summ: .08 }],
  tripod: [1, 'TRIPOD', '+8% turret / container damage', { summ: .08 }],
  servo: [1, 'SERVO', '+10% cyberware duration', { osdur: .1 }], ward: [1, 'WARD', '+3% chance to deflect a hit', { deflect: .03 }],
  salvo: [1, 'SALVO', '+12% turret / container damage', { summ: .12 }], overwatch: [1, 'OVERWATCH', '-10% skill cooldown', { skill: .1 }],
  image: [1, 'BASE IMAGE', '+8% turret / container damage', { summ: .08 }], layer: [1, 'LAYER CACHE', '-6% skill cooldown', { skill: .06 }],
  pod: [1, 'POD SPREAD', '+10% cyberware duration', { osdur: .1 }], sidecar: [2, 'SIDECAR', '+8% turret / container damage', { summ: .08 }],
  affinity: [1, 'AFFINITY', '+10% super charge', { sup: .1 }],
  helm: [1, 'HELM CHART', '+15% super charge', { sup: .15 }],
  triage: [1, 'TRIAGE', '+1 max HP', { hp: 1 }], stim: [2, 'STIMULANT', '+15% power-up duration', { pw: .15 }],
  cron: [2, 'CRON JOB', '-8% cyberware cooldown', { oscd: .08 }], uptime: [1, 'UPTIME', '+15% cyberware duration', { osdur: .15 }],
  probe: [1, 'HEALTH PROBE', '+20% invulnerability after a hit', { inv: .2 }], vitals: [1, 'VITALS', '+1 max HP', { hp: 1 }],
  blast: [1, 'BLAST RADIUS', '+12% turret / container damage', { summ: .12 }], respawn: [1, 'RESPAWN POLICY', '+10% super charge', { sup: .1 }],
  // NETRUN
  swap: [1, 'SWAP FILE', '+1 max netdeck RAM', { ram: 1 }], heap: [2, 'HEAP', '+1 max netdeck RAM', { ram: 1 }],
  cool: [2, 'COOLANT', '+10% RAM regen', { ramr: .1 }], surge: [1, 'SURGE', '+10% RAM regen', { ramr: .1 }],
  cache: [1, 'L2 CACHE', 'the RAM re-run of your super costs 1 less RAM', { supram: 1 }], page: [1, 'PAGE FILE', '+2 max netdeck RAM', { ram: 2 }],
  patchw: [1, 'PATCH WINDOW', '+15% RAM regen', { ramr: .15 }], lts: [1, 'LONG-TERM SUPPORT', '+2 max netdeck RAM', { ram: 2 }],
  trace: [1, 'STACK TRACE', '-8% quickhack upload time', { upload: .08 }],
  gzip: [1, 'GZIP', '-8% quickhack upload time', { upload: .08 }], stream: [1, 'STREAMING', '+8% quickhack damage', { hack: .08 }],
  stack: [1, 'CALL STACK', '+8% quickhack damage', { hack: .08 }], batch: [1, 'BATCH JOB', '-10% quickhack upload time', { upload: .1 }],
  replica: [1, 'READ REPLICA', '+10% super charge', { sup: .1 }], quorum: [1, 'QUORUM', '+1 quickhack queue slot per enemy', { queue: 1 }],
  inject: [2, 'INJECTION', '+6% quickhack damage', { hack: .06 }], fuzz: [1, 'FUZZER', '+3% crit chance', { crit: .03 }],
  exploit: [1, 'EXPLOIT KIT', '+10% quickhack damage', { hack: .1 }], cve: [1, 'CVE FEED', '-8% quickhack upload time', { upload: .08 }],
  spoof: [1, 'SPOOF', '+3% chance to deflect a hit', { deflect: .03 }], relay: [1, 'RELAY', '+10% super charge', { sup: .1 }],
  swarm: [1, 'SWARM', '+12% quickhack damage', { hack: .12 }],
  // FOCUS
  frost: [1, 'FROST', '-6% skill cooldown', { skill: .06 }], still: [1, 'STILLNESS', '+3% crit chance', { crit: .03 }],
  brittle: [2, 'BRITTLE', '+20% crit damage', { critx: .2 }], ice: [1, 'ICE', '-8% skill cooldown', { skill: .08 }],
  core: [1, 'CORE TEMP', '+3% crit chance', { crit: .03 }],
  audit: [1, 'AUDIT LOG', '+10% damage to bosses', { boss: .1 }], blame: [1, 'BLAME', '+25% crit damage', { critx: .25 }],
  spool: [2, 'SPOOL UP', '+8% super charge', { sup: .08 }],
  skip: [1, 'STEP OVER', '-8% skill cooldown', { skill: .08 }], over: [1, 'STEP OUT', '+10% super charge', { sup: .1 }],
  hotpath: [1, 'HOT PATH', '+10% super charge', { sup: .1 }], sample: [1, 'SAMPLING', '-8% skill cooldown', { skill: .08 }],
  undo: [1, 'UNDO', '+20% invulnerability after a hit', { inv: .2 }], redo: [1, 'REDO', '+15% super charge', { sup: .15 }],
  sight: [2, 'SIGHTLINE', '+10% shot range', { range: .1 }], zero: [1, 'ZEROED', '+3% crit chance', { crit: .03 }],
  bevel: [1, 'BEVEL', '+20% crit damage', { critx: .2 }], margin: [1, 'MARGIN', '+10% damage to bosses', { boss: .1 }],
  tight: [2, 'TIGHT LOOP', '+3% crit chance', { crit: .03 }],
  sweep: [1, 'SWEEP', 'shots pierce +1 bug', { pierce: 1 }], chain: [1, 'CHAIN RULE', '+25% crit damage', { critx: .25 }] };
for (const k in PERK_SUB) { console.assert(!PERK[k], 'PERK_SUB clash: ' + k); const [max, name, desc, mod] = PERK_SUB[k]; PERK[k] = { max, name, desc, mod }; }
// Three pillars per attribute, bottom to top: big:left,left|right,right. A big node sits on the pillar's trunk, up to two sub-skills either side.
const PERK_PILLARS = {
  body: ['plate:bulk|guard fault:mirror|salvage unit:integ|canary rp:snap|immut', 'rewrite:refac|lint extract:inline|hoist rmrf:force|elev debt:interest|refi',
    'heavy:kick|bigdiff close:args|shrap brute:crunch|threads monolith:gc|mmap'],
  reflex: ['fast:trigger|tap stress:redline|burn rapid:jit|unroll soak:flame|tail', 'blink:afterimg|vector lowlat:sprint|drift hop:hops|land loadtest:spike|scale',
    'react:twitch|prefetch macros:combo|bind backdoor:head|tunnel ghost:nop|yield'],
  tech: ['turret:mount|ammo lb:poll|tripod sentry:servo|ward grid:salvo|overwatch', 'spinup:image|layer rep:pod|sidecar route:bite|affinity kube:auto|helm',
    'medic:triage|stim ops:cron|uptime health:probe|vitals chaos:blast|respawn'],
  net: ['mem:swap|heap hot:cool|surge sbuf:cache|page maint:patchw|lts', 'watch:reroll|trace fup:gzip|stream qd:stack|batch failover:replica|quorum',
    'payload:inject|fuzz zeroday:exploit|cve mitm:spoof|relay botnet:mass|swarm'],
  focus: ['breakpoint:frost|still cold:brittle|ice shatter:dump|core reg:audit|blame', 'halt:warm|spool step:skip|over profiler:hotpath|sample rewind:undo|redo',
    'aim:sight|zero edge:bevel|margin side:pier|tight smoke:sweep|chain'] };
const perkTree = a => PERK_PILLARS[a].flatMap((s, col) => s.split(' ').flatMap(w => { // [{ id, tier, col, side: 0 big | -1 / 1 sub, slot: -1 / 0 / 1 up-down }]
  const [id, sub = ''] = w.split(':'), [L = '', R = ''] = sub.split('|'), tier = PERK[id].tier;
  const subs = (ids, side) => ids.split(',').filter(Boolean).map((k, i, A) => ({ id: k, tier, col, side, slot: A.length > 1 ? i * 2 - 1 : 0 }));
  return [{ id, tier, col, side: 0, slot: 0 }, ...subs(L, -1), ...subs(R, 1)]; }));
for (const a in PERK_PILLARS) { // sub-skills take their attribute + tier from the pillar; check every perk is placed once, one big node per pillar per tier
  const t = perkTree(a); for (const d of t) if (d.side) Object.assign(PERK[d.id], { at: a, tier: d.tier, req: tierStart(d.tier) });
  const ids = t.map(n => n.id), big = t.filter(n => !n.side).map(n => n.col + '.' + n.tier);
  console.assert(new Set(ids).size === ids.length && Object.keys(PERK).filter(k => PERK[k].at === a).every(k => ids.includes(k)), 'perkTree ' + a + ': every perk placed once');
  console.assert(new Set(big).size === big.length && big.length === 12, 'perkTree ' + a + ': one big node per pillar per tier'); }
const xpNeed = lv => Math.round(BAL.xp.base * Math.pow(lv, BAL.xp.exp)); // XP from level lv to lv + 1

// ---------- cyberware (installed at the clinic, main menu) ----------
// One implant per socket, bought once with bytes, limited by capacity (cwCap in state.js: grows with level, TECH and shards).
// The OS implant is the only active one (C / L3); everything else is passive. eq = the sound it makes when you install it.
// tier = rarity colour + the level needed (BAL.cw.tierLv); cost = base price, scaled by BAL.cw at the end of this file.
// ---------- cyberware ----------
// You're a program, not a person: your "body" is a ship chassis. 11 systems with 1-3 sockets each (socket keys 'cpu', 'cpu2', 'cpu3').
// mod = flat stat changes summed over installed implants (see cwMod in player.js):
//   dmg fire speed sup hack upload ramr osdur boss range pw crit critx deflect inv = +fraction · dash skill oscd = -fraction of the cooldown
//   hp bounce pierce home ram = +count. Implants without mod have hand-written behaviour (player.js / world.js).
const CW_CATS = { // key: [name, sockets, side of the chassis view, node on the hologram (x across -1..1, y nose -1 .. tail 1)]
  // per side, listed nose to tail so the leader lines don't cross
  optics: ['SENSOR ARRAY', 1, 'L', [-.02, -.8]], cpu: ['LOGIC CORE', 3, 'L', [-.06, -.45]], fw: ['FIREWALL', 2, 'L', [-.2, -.14]],
  power: ['POWER CORE', 3, 'L', [-.1, .14]], bus: ['SIGNAL BUS', 2, 'L', [-.32, .38]], plating: ['PLATING', 3, 'L', [-.6, .58]],
  os: ['KERNEL', 1, 'R', [.06, -.62]], grip: ['FIRE CONTROL', 1, 'R', [.16, -.3]], frame: ['FRAME', 2, 'R', [.2, .02]],
  drive: ['THRUSTERS', 1, 'R', [.34, .42]], arms: ['HARDPOINTS', 1, 'R', [.6, .58]] };
const CW_SLOTS = Object.fromEntries(Object.entries(CW_CATS).map(([k, c]) => [k, c[0]]));
const sockKey = (cat, i) => (i ? cat + (i + 1) : cat), sockCat = k => k.replace(/\d+$/, '');
const SOCKETS = Object.entries(CW_CATS).flatMap(([c, d]) => Array.from({ length: d[1] }, (_, i) => sockKey(c, i)));
const TIER = { common: '#D6D0D0', uncommon: '#1DED83', rare: '#2570D4', epic: '#9D2BF5', legendary: '#F47949' };
const CW = {
  // KERNEL: the one active implant (C), or a netdeck that runs quickhacks (hold F)
  sandy: { slot: 'os', name: 'SANDEVISTAN MK.1', tier: 'rare', start: true, cap: 5, cost: 0, cd: 22, dur: 5, dil: .25, eq: 'eq_wire', ic: 'SV1',
    desc: 'Time dilation. For 5s the world runs at 25% speed and you move and shoot 50% faster. Online it slows the whole room.', lore: 'Bootleg build. The changelog is just the word "faster".' },
  sandy2: { slot: 'os', name: 'SANDEVISTAN MK.2', tier: 'legendary', cap: 8, cost: 140, cd: 30, dur: 7, dil: .15, eq: 'eq_wire', ic: 'SV2',
    desc: 'Deeper dilation: 7s at 15% world speed, same 50% overclock. Longer cooldown.', lore: 'Runs the clock so slow the logs time out.' },
  berserk: { slot: 'os', name: 'BERSERK.SYS', tier: 'epic', cap: 4, cost: 60, cd: 24, dur: 6, eq: 'eq_arms', ic: 'BSK',
    desc: '6s of combat override: +60% damage, ramming bugs shreds them, contact can\'t hurt you. Heals 1 HP on activation.', lore: 'Disables every safety check at once. On purpose.' },
  camo: { slot: 'os', name: 'OPTICAL CAMO', tier: 'rare', cap: 3, cost: 45, cd: 20, dur: 5, eq: 'equip', ic: 'CMO',
    desc: '5s of thermoptic cloak: bugs lose track of you. Firing does not break it.', lore: 'Renders you as whitespace.' },
  deck1: { slot: 'os', name: 'NETDECK MK.1', tier: 'uncommon', cap: 3, cost: 30, eq: 'access', ic: 'ND1', deck: { ram: 8, regen: 2.5, up: 1, hdmg: 1, slots: 3 },
    desc: 'Quickhack deck: 8 RAM, 3 quickhack slots. Scan: hold F. Uploads start when the scanner closes.', lore: 'Entry-level intrusion kit. Smells like solder.' },
  deck2: { slot: 'os', name: 'NETDECK // WRAITH', tier: 'epic', cap: 5, cost: 90, eq: 'access', ic: 'NDW', deck: { ram: 12, regen: 2, up: .75, hdmg: 1.1, slots: 5 },
    desc: '12 RAM, 5 quickhack slots, uploads 25% faster, +10% quickhack damage.', lore: 'Leaves no handshake, only a cold spot in the logs.' },
  deck3: { slot: 'os', name: 'NETDECK // LEVIATHAN', tier: 'legendary', cap: 7, cost: 160, eq: 'access', ic: 'NDL', deck: { ram: 16, regen: 1.6, up: .6, hdmg: 1.25, slots: 6, bw: true },
    desc: '16 RAM, 6 quickhack slots, uploads 40% faster, +25% quickhack damage. The only deck that can open the BLACKWALL.', lore: 'Military surplus. The serial number was filed off twice.' },
  // LOGIC CORE
  ram: { slot: 'cpu', name: 'RAM EXPANDER', tier: 'uncommon', cap: 2, cost: 20, ic: 'RAM', mod: { ram: 4 }, desc: '+4 netdeck RAM.', lore: 'More room for bad ideas.' },
  ram2: { slot: 'cpu', name: 'RAM EXPANDER MK.2', tier: 'epic', cap: 4, cost: 55, ic: 'RM2', mod: { ram: 6 }, desc: '+6 netdeck RAM.', lore: 'Stacked dies. Stacked heat.' },
  scache: { slot: 'cpu', name: 'SUPER CACHE', tier: 'rare', cap: 2, cost: 30, ic: 'S$', mod: { sup: .2 }, desc: '+20% super charge from kills.', lore: 'Keeps the good stuff hot.' },
  loop: { slot: 'cpu', name: 'KILL-LOOP DAEMON', tier: 'epic', cap: 3, cost: 50, ic: 'KLD', desc: 'Every 30 kills restore 1 HP.', lore: 'while (true) { patch(self); }' },
  prefetch: { slot: 'cpu', name: 'PREFETCH UNIT', tier: 'rare', cap: 2, cost: 35, ic: 'PFU', mod: { skill: .2 }, desc: '-20% skill cooldown.', lore: 'Loads your next move before you think of it.' },
  gc: { slot: 'cpu', name: 'GARBAGE COLLECTOR', tier: 'uncommon', cap: 2, cost: 25, ic: 'GC', desc: 'Every kill frees 1 netdeck RAM.', lore: 'Sweeps up what the bugs leave behind.' },
  branch: { slot: 'cpu', name: 'BRANCH PREDICTOR', tier: 'epic', cap: 3, cost: 55, ic: 'BP', mod: { crit: .1 }, desc: '+10% chance for a shot to crit (2x damage).', lore: 'Guesses where they flinch.' },
  ice: { slot: 'cpu', name: 'ICEBREAKER', tier: 'epic', cap: 3, cost: 50, ic: 'ICE', mod: { hack: .3 }, desc: '+30% quickhack damage.', lore: 'Firmware written by someone who hates firewalls.' },
  // SENSOR ARRAY
  scanner: { slot: 'optics', name: 'THREAT SCANNER', tier: 'rare', cap: 2, cost: 35, ic: 'TSC', mod: { crit: .08, critx: .5 }, desc: '+8% crit chance. Crits deal 2.5x instead of 2x.', lore: 'Highlights every weak line of code.' },
  weak: { slot: 'optics', name: 'WEAKPOINT OPTICS', tier: 'epic', cap: 3, cost: 50, ic: 'WPO', mod: { boss: .25 }, desc: '+25% damage to bosses and their parts.', lore: 'Big processes have big seams.' },
  lootcam: { slot: 'optics', name: 'LOOT TRACKER', tier: 'uncommon', cap: 1, cost: 20, ic: 'LTR', mod: { pw: .4 }, desc: 'Power-ups last 40% longer.', lore: 'Pings anything shiny.' },
  zoom: { slot: 'optics', name: 'TELEPHOTO LENS', tier: 'uncommon', cap: 1, cost: 20, ic: 'TLE', mod: { range: .3 }, desc: '+30% shot range.', lore: 'Reads stack traces from across the room.' },
  // POWER CORE
  heart: { slot: 'power', name: 'BACKUP BOOTLOADER', tier: 'legendary', cap: 5, cost: 80, ic: 'BBL', desc: 'Once per run, going down reboots you at full HP instead.', lore: 'A second partition nobody told you about.' },
  bio: { slot: 'power', name: 'WATCHDOG TIMER', tier: 'rare', cap: 2, cost: 30, ic: 'WDT', desc: 'Dropping to 1 HP restores 1 HP (once per wave).', lore: 'Kicks you awake before the crash.' },
  flywheel: { slot: 'power', name: 'FLYWHEEL CELL', tier: 'rare', cap: 2, cost: 35, ic: 'FWC', desc: 'Your super charges by itself: +1.2% per second.', lore: 'Never stops spinning.' },
  feedback: { slot: 'power', name: 'FEEDBACK CIRCUIT', tier: 'epic', cap: 3, cost: 45, ic: 'FBC', desc: 'Activating your kernel implant restores 1 HP.', lore: 'Turns the surge back into you.' },
  surge: { slot: 'power', name: 'SURGE REGULATOR', tier: 'uncommon', cap: 2, cost: 30, ic: 'SRG', mod: { hp: 1 }, desc: '+1 max HP.', lore: 'Flattens the spikes.' },
  coolant: { slot: 'power', name: 'COOLANT LOOP', tier: 'rare', cap: 2, cost: 40, ic: 'CLP', mod: { oscd: .2 }, desc: '-20% kernel implant cooldown.', lore: 'Liquid nitrogen and optimism.' },
  // FIREWALL
  popblock: { slot: 'fw', name: 'POPUP BLOCKER', tier: 'uncommon', cap: 1, cost: 20, ic: 'PUB', desc: 'Half of all adware popups never open.', lore: 'Closes them before they finish loading.' },
  sandbox: { slot: 'fw', name: 'SANDBOX', tier: 'uncommon', cap: 1, cost: 20, ic: 'SBX', desc: 'Adware gunk on your screen wears off twice as fast.', lore: 'Whatever got in stays in the box.' },
  checksum: { slot: 'fw', name: 'CHECKSUM GUARD', tier: 'rare', cap: 2, cost: 35, ic: 'CHK', mod: { deflect: .1 }, desc: '10% chance to shrug off a hit.', lore: 'If the hash doesn\'t match, it didn\'t happen.' },
  // SIGNAL BUS
  reflex: { slot: 'bus', name: 'REFLEX TUNER', tier: 'epic', cap: 3, cost: 45, ic: 'RFX', desc: 'Every dash triggers 0.6s of time dilation.', lore: 'Interrupt priority: you.' },
  panic: { slot: 'bus', name: 'PANIC INTERRUPT', tier: 'epic', cap: 3, cost: 50, ic: 'PNI', desc: 'Dropping to 1 HP triggers 2s of time dilation (once per wave).', lore: 'The last good idea, held for two whole seconds.' },
  lowlat: { slot: 'bus', name: 'LOW-LATENCY BUS', tier: 'rare', cap: 2, cost: 35, ic: 'LLB', mod: { fire: .12 }, desc: '+12% fire rate.', lore: 'Shaves the wait off every trigger pull.' },
  sched: { slot: 'bus', name: 'THREAD SCHEDULER', tier: 'uncommon', cap: 2, cost: 25, ic: 'THS', mod: { speed: .1 }, desc: '+10% move speed.', lore: 'Always picks you first.' },
  uplink: { slot: 'bus', name: 'UPLINK BOOSTER', tier: 'rare', cap: 2, cost: 30, ic: 'UPL', mod: { upload: .3, ramr: .3 }, desc: 'Quickhacks upload 30% faster and RAM recovers 30% faster.', lore: 'Wider pipe, fewer questions.' },
  // PLATING
  lattice: { slot: 'plating', name: 'ABLATIVE LATTICE', tier: 'rare', cap: 3, cost: 40, ic: 'ABL', desc: 'The first hit you take each wave is deflected.', lore: 'Burns away so you don\'t.' },
  reactive: { slot: 'plating', name: 'REACTIVE PLATING', tier: 'epic', cap: 3, cost: 45, ic: 'RXP', desc: 'Getting hit sends out a shockwave that hurts and shoves bugs around you.', lore: 'Hits back before you do.' },
  ceramic: { slot: 'plating', name: 'CERAMIC PLATING', tier: 'uncommon', cap: 2, cost: 25, ic: 'CER', mod: { hp: 1 }, desc: '+1 max HP.', lore: 'Cheap, thick, reliable.' },
  mirror: { slot: 'plating', name: 'MIRROR COAT', tier: 'rare', cap: 2, cost: 35, ic: 'MRC', mod: { deflect: .12 }, desc: '12% chance to shrug off a hit.', lore: 'Polished until the bullets get confused.' },
  heatsink: { slot: 'plating', name: 'HEAT SINK', tier: 'rare', cap: 2, cost: 30, ic: 'HSK', mod: { osdur: .25 }, desc: 'Kernel implants run 25% longer.', lore: 'Lets the core run hot for longer.' },
  // FRAME
  bones: { slot: 'frame', name: 'TITANIUM FRAME', tier: 'uncommon', cap: 2, cost: 35, ic: 'TIF', mod: { hp: 1 }, desc: '+1 max HP.', lore: 'Aerospace grade. Allegedly.' },
  spine: { slot: 'frame', name: 'CARBON SPINE', tier: 'rare', cap: 2, cost: 35, ic: 'CSP', mod: { dmg: .1 }, desc: '+10% damage.', lore: 'Stiffer chassis, harder recoil, bigger holes.' },
  mounts: { slot: 'frame', name: 'SHOCK MOUNTS', tier: 'uncommon', cap: 1, cost: 20, ic: 'SHM', mod: { inv: .5 }, desc: 'Invulnerability after a hit lasts 50% longer.', lore: 'Soaks up the shake.' },
  // FIRE CONTROL
  link: { slot: 'grip', name: 'TARGET LINK', tier: 'rare', cap: 2, cost: 30, ic: 'TLK', mod: { home: 1 }, desc: 'Smart-link optics: +1 SMARTCURVE level (+15% lock-on chance, harder curve).', lore: 'Every bullet knows where it\'s going.' },
  ricochet: { slot: 'grip', name: 'RICOCHET SOLVER', tier: 'rare', cap: 2, cost: 35, ic: 'RCS', mod: { bounce: 1 }, desc: 'Shots bounce off walls one more time.', lore: 'Does the geometry so you don\'t have to.' },
  damper: { slot: 'grip', name: 'RECOIL DAMPER', tier: 'uncommon', cap: 1, cost: 20, ic: 'RCD', mod: { fire: .15 }, desc: '+15% fire rate.', lore: 'Steady hands for a ship with none.' },
  penetrator: { slot: 'grip', name: 'PENETRATOR FEED', tier: 'epic', cap: 3, cost: 50, ic: 'PEN', mod: { pierce: 1 }, desc: 'Shots pierce one more bug.', lore: 'Tungsten-core packets.' },
  // HARDPOINTS
  launcher: { slot: 'arms', name: 'MICRO-MISSILE POD', tier: 'epic', cap: 4, cost: 55, eq: 'eq_launcher', ic: 'MMP', desc: 'Every 3.5s, fires a homing micro-missile that bursts on impact.', lore: 'Fire and forget. Mostly forget.' },
  whip: { slot: 'arms', name: 'FIBER WHIP', tier: 'rare', cap: 3, cost: 40, eq: 'eq_wire', ic: 'FWH', desc: 'Every 2s, lashes the nearest bug within reach for heavy damage.', lore: 'One-molecule-thin. Mind the edges.' },
  blades: { slot: 'arms', name: 'RAZOR FINS', tier: 'rare', cap: 3, cost: 40, eq: 'eq_blades', ic: 'RZF', desc: 'Dashing slices every bug you pass through.', lore: 'Folded flat until they aren\'t.' },
  fists: { slot: 'arms', name: 'HYDRAULIC RAM', tier: 'uncommon', cap: 3, cost: 35, eq: 'eq_arms', ic: 'HYR', desc: 'Every dash ends in a slam that hurts and knocks back bugs around you.', lore: 'Subtlety not included.' },
  arc: { slot: 'arms', name: 'ARC PROJECTOR', tier: 'epic', cap: 4, cost: 60, eq: 'eq_launcher', ic: 'ARC', desc: 'Every 2.5s, a lightning arc jumps between up to 4 bugs near you.', lore: 'Finds the shortest path. Through everything.' },
  flak: { slot: 'arms', name: 'FLAK SCREEN', tier: 'rare', cap: 3, cost: 40, eq: 'eq_arms', ic: 'FLK', desc: 'Every 3s, shoots down enemy shots within reach.', lore: 'Point defense for paranoid devs.' },
  // THRUSTERS
  tendons: { slot: 'drive', name: 'AFTERBURNER', tier: 'uncommon', cap: 2, cost: 25, ic: 'AFB', desc: 'Dash 40% further and recharge it 20% faster.', lore: 'Dumps raw fuel into the exhaust.' },
  vector: { slot: 'drive', name: 'VECTOR JETS', tier: 'uncommon', cap: 2, cost: 25, ic: 'VJT', mod: { speed: .15 }, desc: '+15% move speed.', lore: 'Twelve tiny nozzles, all yours.' },
  wake: { slot: 'drive', name: 'STATIC WAKE', tier: 'epic', cap: 3, cost: 45, ic: 'STW', desc: 'Dashing leaves a charged trail that hurts bugs for 1.5s.', lore: 'You leave sparks where you\'ve been.' },
  blink: { slot: 'drive', name: 'BLINK DRIVE', tier: 'rare', cap: 2, cost: 35, ic: 'BLK', mod: { dash: .35 }, desc: '-35% dash cooldown.', lore: 'Skips the frames in between.' }};
CW.dma = { slot: 'bus', name: 'DMA CHANNEL', tier: 'rare', cap: 2, cost: 35, ic: 'DMA', mod: { ram: 2, ramr: .25 }, desc: '+2 netdeck RAM and +25% RAM regen.', lore: 'Skips the CPU entirely. Nobody asks.' };
const CWK = Object.keys(CW);
const cwModOf = (eq, k) => { let n = 0; for (const s in eq) { const D = CW[eq[s]]; if (D && D.mod && D.mod[k]) n += D.mod[k]; } return n; };
// Quickhacks (run by a NETDECK kernel). ram = cost, up = upload seconds before the deck's speed-up, cost = base price in bytes (0 = free,
// x BAL.qh.costMul at the end of this file), lv / net = player level / NETRUN needed to buy it.
// You pick which ones fill the deck's slots at the clinic. bw = only a deck with bw can run it.
const QH = {
  blackwall: { name: 'BLACKWALL', ram: 14, up: 1.8, sfx: 'bw_hit', cost: 0, bw: true, desc: 'Opens a hole in the wall and lets something through: 40 damage to the target, 16 to every bug within 320px.', lore: 'Whatever answers is not on your side either.' },
  ping: { name: 'PING SWEEP', ram: 1, up: .3, sfx: 'qh_ping', cost: 0, lore: 'Everyone answers a ping eventually.', desc: 'Marks the target and every bug within 260px for 10s. Marked bugs take +30% damage from you.' },
  smash: { name: 'STACK SMASH', ram: 3, up: .6, sfx: 'qh_short', cost: 0, lore: 'Write past the end. See what breaks.', desc: 'Overflows the target\'s stack for 7 damage.' },
  mutex: { name: 'MUTEX LOCK', ram: 3, up: .5, sfx: 'qh_freeze', cost: 15, lv: 3, lore: 'Two threads, one lock, zero progress.', desc: 'Locks the target in place for 4s (bosses 1.5s).' },
  nullptr: { name: 'NULL POINTER', ram: 2, up: .4, sfx: 'qh_blind', cost: 15, lv: 3, lore: 'It was pointing at you. Now it points at nothing.', desc: 'The target loses track of everyone for 6s: it wanders and can\'t aim. Bosses resist.' },
  throttle: { name: 'THERMAL THROTTLE', ram: 4, up: .7, sfx: 'qh_burn', cost: 40, lv: 7, net: 6, lore: 'Overclocks the target until it cooks.', desc: 'Sets the target burning: 2.5 damage per second for 5s.' },
  worm: { name: 'WORM', ram: 6, up: .9, sfx: 'qh_spread', cost: 80, lv: 11, net: 9, lore: 'Copies itself. Copies itself. Copies itself.', desc: 'Self-copying payload: 1.5 damage per second for 6s, then jumps to 2 nearby bugs.' },
  panic: { name: 'KERNEL PANIC', ram: 10, up: 1.4, sfx: 'qh_panic', cost: 160, lv: 16, net: 12, lore: 'Not syncing.', desc: 'Crashes the target outright. Bosses lose 10% of their max HP.' }};
const QHK = Object.keys(QH);
// final prices + level gates from BAL (base costs above stay readable)
for (const k in CW) { const D = CW[k]; D.lv = D.start ? 1 : BAL.cw.tierLv[D.tier]; D.cost = Math.round(D.cost * BAL.cw.costMul * BAL.cw.tierMul[D.tier] * BAL.price / 10) * 10; D.bp = D.tier === 'legendary'; }
for (const k in QH) QH[k].cost = Math.round(QH[k].cost * BAL.qh.costMul * BAL.price);
for (const k in WEAPONS) WEAPONS[k].cost = Math.round(WEAPONS[k].cost * BAL.price);
BAL.wpn.mkCost = BAL.wpn.mkCost.map(c => Math.round(c * BAL.price));
const QH_ICON = { // original line icons, 24x24 (HTML svg + canvas Path2D)
  blackwall: 'M2 4h20v16H2zM2 9h20M2 15h20M8 4v5M16 9v6M9 15v5M13 5l-2 5 4 2-3 7', ping: 'M12 2l10 10-10 10L2 12zM12 6l6 6-6 6-6-6zM12 10l2 2-2 2-2-2z',
  smash: 'M14 2L6 13h5l-2 9 9-12h-5l1-8z', mutex: 'M5 11h14v10H5zM8 11V6h8v5M12 14v4', nullptr: 'M3 3h18v18H3zM3 21L21 3',
  throttle: 'M12 2l5 8-1 2 3 3-2 6H7l-2-6 3-3-1-2z', worm: 'M4 18l8-12 8 12M2 16h4v4H2zM10 4h4v4h-4zM18 16h4v4h-4z', panic: 'M12 2l10 19H2zM12 9v6M12 17v2' };
// what the scanner shows for each bug type
const BUG_INFO = { crawl: ['SWARM PROCESS', 'Crawls at the nearest dev and rots every tile it touches.'], zip: ['RACE CONDITION', 'Fast and erratic. Dies to a stiff breeze.'],
  fork: ['SELF-REPLICATOR', 'Splits into two forks when it dies.'], forklet: ['CHILD PROCESS', 'A cheap copy. There will be more.'],
  adware: ['ADWARE', 'Keeps its distance and spams popups at you.'], leak: ['MEMORY LEAK', 'Slow. Keeps growing and spreads rot around it.'],
  trojan: ['DISGUISED PAYLOAD', 'Poses as loot until you get close.'], seg: ['CORE FAULT', 'Tanky. Splits into bugs when it goes down.'],
  lock: ['PAIRED PROCESS', 'Spins a damaging beam with its partner. Kill both fast.'], cache: ['PHASE SHIFTER', 'Phases out, then jumps beside you and fires a ring.'],
  zombie: ['ORPHAN HOST', 'Heals on rot and spits child processes. Clean its grave.'], boss: ['BOSS PROCESS', 'Read the line under its health bar.'],
  pillar: ['DEPENDENCY', 'Shields its boss.'], arm: ['NOODLE', 'Grabs you. Dash to break free.'], pod: ['CI POD', 'Break it before the launch.'] };

// Difficulty multipliers. The host's pick applies to the whole room.
// hp/sp = enemy health/speed, count = enemies per wave, rot = rot spread + breeding, fire = enemy attack cooldown, score = points.
const DIFFS = {
  easy: { name: 'EASY', desc: 'Slower, weaker bugs and lazy rot. Points x0.75.', hp: .85, sp: .92, count: .9, rot: .75, fire: 1.2, score: .75, col: '#1DED83' },
  normal: { name: 'NORMAL', desc: 'The intended experience.', hp: 1.2, sp: 1.06, count: 1.2, rot: 1.15, fire: .85, score: 1, col: '#5EF6FF' },
  hard: { name: 'HARD', desc: 'Tougher, faster, more bugs. Points x1.5.', hp: 1.65, sp: 1.18, count: 1.55, rot: 1.5, fire: .62, score: 1.5, col: '#F86A32' },
  nightmare: { name: 'NIGHTMARE', desc: 'Prod is on fire. Points x2.2.', hp: 2.3, sp: 1.32, count: 1.95, rot: 1.9, fire: .45, score: 2.2, col: '#FF3E34' }};
const DK = Object.keys(DIFFS);
// Mutators: the host's picks apply to the whole room and stack. score multiplies points.
const MUTS = {
  glass: { name: 'ONE-HIT WONDER', desc: '1 max HP, no UNIT TESTS', score: 1.6 },
  legacy: { name: 'LEGACY CODEBASE', desc: 'rot spreads and breeds 2x', score: 1.3 },
  rush: { name: 'BOSS RUSH', desc: 'every wave is a boss', score: 1.5 },
  turbo: { name: 'TURBO', desc: 'bugs 30% faster, spawn faster', score: 1.3 },
  loot: { name: 'LOOT BOXES', desc: '3x drops, bugs 25% tougher', score: 1 }};
const MK = Object.keys(MUTS);
// Cosmetic ship skins, unlocked by lifetime stats (summed over every difficulty, see state.js).
const SKINS = [
  { id: 'none', name: 'STOCK', need: 'always unlocked', ok: () => true },
  { id: 'binary', name: 'BINARY TRAIL', need: 'beat any boss', ok: s => s.bosses >= 1 },
  { id: 'halo', name: 'NEON HALO', need: 'reach wave 10', ok: s => s.wave >= 10 },
  { id: 'rainbow', name: 'RGB TRAIL', need: '1,000 total kills', ok: s => s.kills >= 1000 },
  { id: 'gold', name: 'GOLD PLATING', need: 'reach wave 10 on NIGHTMARE', ok: s => s.nightmare >= 10 }];
const AUTO_SKIP_SCORE = 1.25; // wave skip: the next wave starts as soon as the current one stops spawning (never mid-boss)
const WAVE_HP = .06; // every bug gets +6% HP per wave, so late waves need upgrades

const isBossWave = w => w > 0 && w % 5 === 0;
const bossIdx = w => (Math.max(1, Math.floor(w / 5)) - 1) % BOSSES.length;
const bossOf = w => BOSSES[bossIdx(w)];
const bossName = w => bossOf(w).name;
