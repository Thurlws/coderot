'use strict';
// Admin sandbox: a solo-only playground. Spawn any enemy or boss, jump to any wave, swap classes on the fly,
// drop power-ups and toggle cheats. Scores from the sandbox are never saved. ` (backquote) shows/hides the panel.

let adminMode = false, admSkin0 = mySkin;
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
function admSetWeapon(k) { // sandbox: any weapon, owned or not (your MK level if you own it)
  const W = WEAPONS[k];
  me.wp = k; me.mk = world.meta !== false ? clamp(META.wp.own[k] || 1, 1, BAL.wpn.mkMax) : 1;
  me.wdmg = 1 + BAL.stat.weapon * (me.at[W.attr] - BAL.attr.start) + BAL.wpn.mkDmg * (me.mk - 1);
  for (const u in me.up) me.up[u] = Math.min(me.up[u], upgCap(k, u)); // respect the new weapon's caps
  ring(me.x, me.y, 10, 300, .4, PCOL[myColor], 5); pop(me.x, me.y - 50, W.name, PCOL[myColor], 18);
}
function admSetAbil(k) { // sandbox: any skill / super, unlocked or not
  const A = ABIL[k]; me.ab[A.k] = k;
  if (A.k === 'skill') me.skillCd = 0; else { me.superT = 0; me.noCharge = 0; me.stress = 0; }
  pop(me.x, me.y - 50, A.name, PCOL[myColor], 16);
}
function admSpawn(type) {
  for (let i = 0; i < ADM.count; i++) {
    const a = rand(0, 6.283), d = rand(220, 360);
    const B = bounds(); spawnBug(type, clamp(me.x + Math.cos(a) * d, B.x + 20, B.x + B.w - 20), clamp(me.y + Math.sin(a) * d, B.y + 20, B.y + B.h - 20));
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
  ring(cam.x + W / 2, cam.y + H / 2, 20, 1400, .7, PAL.white, 8); flash = .5; flashCol = '244,241,255';
  popS(W / 2, H / 2, 'ALL CODEROT CLEARED', PAL.white, 22);
}
function admPow(type) { const B = bounds(); world.pows.push({ id: world.nid++, type, x: clamp(me.x + rand(-60, 60), B.x + 30, B.x + B.w - 30), y: clamp(me.y - 70, B.y + 30, B.y + B.h - 30), t: 30 }); }
function admMaxUpgrades() { for (const k in UPG) me.up[k] = Math.max(me.up[k], Math.min(upgCap(me.wp, k), 3)); me.mh = BAL.player.hp + cwMod('hp') + me.up.hp; me.hp = me.mh; }

function buildAdmin() {
  if (!adminMode) return;
  admEl.textContent = '';
  const head = document.createElement('p'); head.className = 'note';
  head.textContent = 'SANDBOX · scores are not saved · ` hides this panel';
  admEl.appendChild(head);
  admSection('WORLD CONTROL',
    admBtn(ADM.noSpawns ? 'SPAWNS: PAUSED' : 'SPAWNS: ON', () => { ADM.noSpawns = !ADM.noSpawns; }, !ADM.noSpawns, ADM.noSpawns ? PAL.gold : '#1DED83'),
    admBtn(ADM.freeze ? 'WORLD: FROZEN' : 'WORLD: RUNNING', () => { ADM.freeze = !ADM.freeze; }, ADM.freeze, ADM.freeze ? PAL.ice : '#1DED83'),
    admBtn('CLEAR ALL CODEROT', admClearAll, undefined, PAL.rot));
  admSection('WEAPON', ...WK.map(k => admBtn(WEAPONS[k].name, () => admSetWeapon(k), k === me.wp))); // try any weapon / skill / super / skin, owned or not
  for (const t of ['skill', 'sup'])
    admSection(t === 'skill' ? 'SKILL' : 'SUPER', ...Object.keys(ABIL).filter(k => ABIL[k].k === t).map(k => admBtn(ABIL[k].name, () => admSetAbil(k), me.ab[t] === k)));
  admSection('SKIN', ...SKINS.map(s => admBtn(s.name, () => { mySkin = s.id; }, mySkin === s.id, PAL.gold)));
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
  admSection('WORLD', admBtn('CLEAR ROT', () => rot.fill(0)), admBtn('ROT 50%', () => { rot.fill(0); for (const k of shuffle([...rot.keys()]).slice(0, Math.round(NC * ROT_LIMIT / 2))) rot[k] = 1; calcRot(); }),
    admBtn('POPUP STORM', () => smear(6)), admBtn('CLEAR POPUPS', () => { smudges = []; }));
  admSection('GAME SPEED', ...[.25, .5, 1, 2].map(s => admBtn(s + 'x', () => { ADM.speed = s; }, ADM.speed === s)));
}
function admTick() { // cheats, applied every frame after the player update
  if (ADM.god) { me.down = false; me.hp = me.mh; }
  if (ADM.infSuper && me.superT <= 0) me.sup = 100;
  if (ADM.noCd) { me.skillCd = 0; me.dashCd = 0; }
}
function setAdmin(on) {
  if (on && !adminMode) admSkin0 = mySkin; else if (!on && adminMode) mySkin = admSkin0; // sandbox skin picks don't stick
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
