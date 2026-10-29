'use strict';
// Constants, helpers and data tables. Loaded first; every other script reads these globals.

const W = 1280, H = 720, CELL = 40, COLS = 32, ROWS = 18, NC = COLS * ROWS, ROT_LIMIT = .6;
const PAL = { bg: '#0b0a1f', rot: '#ff7a2f', gold: '#ffd23f', white: '#f4f1ff', dim: '#8f8ad6', red: '#ff3b5c', ice: '#8fe3ff' };
const PCOL = ['#3ef0ff', '#ff4fd8', '#ffd23f', '#5dffa8', '#c08bff', '#ff9f43', '#7aa8ff', '#ff6b6b'];
const DISP = '"Silkscreen", "Courier New", monospace', MONO = '"JetBrains Mono", Consolas, monospace';

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
function setCode(lines, firstLine = 1, label = 'coderot.js') { // lines: up to ROWS strings
  codeLabel = label; CH.length = 0;
  for (let r = 0; r < ROWS; r++) {
    const s = (String(firstLine + r).padStart(3, ' ').slice(-3) + ' ' + (lines[r] || '')).padEnd(COLS).slice(0, COLS);
    for (let c = 0; c < COLS; c++) CH.push(s[c]);
  }
}
setCode(LINES);
const GL = '#%&@$!?¥§▓▒░¿~', BITS = '{}()<>;=/*&|!01';

// Enemies. rot = how fast they rot the tile under them; charge = super meter gained per kill.
const BUG = {
  crawl: { name: 'BUG', r: 14, hp: 2, sp: 85, pts: 100, col: '#ff7a2f', rot: 1.6, charge: 3 },
  zip: { name: 'GLITCH', r: 10, hp: 1, sp: 200, pts: 150, col: '#b8ff5a', rot: 1.0, charge: 4 },
  fork: { name: 'FORK BOMB', r: 13, hp: 2, sp: 115, pts: 120, col: '#ffb3ec', rot: 1.2, charge: 3 },
  forklet: { name: 'FORK', r: 8, hp: 1, sp: 160, pts: 40, col: '#ffb3ec', rot: .8, charge: 1 },
  adware: { name: 'ADWARE', r: 16, hp: 4, sp: 80, pts: 300, col: '#ff4fd8', rot: 1.2, charge: 6 },
  leak: { name: 'MEMORY LEAK', r: 18, hp: 6, sp: 42, pts: 250, col: '#5ad1ff', rot: 3, charge: 6 },
  trojan: { name: 'TROJAN', r: 13, hp: 3, sp: 270, pts: 350, col: '#ffd23f', rot: 1, charge: 6 },
  seg: { name: 'SEGFAULT', r: 28, hp: 14, sp: 50, pts: 600, col: '#ff3b5c', rot: 2.6, charge: 15 },
  // Late-game elites (world.js). lock: a pair spinning a damaging beam between them (aux = partner id); kill both within 1.5s
  // or the dead one restarts. cache: phases out (untouchable) and jumps to a marked tile (aux = cell + 1), then flushes a ring of shots.
  // zombie: tanky, heals on rot, spits orphan processes; first death leaves a grave (aux > 0 = timer) that rises unless its tile is cleaned.
  lock: { name: 'DEADLOCK', r: 18, hp: 10, sp: 70, pts: 900, col: '#ff9f43', rot: 1.2, charge: 10 },
  cache: { name: 'CACHE MISS', r: 17, hp: 9, sp: 55, pts: 800, col: '#7aa8ff', rot: 1, charge: 9 },
  zombie: { name: 'ZOMBIE PROCESS', r: 22, hp: 20, sp: 42, pts: 1000, col: '#9fd89a', rot: 2, charge: 12 },
  boss: { name: 'BOSS', r: 62, hp: 300, sp: 40, pts: 5000, col: '#ff3b5c', rot: 4, charge: 60 },
  // Boss parts: positioned by their boss (bosses.js), never chase on their own. pid = parent boss id.
  // immortal = can't be hurt (blocks bullets), fwd = passes damage to its boss, ghost = bullets pass through, noTouch = no contact damage.
  pillar: { name: 'DEPENDENCY', r: 17, hp: 12, sp: 0, pts: 250, col: '#ff7a2f', rot: 0, charge: 4, part: true, noTouch: true },
  qr: { name: 'QR CODE', r: 28, hp: 1e9, sp: 0, pts: 0, col: '#ffffff', rot: 0, charge: 0, part: true, immortal: true, fwd: true, noTouch: true },
  arm: { name: 'NOODLE', r: 14, hp: 5, sp: 0, pts: 150, col: '#ffe066', rot: 0, charge: 3, part: true, noTouch: true },
  body: { name: 'LOOP BODY', r: 13, hp: 1e9, sp: 0, pts: 0, col: '#5dffa8', rot: 0, charge: 0, part: true, immortal: true },
  pod: { name: 'CI POD', r: 15, hp: 14, sp: 0, pts: 300, col: '#ff3b5c', rot: 0, charge: 5, part: true, noTouch: true },
  holo: { name: 'DECOY', r: 44, hp: 1e9, sp: 0, pts: 0, col: '#ff3b5c', rot: 0, charge: 0, part: true, immortal: true, ghost: true, noTouch: true }};
const BT = Object.keys(BUG);
// One boss every 5 waves, in this order, then repeating with more HP. ai picks the brain in bosses.js;
// sides = outline polygon for the classic look (0 = noodle blob); r = hit radius.
const BOSSES = [
  { name: 'THE MONOLITH', ai: 'monolith', col: '#ff7a2f', sides: 6, r: 62, desc: 'shielded until you break its 3 pillars' },
  { name: 'LEGACY KERNEL', ai: 'kernel', col: '#c08bff', sides: 0, r: 66, desc: 'deprecated tiles burn · keep moving' },
  { name: 'SPAGHETTI PRIME', ai: 'spaghetti', col: '#ffd23f', sides: 0, r: 58, desc: 'noodle arms grab you · dash free, cut 3 to stun' },
  { name: 'BLUE SCREEN', ai: 'bsod', col: '#3d7bff', sides: 0, r: 70, desc: 'only the QR code takes damage · stop the reboot' },
  { name: 'INFINITE LOOP', ai: 'loop', col: '#5dffa8', sides: 0, r: 24, desc: 'only the head takes damage · the body is a wall' },
  { name: 'THE FINAL DEPLOY', ai: 'deploy', col: '#ff3b5c', sides: 0, r: 46, desc: 'break 4 CI pods before T-0 · beware decoys' }];
const SHOTS = ['orb', 'ad']; // enemy projectile kinds; 'ad' smears your screen
const POPUPS = ['YOU WON A FREE IPHONE', 'DOWNLOAD MORE RAM?', '37 VIRUSES FOUND', 'UPDATE JAVA NOW', 'HOT BUGS IN YOUR AREA',
  'CLICK TO DEBUG', 'npm WARN deprecated', 'core dumped', 'ARE YOU STILL THERE?', 'ACCEPT ALL COOKIES',
  'RATE US 5 STARS', 'TURN ON NOTIFICATIONS?', 'YOUR TRIAL HAS EXPIRED', 'RESTART TO UPDATE', 'SUBSCRIBE FOR MORE BUGS',
  'CONGRATS! YOU ARE VISITOR 1000000', 'ALLOW LOCATION ACCESS?', 'NEW SIGN-IN FROM PROD'];

const POW = {
  sudo: { col: PAL.gold, label: 'SUDO', tip: '+2 shots' },
  coffee: { col: '#c08bff', label: 'COFFEE', tip: '2x fire rate' },
  revert: { col: PAL.white, label: 'GIT REVERT', tip: 'area wipe' },
  patch: { col: '#5dffa8', label: 'HOTFIX', tip: '+1 HP' },
  firewall: { col: '#7aa8ff', label: 'FIREWALL', tip: 'shield' },
  duck: { col: '#ffe066', label: 'RUBBER DUCK', tip: 'turret buddy' },
  cell: { col: '#ff4fd8', label: 'SUPER CELL', tip: '+30 super' },
  adblock: { col: '#5dffa8', label: 'ADBLOCK', tip: 'clears screen gunk' }};
const PT = Object.keys(POW);

const UPG = {
  fire: ['OVERCLOCK', '+20% fire rate'], shots: ['WIDE DIFF', '+1 projectile'], pierce: ['GREP -R', 'shots pierce +1 bug'],
  dmg: ['STRICT MODE', '+30% damage'], speed: ['HOT RELOAD', '+12% move speed'], clean: ['GARBAGE COLLECTOR', 'shots clean wider'],
  hp: ['UNIT TESTS', '+1 max HP, full heal'], bounce: ['RECURSION', 'shots bounce off walls'], homing: ['AUTOCOMPLETE', 'shots curve to bugs'],
  orbit: ['DAEMON THREAD', '+1 orbiting drone'], dash: ['CTRL+Z', '-25% dash cooldown'], battery: ['FISSION CORE', 'faster super charge'],
  skill: ['HOTKEYS', '-20% skill cooldown'], range: ['LONG POLLING', '+30% shot range']};
// Hard caps for every class, so late game stays readable and still dangerous. Class caps (CLASSES.caps) can only go lower.
const UPG_MAX = { fire: 5, shots: 3, pierce: 4, dmg: 5, speed: 4, clean: 3, hp: 4, bounce: 2, homing: 3, orbit: 3, dash: 3, battery: 4, skill: 3, range: 3 };
// Synergies: own both upgrades at LV 2+ to unlock a bonus. Effects live in player.js (me.syn[key]).
const SYN = {
  tail: { name: 'TAIL CALL', desc: 'bounced shots deal +50% damage', need: ['bounce', 'homing'] },
  cron: { name: 'CRON JOB', desc: 'drones hit 2x and clean wider', need: ['orbit', 'clean'] },
  types: { name: 'TYPE CHECKER', desc: 'each pierced bug adds +25% damage', need: ['pierce', 'dmg'] },
  speedrun: { name: 'SPEEDRUN', desc: 'dashing shreds bugs you pass through', need: ['speed', 'dash'] },
  macro: { name: 'MACRO', desc: 'skills refund 12% super', need: ['skill', 'battery'] },
  lsp: { name: 'LANGUAGE SERVER', desc: 'homing locks from twice as far', need: ['homing', 'range'] }};
const SYN_LV = 2;
const SUPER_GAIN = [0, .10, .15, .20, .25]; // FISSION CORE bonus by level

// Playable classes. fire = seconds between shots, life = bullet lifetime. sup = the class super (charged by kills).
// Balance knobs: caps = max level per upgrade for this class, charge = super charge rate, halfHeal = heals are weaker.
const CLASSES = {
  debugger: { name: 'DEBUGGER', role: 'BALANCED', desc: 'Steady blaster, 3 HP.', skill: 'BREAKPOINT', skillDesc: 'Freeze every bug near you for 3s.', cd: 10,
    sup: 'SYSTEM HALT', supDesc: 'Freeze every bug on screen for 5s and delete all enemy shots.',
    hp: 3, speed: 270, fire: .14, dmg: 1, shots: 1, spread: .13, bspeed: 860, life: .8, pierce: 0, clean: .6 },
  refactorer: { name: 'REFACTORER', role: 'TANK', desc: 'Close-range shotgun, 4 HP, slower. Heals less.', skill: 'REWRITE', skillDesc: 'Shockwave: wipes rot and blasts bugs away.', cd: 8,
    sup: 'RM -RF', supDesc: 'Nuke: wipe every bug and all rot. Bosses lose 25% HP.',
    caps: { fire: 2, speed: 2, shots: 1 }, halfHeal: true,
    hp: 4, speed: 235, fire: .42, dmg: 1, shots: 6, spread: .11, bspeed: 760, life: .38, pierce: 0, clean: 1 },
  hacker: { name: 'HACKER', role: 'SPEED', desc: 'Fast, rapid fire, only 2 HP.', skill: 'BLINK', skillDesc: 'Teleport toward your aim, cleaning the path.', cd: 3.5,
    sup: 'ZERO DAY', supDesc: 'Release 36 homing exploits that hunt bugs down.',
    hp: 2, speed: 330, fire: .075, dmg: .6, shots: 1, spread: .08, bspeed: 980, life: .6, pierce: 0, clean: .4 },
  sysadmin: { name: 'SYSADMIN', role: 'SUPPORT', desc: 'Revives teammates 2x faster. Slow super charge.', skill: 'DEPLOY TURRET', skillDesc: 'Drop an auto-turret for 10s.', cd: 14,
    sup: 'FAILOVER', supDesc: 'Revive and fully heal ONE teammate (whoever needs it most), plus 3 turrets.',
    charge: .6,
    hp: 3, speed: 265, fire: .16, dmg: 1, shots: 1, spread: .13, bspeed: 860, life: .8, pierce: 0, clean: .6 },
  qa: { name: 'QA TESTER', role: 'SNIPER', desc: 'Slow railgun that pierces 3 bugs.', skill: 'STRESS TEST', skillDesc: 'Triple fire rate for 3s.', cd: 11,
    sup: 'LOAD TEST', supDesc: '6s of auto-aimed 4x fire rate rails that pierce everything.',
    caps: { fire: 2, speed: 2 },
    hp: 3, speed: 260, fire: .45, dmg: 4, shots: 1, spread: 0, bspeed: 1500, life: .9, pierce: 3, clean: .8 },
  devops: { name: 'DEVOPS', role: 'SUMMONER', desc: 'Weak gun, but containers hunt bugs for you. 3 HP.', skill: 'SPIN UP', skillDesc: 'Launch a container that hunts bugs for 20s (max 3).', cd: 6,
    sup: 'KUBERNETES', supDesc: 'Deploy 6 fast containers for 10s.',
    hp: 3, speed: 265, fire: .28, dmg: .7, shots: 1, spread: .1, bspeed: 820, life: .7, pierce: 0, clean: .6 }};
const CK = Object.keys(CLASSES);
const upgCap = (cls, k) => Math.min(UPG_MAX[k] || 99, ((CLASSES[cls] || {}).caps || {})[k] || 99);
const SHAPES = { // ship outlines, nose pointing +x
  debugger: [[21, 0], [-12, -14], [-5, 0], [-12, 14]],
  refactorer: [[18, -9], [18, 9], [-12, 16], [-6, 0], [-12, -16]],
  hacker: [[27, 0], [-10, -9], [-4, 0], [-10, 9]],
  sysadmin: [[20, 0], [5, -14], [-12, -10], [-6, 0], [-12, 10], [5, 14]],
  qa: [[29, 0], [2, -5], [-10, -14], [-6, 0], [-10, 14], [2, 5]],
  devops: [[18, -8], [18, 8], [6, 14], [-12, 10], [-6, 0], [-12, -10], [6, -14]]};

// ---------- shop (meta progression, bought with commits; save + effects in state.js / player.js) ----------
// Debugger + Hacker are free. Sandbox can play every class.
const CLASS_COST = { refactorer: 40, sysadmin: 50, qa: 60, devops: 75 };
// Per-class stat boosts: [name, effect per level, max level, base cost]. Each level costs 1.7x the last.
const STATUP = {
  hp: ['UNIT TESTS+', '+1 max HP', 2, 40], dmg: ['OPTIMIZER', '+12% damage', 5, 15], fire: ['FAST CI', '+8% fire rate', 5, 15],
  speed: ['LOW LATENCY', '+5% move speed', 3, 10], dash: ['MACROS', '-10% dash cooldown', 3, 10], charge: ['CAPACITOR', '+12% super charge', 4, 12]};
// Shared perks, same format.
const PERKS = {
  head: ['HEAD START', '+1 upgrade pick at the start of each run', 2, 40],
  reroll: ['GIT STASH', '+1 upgrade reroll per run (R)', 3, 20],
  warm: ['WARM CACHE', 'start each run with +25% super', 2, 25]};
const metaCost = (base, lv) => Math.round(base * Math.pow(1.7, lv));
// One alternative skill + super per class: [name, description, skill cooldown]. Bought once, then equipped in the shop.
// Each one is a mechanic no other class has: debugger = time, refactorer = absorb/pull, hacker = exploits/routing,
// sysadmin = team sustain, qa = precision, devops = commanding containers.
const ALT_COST = { skill: 50, sup: 75 };
const ALTS = {
  debugger: { skill: ['WATCH EXPRESSION', 'Tag the bug you aim at: it takes 2x damage from you for 6s.', 9],
    sup: ['REWIND', 'Jump back to where you were 4s ago, with the HP you had then.'] },
  refactorer: { skill: ['EXTRACT METHOD', 'Pull nearby bugs into a tight cluster in front of your shotgun.', 7],
    sup: ['TECH DEBT', '8s: every hit is absorbed, then paid back as one big shockwave.'] },
  hacker: { skill: ['BACKDOOR', 'Plant a backdoor, then use it again within 8s to teleport back.', 6],
    sup: ['MAN IN THE MIDDLE', '7s: enemy shots that get close flip sides and hunt bugs.'] },
  sysadmin: { skill: ['HEALTH CHECK', 'Drop a beacon: devs inside regain 1 HP every 3s for 12s.', 16],
    sup: ['MAINTENANCE WINDOW', 'Shield every dev in the room for 6s.'] },
  qa: { skill: ['EDGE CASE', 'Your next shot is a wide 6x rail that pierces everything.', 6],
    sup: ['SMOKE TEST', '7s: every bug you kill fires a rail at the next nearest bug.'] },
  devops: { skill: ['ROUTE TRAFFIC', 'Every container rushes the bug you aim at for 4s, hitting 2x.', 8],
    sup: ['CHAOS MONKEY', 'Every container explodes, then 3 fresh ones deploy.'] }};

// Difficulty multipliers. The host's pick applies to the whole room.
// hp/sp = enemy health/speed, count = enemies per wave, rot = rot spread + breeding, fire = enemy attack cooldown, score = points.
const DIFFS = {
  easy: { name: 'EASY', desc: 'Slower, weaker bugs and lazy rot. Points x0.75.', hp: .85, sp: .92, count: .9, rot: .75, fire: 1.2, score: .75, col: '#5dffa8' },
  normal: { name: 'NORMAL', desc: 'The intended experience.', hp: 1.2, sp: 1.06, count: 1.2, rot: 1.15, fire: .85, score: 1, col: '#3ef0ff' },
  hard: { name: 'HARD', desc: 'Tougher, faster, more bugs. Points x1.5.', hp: 1.65, sp: 1.18, count: 1.55, rot: 1.5, fire: .62, score: 1.5, col: '#ff9f43' },
  nightmare: { name: 'NIGHTMARE', desc: 'Prod is on fire. Points x2.2.', hp: 2.3, sp: 1.32, count: 1.95, rot: 1.9, fire: .45, score: 2.2, col: '#ff3b5c' }};
const DK = Object.keys(DIFFS);
// Mutators: the host's picks apply to the whole room and stack. score multiplies points.
const MUTS = {
  glass: { name: 'ONE-HIT WONDER', desc: '1 max HP, no UNIT TESTS', score: 1.6 },
  legacy: { name: 'LEGACY CODEBASE', desc: 'rot spreads and breeds 2x', score: 1.3 },
  rush: { name: 'BOSS RUSH', desc: 'every wave is a boss', score: 1.5 },
  turbo: { name: 'TURBO', desc: 'bugs 30% faster, spawn faster', score: 1.3 },
  loot: { name: 'LOOT BOXES', desc: '3x drops, bugs 25% tougher', score: 1 }};
const MK = Object.keys(MUTS);
// Cosmetic ship skins, unlocked by lifetime stats (summed over every class and difficulty, see state.js).
const SKINS = [
  { id: 'none', name: 'STOCK', need: 'always unlocked', ok: () => true },
  { id: 'binary', name: 'BINARY TRAIL', need: 'beat any boss', ok: s => s.bosses >= 1 },
  { id: 'halo', name: 'NEON HALO', need: 'reach wave 10', ok: s => s.wave >= 10 },
  { id: 'rainbow', name: 'RGB TRAIL', need: '1,000 total kills', ok: s => s.kills >= 1000 },
  { id: 'gold', name: 'GOLD PLATING', need: 'reach wave 10 on NIGHTMARE', ok: s => s.nightmare >= 10 }];
const AUTO_SKIP_SCORE = 1.25; // wave skip: the next wave starts as soon as the current one stops spawning (never mid-boss)
const WAVE_HP = .06; // every bug gets +6% HP per wave, so late waves need upgrades

const WAVES = ['HELLO WORLD', 'NULL POINTER', 'MERGE CONFLICT', 'MEMORY LEAK', null, 'RACE CONDITION', 'FRIDAY DEPLOY',
  'PROD IS DOWN', 'SPAGHETTI', null, 'NPM INSTALL', 'IT WORKED YESTERDAY'];
const isBossWave = w => w > 0 && w % 5 === 0;
const bossIdx = w => (Math.max(1, Math.floor(w / 5)) - 1) % BOSSES.length;
const bossOf = w => BOSSES[bossIdx(w)];
const bossName = w => bossOf(w).name;
const waveName = w => isBossWave(w) ? bossName(w) : WAVES[(Math.max(1, w) - 1) % WAVES.length] || 'OVERTIME';
