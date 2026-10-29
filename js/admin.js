'use strict';
// Admin sandbox: a solo-only playground. Spawn any enemy or boss, jump to any wave, swap classes on the fly,
// drop power-ups and toggle cheats. Scores from the sandbox are never saved. ` (backquote) shows/hides the panel.

let adminMode = false;
const ADM = { god: false, infSuper: false, noCd: false, noSpawns: true, freeze: false, speed: 1, count: 1 };
const admHoldSpawns = () => adminMode && ADM.noSpawns; // no wave spawns, no rot breeding, no wave advancing
const admEl = document.getElementById('admin'), admToggle = document.getElementById('admintoggle');

function admSection(title, ...kids) {
  const s = document.createElement('section');
  const h = document.createElement('h3'); h.textContent = title;
  const g = document.createElement('div'); g.className = 'grid'; g.append(...kids);
  s.append(h, g); admEl.appendChild(s);
}
function admBtn(label, fn, on, col) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  if (on !== undefined) b.setAttribute('aria-pressed', String(!!on));
  if (col) b.style.setProperty('--c', col);
  b.onclick = () => { fn(); b.blur(); buildAdmin(); }; // blur so Space (shoot) can't re-press it
  return b;
}
function admToggleBtn(key, label) { return admBtn(label + (ADM[key] ? ': ON' : ': OFF'), () => { ADM[key] = !ADM[key]; }, ADM[key]); }

// ---------- actions ----------
function admSetClass(k) {
  const K = CLASSES[k];
  myClass = k; me.cls = k; me.m = metaLv(k, world.meta); me.alt = equipped(k); minions = [];
  for (const u in me.up) me.up[u] = Math.min(me.up[u], upgCap(k, u)); // respect the new class's caps
  me.mh = K.hp + me.up.hp + me.m.hp; me.hp = me.mh; me.down = false;
  me.skillCd = 0; me.superT = 0; me.noCharge = 0; me.stress = 0;
  ring(me.x, me.y, 10, 300, .4, PCOL[myColor], 5); pop(me.x, me.y - 50, K.name, PCOL[myColor], 18);
}
function admSpawn(type) {
  for (let i = 0; i < ADM.count; i++) {
    const a = rand(0, 6.283), d = rand(220, 360);
    spawnBug(type, clamp(me.x + Math.cos(a) * d, 20, W - 20), clamp(me.y + Math.sin(a) * d, 80, H - 20));
  }
}
function admBoss(i) {
  for (const b of world.bugs) if (b.type === 'boss' || BUG[b.type].part) b.dead = true;
  world.dep = [];
  spawnBug('boss', null, null, i);
  banner = { t: 3, big: BOSSES[i].name, sub: 'SPAWNED · ' + BOSSES[i].desc }; glitch = .5;
}
function admWave(n) {
  n = clamp(Math.round(num(n, 1)), 1, 999);
  world.bugs = []; world.shots = []; world.queue = []; world.breakT = 0; world.wave = n - 1;
  world.phase = 'play'; me.down = false; me.hp = me.mh; // also works from the game-over screen
  seen.cleared = true; // no skip bonus for admin jumps
  nextWave();
}
function admKillAll() { for (const b of world.bugs) if (!b.dead) killBug(b, false); world.shots = []; world.dep = []; }
function admClearAll() { // every bug (bosses too), enemy shot, rot tile and popup, plus anything still queued to spawn
  admKillAll(); world.queue = []; rot.fill(0); smudges = [];
  ring(W / 2, H / 2, 20, 1400, .7, PAL.white, 8); flash = .5; flashCol = '244,241,255';
  pop(W / 2, H / 2, 'ALL CODEROT CLEARED', PAL.white, 22);
}
function admPow(type) { world.pows.push({ id: world.nid++, type, x: clamp(me.x + rand(-60, 60), 30, W - 30), y: clamp(me.y - 70, 80, H - 30), t: 30 }); }
function admMaxUpgrades() { for (const k in UPG) me.up[k] = Math.max(me.up[k], Math.min(upgCap(me.cls, k), 3)); me.mh = CLASSES[me.cls].hp + me.up.hp + me.m.hp; me.hp = me.mh; }

function buildAdmin() {
  if (!adminMode) return;
  admEl.textContent = '';
  const head = document.createElement('p'); head.className = 'note';
  head.textContent = 'SANDBOX · scores are not saved · ` hides this panel';
  admEl.appendChild(head);
  admSection('WORLD CONTROL',
    admBtn(ADM.noSpawns ? 'SPAWNS: PAUSED' : 'SPAWNS: ON', () => { ADM.noSpawns = !ADM.noSpawns; }, !ADM.noSpawns, ADM.noSpawns ? PAL.gold : '#5dffa8'),
    admBtn(ADM.freeze ? 'WORLD: FROZEN' : 'WORLD: RUNNING', () => { ADM.freeze = !ADM.freeze; }, ADM.freeze, ADM.freeze ? PAL.ice : '#5dffa8'),
    admBtn('CLEAR ALL CODEROT', admClearAll, undefined, PAL.rot));
  admSection('CLASS', ...CK.map(k => admBtn(CLASSES[k].name, () => admSetClass(k), k === me.cls)));
  admSection('SPAWN AMOUNT', ...[1, 5, 10, 25].map(n => admBtn('x' + n, () => { ADM.count = n; }, ADM.count === n)));
  admSection('SPAWN ENEMY', ...BT.filter(t => t !== 'boss' && !BUG[t].part).map(t => admBtn(BUG[t].name, () => admSpawn(t), undefined, BUG[t].col)));
  admSection('SPAWN BOSS', ...BOSSES.map((B, i) => admBtn(B.name, () => admBoss(i), undefined, B.col)));
  const waveIn = document.createElement('input'); waveIn.type = 'number'; waveIn.min = 1; waveIn.max = 999; waveIn.value = Math.max(1, world.wave);
  waveIn.setAttribute('aria-label', 'Wave number');
  waveIn.onkeydown = e => { if (e.key === 'Enter') { admWave(waveIn.value); buildAdmin(); } };
  admSection('WAVE (NOW ' + world.wave + ')', waveIn, admBtn('GO', () => admWave(waveIn.value)), admBtn('NEXT', () => admWave(world.wave + 1)),
    admBtn('NEXT BOSS', () => admWave((Math.floor(world.wave / 5) + 1) * 5)), admBtn('KILL ALL', admKillAll));
  admSection('POWER-UPS', ...PT.map(p => admBtn(POW[p].label, () => admPow(p), undefined, POW[p].col)));
  admSection('CHEATS', admToggleBtn('god', 'GOD MODE'), admToggleBtn('infSuper', 'INFINITE SUPER'), admToggleBtn('noCd', 'NO COOLDOWNS'));
  admSection('PLAYER', admBtn('FULL SUPER', () => { me.sup = 100; }), admBtn('HEAL', () => { me.down = false; me.hp = me.mh; }),
    admBtn('+1 UPGRADE PICK', () => { me.picks++; }), admBtn('MAX UPGRADES', admMaxUpgrades), admBtn('+10,000 SCORE', () => { me.score += 10000; }));
  admSection('WORLD', admBtn('CLEAR ROT', () => rot.fill(0)), admBtn('ROT 50%', () => { for (let k = 0; k < NC; k++) if (Math.random() < .5) rot[k] = 1; }),
    admBtn('POPUP STORM', () => smear(6)), admBtn('CLEAR POPUPS', () => { smudges = []; }));
  admSection('GAME SPEED', ...[.25, .5, 1, 2].map(s => admBtn(s + 'x', () => { ADM.speed = s; }, ADM.speed === s)));
}
function admTick() { // cheats, applied every frame after the player update
  if (ADM.god) { me.down = false; me.hp = me.mh; }
  if (ADM.infSuper && me.superT <= 0) me.sup = 100;
  if (ADM.noCd) { me.skillCd = 0; me.dashCd = 0; }
}
function setAdmin(on) {
  adminMode = on; admToggle.hidden = !on; admEl.hidden = !on;
  Object.assign(ADM, { god: false, infSuper: false, noCd: false, noSpawns: true, freeze: false, speed: 1, count: 1 }); // sandbox starts calm
  if (on) buildAdmin();
}
function playSandbox() { playSolo(); setAdmin(true); }
admToggle.onclick = () => { admEl.hidden = !admEl.hidden; if (!admEl.hidden) buildAdmin(); admToggle.blur(); };
addEventListener('keydown', e => {
  if (e.code === 'Backquote' && adminMode && e.target.tagName !== 'INPUT') { admEl.hidden = !admEl.hidden; if (!admEl.hidden) buildAdmin(); }
});
document.getElementById('sandbox').onclick = playSandbox;
