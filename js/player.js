'use strict';
// The local player: weapon, skill, super, dash, power-ups, upgrades, getting hurt, and reacting to world events.

const myW = () => WEAPONS[me.wp] || WEAPONS.pulse; // the equipped weapon (CHARACTER > INVENTORY)
// The equipped skill (E) and super (Q): any ABIL you unlocked with its perk.
const skillName = () => ABIL[me.ab.skill].name;
const skillCdBase = () => ABIL[me.ab.skill].cd;
const supName = () => ABIL[me.ab.sup].name;
const myDmg = () => (1 + .3 * me.up.dmg) * me.wdmg * (cwOn('berserk') ? 1.6 : 1) * (1 + cwMod('dmg')); // STRICT MODE x weapon (attribute + MK) x BERSERK x cyberware
// SMARTCURVE: accuracy = the share of your shots that go smart and curve into a bug inside the lock zone (45% .. 90%, never 100%).
// SMARTCURVE ZONE: the size of that lock zone around your aim point (2 levels). TARGET LINK and the SMART SPRAYER add accuracy levels.
// All of it in BAL.smart (config.js).
const smartLv = () => Math.min(BAL.smart.maxLv, me.up.homing + cwMod('home') + (myW().smart || 0));
const smartAcc = (l = smartLv()) => (l > 0 ? BAL.smart.accBase + BAL.smart.accStep * l : 0);
const smartR = () => (smartLv() > 0 ? (BAL.smart.zone + BAL.smart.zoneStep * me.up.zone) * (me.syn.lsp ? 2 : 1) : 0);
const mouseW = () => ({ x: mouse.x + cam.x, y: mouse.y + cam.y }); // the cursor on the map
const loadTest = () => me.superT > 0 && me.supK === 'load';
const timedSuper = (t, k) => { me.superT = me.superMax = t; me.supK = k; };
const supOn = k => me.superT > 0 && me.supK === k;

function hurt(src, gunk) {
  if (supOn('debt')) { // TECH DEBT: the hit goes on the tab instead
    me.debt = Math.min(10, me.debt + 1); me.inv = .5; ring(me.x, me.y, 30, -40, .3, PAL.rot, 4); pop(me.x, me.y - 44, 'DEBT +1', PAL.rot, 14); cue('deflect', .7);
    return;
  }
  if (Math.random() < cwMod('deflect')) { me.inv = .6; cue('deflect'); ring(me.x, me.y, 22, 90, .3, PAL.cyan, 3); pop(me.x, me.y - 44, 'DEFLECTED', PAL.cyan, 16); return; } // CHECKSUM GUARD / MIRROR COAT
  if (hasCw('lattice') && me.latW !== world.wave) { // ABLATIVE LATTICE: first hit of the wave bounces off
    me.latW = world.wave; me.inv = 1; cue('deflect'); ring(me.x, me.y, 22, 90, .3, PAL.cyan, 3); pop(me.x, me.y - 44, 'DEFLECTED', PAL.cyan, 16); return;
  }
  me.hp--; me.inv = 1.3 * (1 + cwMod('inv')); me.chain = 0; shake = Math.max(shake, 14); flash = .7; flashCol = '255,40,80'; glitch = Math.max(glitch, .3);
  const a = Math.atan2(me.y - src.y, me.x - src.x); me.vx = Math.cos(a) * 650; me.vy = Math.sin(a) * 650;
  burst(me.x, me.y, PCOL[myColor], 18); cue(me.hp <= 1 ? 'hurtbig' : 'hurt');
  if (gunk) { smear(gunk); pop(me.x, me.y - 44, 'ADWARE!', BUG.adware.col, 16); }
  if (hasCw('reactive')) { // REACTIVE PLATING
    for (const b of world.bugs) if (targetable(b) && Math.hypot(b.x - me.x, b.y - me.y) < 160 + b.r) {
      damageBug(b, 4 * myDmg()); if (b.type !== 'boss' && !isPart(b)) { const a = Math.atan2(b.y - me.y, b.x - me.x); b.x += Math.cos(a) * 60; b.y += Math.sin(a) * 60; }
    }
    ring(me.x, me.y, 10, 700, .3, PAL.gold, 5); cue('emp', .55);
  }
  if (me.hp <= 0 && me.cp.rp && me.rpW !== world.wave) { // RESTORE POINT (sysadmin): once per wave
    me.rpW = world.wave; me.hp = 1; me.inv = 2; cue('secondheart', .8); ring(me.x, me.y, 10, 400, .5, PAL.green, 5); pop(me.x, me.y - 50, 'RESTORE POINT · 1 HP', PAL.green, 16); return;
  }
  if (me.hp <= 0 && hasCw('heart') && !me.heartUsed) { // BACKUP BOOTLOADER
    me.heartUsed = true; me.hp = me.mh; me.inv = 2.5; cue('secondheart'); flash = .8; flashCol = '29,237,131'; chroma = Math.max(chroma, .5);
    ring(me.x, me.y, 10, 600, .6, PAL.green, 6); pop(me.x, me.y - 50, 'BACKUP BOOTLOADER · REBOOTED', PAL.green, 18); return;
  }
  if (me.hp === 1 && me.mh > 1 && hasCw('panic') && me.panW !== world.wave && !(dil > 0)) { // PANIC INTERRUPT: 2s of dilation
    me.panW = world.wave; dil = 2; dilK = .2; dilOff = 'kerenz_off'; cue('kerenz_on'); cue('focus_on', .6); chroma = Math.max(chroma, .5); pop(me.x, me.y - 80, 'PANIC INTERRUPT', PAL.cyan, 14);
  }
  if (me.hp === 1 && me.mh > 1 && hasCw('bio') && me.bioW !== world.wave) { // WATCHDOG TIMER
    me.bioW = world.wave; me.hp = 2; cue('heal'); ring(me.x, me.y, 10, 260, .4, PAL.green, 4); pop(me.x, me.y - 64, 'WATCHDOG · +1 HP', PAL.green, 14);
  }
  if (me.hp <= 0) { me.down = true; me.rev = 0; endDil(true); pop(me.x, me.y - 44, 'DEV DOWN!', PAL.rot, 20); cue('death'); glitch = Math.max(glitch, .6); }
}
function grabPow(w) {
  const P = POW[w.type]; w.taken = true; gone.set(w.id, T);
  if (!isHost) pend.e.push(['g', w.id]);
  pop(w.x, w.y - 24, P.label + '!', P.col, 18); cue({ patch: 'heal', cell: 'lootepic', sudo: 'lootepic', firewall: 'deflect', duck: 'link', stash: 'money' }[w.type] || 'loot');
  ring(w.x, w.y, 6, 260, .35, P.col);
  const pl = 1 + cwMod('pw');
  if (w.type === 'sudo' || w.type === 'coffee') me.pw[w.type] = 8 * pl;
  if (w.type === 'firewall') me.pw.firewall = 7 * pl;
  if (w.type === 'duck') me.pw.duck = 14 * pl;
  if (w.type === 'patch') { if (me.hp < me.mh) me.hp++; else me.score += 250; }
  if (w.type === 'stash') { const k = world.wave; earn(BAL.eco.stash[0] + BAL.eco.stash[1] * k, BAL.xp.stash[0] + BAL.xp.stash[1] * k, w.x, w.y - 44, 'DATA STASH'); }
  if (w.type === 'cell') me.sup = Math.min(100, me.sup + 30);
  if (w.type === 'adblock') smudges = [];
  if (w.type === 'revert') {
    ring(w.x, w.y, 10, 900, .45, PAL.white, 6); shake = 20; hitstop = .05; flash = .3; flashCol = '237,231,230'; cue('emp');
    if (isHost) doRevert(w.x, w.y); else { pend.e.push(['v', w.x | 0, w.y | 0]); discCells(w.x, w.y, 300, k => cleanCell(k, 1)); }
  }
}
// ---------- supers: the equipped one (ABIL), charged by kills ----------
function fireSuper() {
  const A = ABIL[me.ab.sup], su = me.ab.sup, x = me.x, y = me.y, col = PCOL[myColor];
  me.sup = 0; me.noCharge = A.noCharge || 0; // kills made by a running super don't charge the next one
  banner = { t: 1.8, big: A.name, sub: A.desc };
  chroma = Math.max(chroma, .5); shake = Math.max(shake, 14);
  if (['rewind', 'debt', 'mitm', 'maint', 'smoke', 'chaos'].includes(su)) altSuper(su);
  else if (su === 'rmrf') { // the nuke
    const n = world.bugs.filter(b => !b.dead && b.type !== 'boss').length;
    me.score += n * 75; pop(x, y - 60, '+' + fmt(n * 75), PAL.gold, 22);
    if (isHost) doNuke(x, y); else pend.e.push(['n', x | 0, y | 0]);
  } else if (su === 'halt') {
    halt(x, y);
  } else if (su === 'zeroday') {
    for (let i = 0, n = 36 + 12 * (me.cp.mass || 0); i < n; i++) { // MASS EXPLOIT
      const a = i / n * 6.283;
      bullets.push({ x, y, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, life: 2.4, col, dmg: 2, pierce: 0, bounce: 1, home: 5, clean: .6, hits: new Set(), mine: true });
    }
    ring(x, y, 10, 700, .5, col, 6); glitch = .6; cue('quickhack'); cue('glitch', .7);
  } else if (su === 'failover') {
    const B = bounds(); for (let i = 0; i < 3; i++) { const a = i * 2.094; turrets.push({ x: clamp(x + Math.cos(a) * 70, B.x + 20, B.x + B.w - 20), y: clamp(y + Math.sin(a) * 70, B.y + 20, B.y + B.h - 20), t: 12, cd: 0 }); }
    turrets = turrets.slice(-5 - (me.cp.lb || 0));
    const id = failoverTarget();
    if (isHost) doFailover(id); else pend.e.push(['l', id]);
  } else if (su === 'loadtest') {
    timedSuper(6, 'load'); ring(x, y, 10, 500, .5, PAL.gold, 6); cue('overclock'); cue('lock', 1.5);
  } else if (su === 'kube') {
    timedSuper(10, 'kube'); for (let i = 0, n = 6 + 2 * (me.cp.auto || 0); i < n; i++) addMinion(10, true, n + 3 + (me.cp.rep || 0)); // AUTOSCALER
    ring(x, y, 10, 500, .5, col, 6); cue('drone_on'); cue('overclock', .8);
  }
}
function halt(x, y) { // SYSTEM HALT / LOCKDOWN: freeze everything, delete enemy shots
  for (let i = 0; i < 3; i++) ring(x, y, 10 + i * 40, 1300, .8, PAL.ice, 8 - i * 2);
  flash = .6; flashCol = '82,221,223'; cue('focus_on'); cue('emp', .6);
  for (const b of world.bugs) b.frz = b.type === 'boss' ? 2.5 : 5;
  for (const s of world.shots) { s.hit = true; gone.set(s.id, T); burst(s.x, s.y, PAL.ice, 4); }
  if (isHost) doHalt(); else pend.e.push(['h']);
}
function altShot(a, sp, o) { // a shot fired by an alt ability; o overrides damage, pierce, life...
  bullets.push({ x: me.x, y: me.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: .9, col: PCOL[myColor], dmg: myDmg(), pierce: 0, bounce: 0, home: 0,
    clean: .6, hits: new Set(), mine: true, ...o, ...(o.dmg ? { dmg: o.dmg * myDmg() } : {}) });
}
// DEVOPS containers: local like turrets, they chase the nearest bug and chew on it. cap = most alive at once (oldest gets replaced).
function addMinion(life, fast, cap) {
  while (minions.length >= cap) minions.shift();
  minions.push({ x: me.x + rand(-20, 20), y: me.y + rand(-20, 20), t: life, fast });
}
function aimTarget() { // the bug closest to where you're aiming (WATCH EXPRESSION, ROUTE TRAFFIC)
  let best = null, bs = Infinity;
  for (const b of world.bugs) {
    if (!targetable(b)) continue;
    const s = Math.hypot(b.x - me.x, b.y - me.y) * (1 + 3 * Math.abs(angleDiff(me.a, Math.atan2(b.y - me.y, b.x - me.x))));
    if (s < bs) { bs = s; best = b; }
  }
  return best;
}
function altSkill(sk) {
  const x = me.x, y = me.y, col = PCOL[myColor];
  if (sk === 'watch') { // WATCH EXPRESSION
    const b = aimTarget(); if (!b) { me.skillCd = .5; return pop(x, y - 30, 'NOTHING TO WATCH', PAL.dim, 12); }
    me.watch = { id: b.id, t: T + 6 }; ring(b.x, b.y, b.r + 30, -40, .4, PAL.ice, 3); pop(b.x, b.y - b.r - 20, 'WATCHED · 2x', PAL.ice, 14);
  }
  if (sk === 'extract') { // EXTRACT METHOD: the opposite of REWRITE
    ring(x, y, 320, -700, .4, PAL.white, 6); shake = Math.max(shake, 10);
    if (isHost) doExtract(x, y); else pend.e.push(['x', x | 0, y | 0]);
  }
  if (sk === 'backdoor') { // BACKDOOR: plant, then recall
    if (me.door && me.door.t > T) {
      ring(x, y, 30, -60, .3, col); me.x = me.door.x; me.y = me.door.y; me.vx = me.vy = 0; me.inv = Math.max(me.inv, .5); me.trail = []; me.door = null;
      ring(me.x, me.y, 6, 300, .3, col); cue('warp');
    } else { me.door = { x, y, t: T + 8 }; me.skillCd = .4; pop(x, y - 30, 'BACKDOOR PLANTED · E TO RETURN', col, 12); }
  }
  if (sk === 'health') { beacons = [{ x, y, t: 12 }]; ring(x, y, 6, 240, .5, '#1DED83'); } // HEALTH CHECK
  if (sk === 'edge') { me.edge = true; pop(x, y - 30, 'NEXT SHOT: EDGE CASE', PAL.gold, 12); } // EDGE CASE
  if (sk === 'route') { // ROUTE TRAFFIC
    const b = aimTarget(); if (!b || !minions.length) { me.skillCd = .5; return pop(x, y - 30, minions.length ? 'NO TARGET' : 'NO CONTAINERS', PAL.dim, 12); }
    me.route = { id: b.id, t: T + 4 }; ring(b.x, b.y, b.r + 30, -40, .4, col, 3);
  }
  ring(x, y, 10, 300, .35, col, 4); cue('link');
}
function altSuper(su) {
  const x = me.x, y = me.y, col = PCOL[myColor];
  if (su === 'rewind') { // REWIND: only undoes the last 4s, so it saves you from a mistake rather than healing up
    const h = me.hist[0] || { x, y, hp: me.hp };
    ring(x, y, 40, -80, .4, PAL.ice, 4); me.x = h.x; me.y = h.y; me.vx = me.vy = 0; me.hp = Math.max(me.hp, h.hp); me.inv = Math.max(me.inv, 1);
    me.trail = []; me.hist = []; flash = .3; flashCol = '143,227,255'; glitch = Math.max(glitch, .5);
  }
  if (su === 'debt') { timedSuper(8, 'debt'); me.debt = 0; }
  if (su === 'mitm') timedSuper(7, 'mitm');
  if (su === 'maint') { if (isHost) doShieldAll(); else pend.e.push(['m']); }
  if (su === 'smoke') timedSuper(7, 'smoke');
  if (su === 'chaos') { // CHAOS MONKEY
    for (const n of minions) {
      ring(n.x, n.y, 6, 260, .35, col, 4); burst(n.x, n.y, col, 14, true);
      for (const b of world.bugs) if (targetable(b) && Math.hypot(b.x - n.x, b.y - n.y) < 110 + b.r) damageBug(b, 5 * myDmg() * me.summ);
      discCells(n.x, n.y, 110, k => cleanCell(k, 1));
    }
    minions = []; for (let i = 0; i < 3; i++) addMinion(20, false, 3); cue('cyberexpl');
  }
  ring(x, y, 10, 500, .5, col, 6); cue('overclock');
}
const myNetId = () => (online() ? peer.id : 'me');
// FAILOVER saves one teammate: a downed one first (closest), otherwise the most hurt. Alone, it heals you.
function failoverTarget() {
  let best = null, score = Infinity;
  for (const o of others.values()) {
    const s = o.d ? Math.hypot(o.x - me.x, o.y - me.y) - 1e6 : o.hp / o.mh;
    if (s < score && (o.d || o.hp < o.mh)) { score = s; best = o.id; }
  }
  return best || myNetId();
}
function failoverFx() { // runs on the one dev FAILOVER picked
  if (me.down) { me.down = false; me.rev = 0; }
  me.hp = me.mh; me.inv = Math.max(me.inv, 1.5);
  ring(me.x, me.y, 10, 400, .6, '#1DED83', 6); flash = .4; flashCol = '93,255,168';
  pop(me.x, me.y - 50, 'RESTORED', PAL.green, 20); cue('reboot');
}
function nukeFx(x, y) {
  flash = 1.4; flashCol = '255,250,235'; shake = 34; hitstop = .14; glitch = 1; chroma = 1.2;
  for (let i = 0; i < 4; i++) ring(x, y, 10 + i * 30, 1400 + i * 300, .9, i % 2 ? PAL.rot : PAL.white, 10 - i * 2);
  for (let i = 0; i < 6; i++) burst(cam.x + rand(0, W), cam.y + rand(0, H), PCOL[i % PCOL.length], 20, true, 600);
  smudges = [];
  cue('expl_l'); cue('cyberexpl', .8);
}

// ---------- weapons and skills ----------
function autoGun(x, y, col, range, dmg = 1) { // turrets and the duck: shoot the nearest bug
  let tgt = null, bd = range;
  for (const b of world.bugs) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd && targetable(b)) { bd = d; tgt = b; } }
  if (!tgt) return false;
  const a = Math.atan2(tgt.y - y, tgt.x - x);
  bullets.push({ x, y, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, life: .8, col, dmg: dmg * me.summ, pierce: 0, bounce: 0, home: 0, clean: .4, hits: new Set(), mine: true }); // TECH: drone damage
  cue('shot_turret', 1, rand(.95, 1.08), .07);
  return true;
}
function shoot(I) {
  const K = myW();
  const a = Math.atan2(me.fy, me.fx);
  const n = K.shots + me.up.shots + cwMod('shots') + (K.shots > 1 ? me.cp.args || 0 : 0) + (me.pw.sudo > 0 ? 2 : 0), sp = K.spread || .08, lt = loadTest(), edge = me.edge; // EXTRA ARGS: spread guns only
  me.edge = false;
  for (let i = 0; i < n; i++) {
    const e = edge && i === (n - 1) >> 1; // EDGE CASE: the middle shot
    const sm = Math.random() < smartAcc(), cr = Math.random() < cwMod('crit'), cm = cr ? 2 + cwMod('critx') : 1; // BRANCH PREDICTOR / THREAT SCANNER crits
    const s = (i - (n - 1) / 2) * sp + (K.jitter ? rand(-.04, .04) : 0), v = K.bspeed * (K.jitter ? rand(.85, 1.1) : 1);
    bullets.push({ x: me.x + Math.cos(a) * 18, y: me.y + Math.sin(a) * 18, vx: Math.cos(a + s) * v, vy: Math.sin(a + s) * v, life: K.life * (1 + .3 * me.up.range + cwMod('range')),
      col: e ? PAL.gold : PCOL[myColor], dmg: K.dmg * myDmg() * (e ? 6 : 1) * cm, crit: cr, pierce: K.pierce + me.up.pierce + cwMod('pierce') + (K.rail ? me.cp.pier || 0 : 0) + (lt || e ? 99 : 0), // FULL COVERAGE: rails only
      bounce: me.up.bounce + cwMod('bounce') + (K.bounce || 0), home: sm ? smartLv() : 0, smart: sm,
      clean: K.clean, rail: !!K.rail, wide: e ? 14 : 0, hits: new Set(), mine: true, link: hasCw('link') });
  }
  const mx = me.x + Math.cos(a) * 22, my = me.y + Math.sin(a) * 22, heavy = !!K.heavy;
  parts.push({ x: mx, y: my, vx: 0, vy: 0, life: .07, max: .07, col: PCOL[myColor], big: heavy ? 22 : 13 }); // muzzle bloom
  parts.push({ x: mx, y: my, vx: 0, vy: 0, life: .05, max: .05, col: '#fff', big: heavy ? 11 : 6 });
  for (let i = 0; i < (heavy ? 5 : 2); i++) { const sa = a + rand(-.5, .5), sv = rand(250, 600); parts.push({ x: mx, y: my, vx: Math.cos(sa) * sv, vy: Math.sin(sa) * sv, life: .12, max: .12, col: '#fff' }); }
  const kick = K.kick || 30;
  me.vx -= Math.cos(a) * kick; me.vy -= Math.sin(a) * kick;
  if (K.shake) shake = Math.max(shake, K.shake);
  cue(K.sfx, 1, rand(.96, 1.04), K.gap || .04);
}
function useSkill() {
  const sk = me.ab.skill, x = me.x, y = me.y;
  me.skillCd = skillCdBase() * Math.pow(.8, me.up.skill) * (1 - Math.min(.6, cwMod('skill')));
  pop(x, y - 50, skillName(), PCOL[myColor], 18);
  if (['watch', 'extract', 'backdoor', 'health', 'edge', 'route'].includes(sk)) altSkill(sk);
  else if (sk === 'breakpoint') {
    ring(x, y, 20, 700, .5, PAL.ice, 6); flash = .25; flashCol = '82,221,223'; cue('focus_on', .8);
    for (const b of world.bugs) if (!b.dead && Math.hypot(b.x - x, b.y - y) < 320) b.frz = 3;
    if (isHost) doFreeze(x, y); else pend.e.push(['f', x | 0, y | 0]);
  } else if (sk === 'rewrite') {
    ring(x, y, 20, 600, .4, PAL.white, 8); ring(x, y, 10, 400, .5, PCOL[myColor], 4); shake = 18; cue('superland');
    for (const b of world.bugs) if (targetable(b) && Math.hypot(b.x - x, b.y - y) < 220) damageBug(b, 4);
    if (isHost) doRewrite(x, y); else { pend.e.push(['w', x | 0, y | 0]); discCells(x, y, 220, k => cleanCell(k, 1)); }
  } else if (sk === 'blink') {
    const B = bounds(), hop = 260 * (1 + .25 * (me.cp.hop || 0)), tx = clamp(x + me.fx * hop, B.x + 16, B.x + B.w - 16), ty = clamp(y + me.fy * hop, B.y + 16, B.y + B.h - 16); // LONG HOP
    for (let i = 0; i <= 12; i++) {
      const px = x + (tx - x) * i / 12, py = y + (ty - y) * i / 12;
      discCells(px, py, 44, k => cleanCell(k, 1));
      parts.push({ x: px, y: py, vx: rand(-50, 50), vy: rand(-50, 50), life: .45, max: .45, col: PCOL[myColor], ch: pick(BITS) });
    }
    me.x = tx; me.y = ty; me.inv = Math.max(me.inv, .4); me.trail = [];
    for (const s of smudges) if (!s.popup) s.life = Math.min(s.life, 1.5);
    closeOldestPopup(); closeOldestPopup();
    ring(x, y, 30, -60, .3, PCOL[myColor]); ring(tx, ty, 6, 300, .3, PCOL[myColor]); cue('blink');
  } else if (sk === 'turret') {
    turrets.push({ x, y, t: 10, cd: 0 }); if (turrets.length > 2 + (me.cp.lb || 0)) turrets.shift(); // LOAD BALANCER
    ring(x, y, 6, 160, .4, PAL.green); cue('mine');
  } else if (sk === 'stress') {
    me.stress = 3 + (me.cp.soak || 0); ring(x, y, 10, 300, .4, PAL.gold, 4); cue('reflex'); // SOAK TEST
  } else if (sk === 'spinup') {
    addMinion(20, false, 3 + (me.cp.rep || 0)); ring(x, y, 6, 160, .4, PCOL[myColor]); cue('drone_on'); // REPLICA SET
  }
  if (me.syn.macro && me.skillCd > 1) me.sup = Math.min(100, me.sup + 12); // not for quick re-casts (BACKDOOR plant, no target)
}
// SMOKE TEST: a kill you made fires a rail from the corpse at the next nearest bug, which can chain on
function smokeChain(b) {
  if (!supOn('smoke')) return;
  const n = nearest(b, world.bugs.filter(o => o !== b && targetable(o) && Math.hypot(o.x - b.x, o.y - b.y) < 500));
  if (n) altShot(Math.atan2(n.y - b.y, n.x - b.x), 1500, { x: b.x, y: b.y, rail: true, pierce: 1, life: .5, dmg: 3 });
}

// ---------- cyberware (CW in config.js, installed at the clinic) ----------
const hasCw = id => !!me.cw && Object.values(me.cw).includes(id);
const cwMod = k => cwModOf(me.cw || {}, k) + ((me.pk && me.pk[k]) || 0); // implants + NETRUNNER perks
const osDef = () => CW[me.cw && me.cw.os];
const isSandy = D => !!(D && D.dil);
const cwOn = id => hasCw(id) && me.osT > 0;
const haste = () => (dil > 0 && dilOff === 'sandy_off' ? 1.5 : 1); // Sandevistan also overclocks you: +50% move speed and fire rate
// World speed: the slowest time dilation anyone in the room is running. Online it slows the shared world for everyone.
// The scanner (hold F with a netdeck) slows your own world too, but only in solo.
function worldK() {
  let k = dil > 0 ? dilK : 1;
  if (me.scan && !online() && mode === 'game') k = Math.min(k, .15);
  for (const o of others.values()) if (!o.d && o.tk < k) k = o.tk;
  return k;
}
let dilStop = null; // stops the Sandevistan loop
// Sandevistan charge: drains while it runs, refills while it doesn't. Cancel early (C again) and the rest stays usable;
// run it dry and it locks for the full cooldown.
const sandyMax = () => (osDef() ? osDef().dur * (1 + cwMod('osdur')) : 1);
const sandyCd = () => (osDef() ? osDef().cd * (1 - cwMod('oscd')) : 1);
function endDil(quiet) {
  if (dilOff === 'sandy_off') {
    if (me.sc <= .05) { me.sc = 0; me.scLock = true; me.osCd = sandyCd(); if (!quiet) pop(me.x, me.y - 50, 'SANDEVISTAN DEPLETED', PAL.rot, 14); }
    me.osT = 0; me.scRe = .35;
  }
  if (dilOff && !quiet) cue(dilOff);
  if (dilOff === 'sandy_off' && !quiet) chroma = Math.max(chroma, .4);
  dil = 0; dilK = 1; dilOff = ''; if (dilStop) { dilStop(); dilStop = null; }
}
function useOS() { // the kernel implant (C / L3 / touch)
  const id = me.cw.os, D = CW[id]; if (!D || me.down) return;
  if (D.deck) { me.scanLock = !me.scanLock; return; } // touch / gamepad: C toggles the scanner, keyboard holds F
  if (isSandy(D)) {
    if (me.osT > 0) { endDil(); return; } // cancel early, keep the rest of the charge
    if (me.scLock) { pop(me.x, me.y - 40, D.name + ' ' + Math.ceil(me.osCd) + 's', PAL.dim, 12); return cue('empty'); }
    if (me.scRe > 0 || me.sc < .5) { pop(me.x, me.y - 40, 'CHARGING', PAL.dim, 12); return cue('empty'); }
    endDil(true); me.osT = me.sc; dil = me.sc; dilK = D.dil; dilOff = 'sandy_off'; dilStop = loopCue('sandy_loop');
    cue('sandy_on'); cue('speedboost', .6); chroma = Math.max(chroma, .8); flash = .2; flashCol = '37,112,212'; dilT0 = T; // screen-space effect only (render.js): blue halftone vignette
  } else {
    if (me.osCd > 0) { pop(me.x, me.y - 40, D.name + ' ' + Math.ceil(me.osCd) + 's', PAL.dim, 12); return cue('empty'); }
    me.osCd = D.cd * (1 - cwMod('oscd')); me.osT = D.dur * (1 + cwMod('osdur'));
    if (id === 'berserk') {
      cue('berserk_on'); me.hp = Math.min(me.mh, me.hp + 1); flash = .45; flashCol = '255,62,52'; shake = Math.max(shake, 12);
      ring(me.x, me.y, 10, 700, .45, PAL.rot, 6);
    }
    if (id === 'camo') { cue('camo_on'); ring(me.x, me.y, 40, -90, .4, PAL.cyan, 2); burst(me.x, me.y, PAL.cyan, 16, true, 200); }
  }
  pop(me.x, me.y - 56, D.name, TIER[D.tier], 16);
  if (hasCw('feedback') && me.hp < me.mh) { me.hp++; cue('heal', .7); pop(me.x, me.y - 74, 'FEEDBACK · +1 HP', PAL.green, 13); } // FEEDBACK CIRCUIT
}
function cwTick(dt) { // cooldowns + every passive implant; runs on real time even while the world is dilated
  const D = osDef();
  if (isSandy(D)) {
    if (me.sc == null) me.sc = sandyMax();
    me.scRe = (me.scRe || 0) - dt;
    if (me.osT > 0) { me.sc = Math.max(0, me.sc - dt); me.osT = me.sc; dil = Math.max(.001, me.sc); }
    else if (me.scLock) { if ((me.osCd -= dt) <= 0) { me.scLock = false; me.sc = sandyMax(); cue('recharge'); pop(me.x, me.y - 40, D.name + ' READY', PAL.cyan, 12); } }
    else me.sc = Math.min(sandyMax(), me.sc + dt * sandyMax() / sandyCd());
  } else {
    me.osCd -= dt;
    if (me.osT > 0 && (me.osT -= dt) <= 0) {
      if (me.cw.os === 'berserk') cue('berserk_off');
      if (me.cw.os === 'camo') { cue('camo_off'); burst(me.x, me.y, PAL.cyan, 12, true, 200); }
    }
    if (D && !D.deck && me.osCd <= 0 && me.osCd + dt > 0) { cue('recharge'); pop(me.x, me.y - 40, D.name + ' READY', PAL.cyan, 12); }
  }
  if (dil > 0 && (me.cwT.g = (me.cwT.g || 0) - dt) <= 0) { me.cwT.g = .035; ghosts.push({ x: me.x, y: me.y, a: me.a, t: T }); } // afterimages
  ghosts = ghosts.filter(g => T - g.t < .5);
  if (me.hp === 1 && me.mh > 1 && !me.down) { if ((me.cwT.hb = (me.cwT.hb || 0) - dt) <= 0) { me.cwT.hb = 3.4; cue('lowhp'); } } else me.cwT.hb = 0; // heartbeat
  if (hasCw('flywheel') && me.superT <= 0 && me.noCharge <= 0) me.sup = Math.min(100, me.sup + dt * 1.2); // FLYWHEEL CELL
  const near = r => nearest(me, world.bugs.filter(b => targetable(b) && Math.hypot(b.x - me.x, b.y - me.y) < r + b.r));
  if (hasCw('launcher') && (me.cwT.l = (me.cwT.l ?? 1.5) - dt) <= 0) { // MICRO-MISSILE POD
    const t = near(650); me.cwT.l = t ? 3.5 : .3;
    if (t) { altShot(Math.atan2(t.y - me.y, t.x - me.x) + rand(-.7, .7), 520, { home: 6, life: 1.8, dmg: 3, aoe: 95, col: PAL.gold, clean: 1 }); cue('launcher'); }
  }
  if (hasCw('whip') && (me.cwT.w = (me.cwT.w ?? 1) - dt) <= 0) { // FIBER WHIP
    const t = near(230); me.cwT.w = t ? 2 : .2;
    if (t) { damageBug(t, 5 * myDmg()); me.wire = { x: t.x, y: t.y, t: T }; cue('whip'); setTimeout(() => cue('whipback'), 140); burst(t.x, t.y, PAL.hot, 10); }
  }
  if (hasCw('arc') && (me.cwT.a = (me.cwT.a ?? 1) - dt) <= 0) { // ARC PROJECTOR: chain lightning
    let t = near(300); me.cwT.a = t ? 2.5 : .25;
    if (t) {
      const hit = new Set(), pts = [[me.x, me.y]];
      for (let i = 0; i < 4 && t; i++) {
        hit.add(t.id); pts.push([t.x, t.y]); damageBug(t, 3 * myDmg()); burst(t.x, t.y, PAL.hot, 6);
        const from = t; t = nearest(from, world.bugs.filter(b => targetable(b) && !hit.has(b.id) && Math.hypot(b.x - from.x, b.y - from.y) < 210));
      }
      me.arcs.push({ pts, t: T }); cue('qh_short', .45, rand(1.1, 1.3), .2);
    }
  }
  me.arcs = me.arcs.filter(a => T - a.t < .25);
  if (hasCw('flak') && (me.cwT.f = (me.cwT.f ?? 1) - dt) <= 0) { // FLAK SCREEN: point defense
    const close = world.shots.filter(s => !s.hit && Math.hypot(s.x - me.x, s.y - me.y) < 170);
    me.cwT.f = close.length ? 3 : .15;
    for (const s of close) { s.hit = true; gone.set(s.id, T); if (!isHost) pend.e.push(['s', s.id]); burst(s.x, s.y, PAL.gold, 5); ring(s.x, s.y, 2, 90, .2, PAL.gold, 2); }
    if (close.length) { ring(me.x, me.y, 20, 600, .25, PAL.gold, 2); cue('deflect', .55); }
  }
  if (me.dashT > 0 && hasCw('wake')) me.wakes.push({ x: me.x, y: me.y, t: T }); // STATIC WAKE
  me.wakes = me.wakes.filter(w => T - w.t < 1.5);
  if (me.wakes.length) for (const b of world.bugs) if (targetable(b) && me.wakes.some(w => Math.hypot(b.x - w.x, b.y - w.y) < b.r + 16)) damageBug(b, dt * 6 * myDmg());
  if (me.dashT > 0 && hasCw('blades')) for (const b of world.bugs) // RAZOR FINS
    if (targetable(b) && Math.hypot(b.x - me.x, b.y - me.y) < b.r + 28) { damageBug(b, dt * 55 * myDmg()); cue('bladehit', 1, rand(.9, 1.1), .08); }
  if (me.wasDash && me.dashT <= 0 && hasCw('fists')) { // HYDRAULIC RAM: the dash lands in a slam
    for (const b of world.bugs) if (targetable(b) && Math.hypot(b.x - me.x, b.y - me.y) < 120 + b.r) {
      damageBug(b, 3 * myDmg());
      if (b.type !== 'boss' && !BUG[b.type].part) { const a = Math.atan2(b.y - me.y, b.x - me.x); b.x += Math.cos(a) * 40; b.y += Math.sin(a) * 40; }
    }
    discCells(me.x, me.y, 90, k => cleanCell(k, 1)); ring(me.x, me.y, 10, 520, .3, PAL.gold, 5); shake = Math.max(shake, 10); cue('slam');
  }
  me.wasDash = me.dashT > 0;
  qhTick(dt);
}

// ---------- quickhacks: a NETDECK kernel. Hold F to scan (solo: the world slows), pick a hack, click to upload ----------
const deck = () => { const D = osDef(); return D && D.deck ? D.deck : null; };
const ramMax = () => (deck() ? deck().ram + cwMod('ram') : 0);
const hackList = () => { const D = deck(); return D ? (me.hk || []).filter(k => QH[k] && (!QH[k].bw || D.bw)).slice(0, D.slots) : []; }; // slotted at the clinic
const qDepth = () => 2 + cwMod('queue'); // hacks that can be queued on one enemy
const qOn = id => me.qq.filter(q => q.id === id); // that enemy's queue, in order: the first one is the one uploading
const supRam = () => Math.max(4, 10 - cwMod('supram')); // netrunners: RAM to run the super a second time
const hackPow = () => (deck() ? deck().hdmg : 1) * (1 + cwMod('hack')) * (1 + WAVE_HP * Math.max(0, world.wave - 1)); // keeps pace with bug HP
const uploadTime = k => QH[k].up * deck().up * (1 - cwMod('upload'));
let qhSel = 0, qhTgt = 0, scanStop = null, scanIn = 0;
const scanTargets = () => world.bugs.filter(b => targetable(b) && inView(b.x, b.y));
const qhTarget = () => world.bugs.find(b => b.id === qhTgt && targetable(b));
function setScan(on) {
  if (on === me.scan) return;
  me.scan = on;
  if (on) { scanIn = T; me.scanP = 0; cue('scan_on'); scanStop = loopCue('scan_loop', .9); }
  else { me.scanLock = false; cue('scan_off'); if (scanStop) { scanStop(.2); scanStop = null; } }
}
function qhStep(d) { const n = hackList().length; if (!n) return; qhSel = (qhSel + d + n) % n; cue('qh_hover'); }
function qhCycle(d) {
  const L = scanTargets().sort((a, b) => a.x - b.x); if (!L.length) return;
  const i = L.findIndex(b => b.id === qhTgt); qhTgt = L[(i + d + L.length) % L.length].id; me.scanP = 0; cue('qh_tag');
}
function qhUpload(i = qhSel) {
  const k = hackList()[i], t = qhTarget(); qhSel = clamp(i, 0, hackList().length - 1);
  if (!k || !t) return cue('qh_fail');
  if (qOn(t.id).length >= qDepth()) { pop(me.x, me.y - 40, 'QUEUE FULL', PAL.dim, 12); return cue('qh_fail'); }
  if (me.ram < QH[k].ram) { pop(me.x, me.y - 40, 'NOT ENOUGH RAM', PAL.rot, 13); return cue('qh_fail'); }
  me.ram -= QH[k].ram;
  me.sup = Math.max(0, me.sup - QH[k].ram * 4); // netrunning eats into your super: no spamming both
  me.qq.push({ id: t.id, k, t: 0, max: uploadTime(k), on: false }); cue('qh_press'); cue('quickhack', .7); // queued on this enemy: it uploads once time flows again
}
function qhTick(dt) {
  const D = deck();
  if (!D) { if (me.scan) setScan(false); me.qq = []; return; }
  me.ram = Math.min(ramMax(), me.ram + dt / D.regen * (1 + cwMod('ramr')));
  const want = (me.scanHeld || me.scanLock) && !me.down && world.phase === 'play' && !paused;
  setScan(want);
  if (me.scan) { // pick a target: under the cursor if the mouse moved, otherwise keep it, otherwise the nearest bug
    const L = scanTargets(); let t = qhTarget();
    if (!touchMode && mouse.seen > 0 && T - mouse.seen < .3) { const p = mouseW(), c = nearest(p, L); if (c && Math.hypot(c.x - p.x, c.y - p.y) < 150 + c.r) t = c; }
    if (!t) t = nearest(me, L);
    if (t && t.id !== qhTgt) { qhTgt = t.id; me.scanP = 0; cue('qh_tag'); }
    if (t && me.scanP < 1 && (me.scanP += dt / .35) >= 1) cue('scan_done', .6);
    qhSel = clamp(qhSel, 0, hackList().length - 1);
  }
  if (!me.scan) { // uploads only run while time flows. Each enemy has its own queue; different enemies upload at the same time
    const heads = new Map(); for (const q of me.qq) if (!heads.has(q.id)) heads.set(q.id, q);
    for (const [id, q] of heads) {
      const t = world.bugs.find(b => b.id === id && !b.dead);
      if (!t) { // the enemy died first: its whole queue comes back as RAM
        const L = qOn(id); me.qq = me.qq.filter(o => o.id !== id); me.ram = Math.min(ramMax(), me.ram + L.reduce((a, o) => a + QH[o.k].ram, 0));
        pop(me.x, me.y - 40, 'TARGET LOST · RAM RETURNED', PAL.dim, 12); cue('qh_fail'); continue;
      }
      if (!q.on) { q.on = true; cue(QH[q.k].bw ? 'bw_up' : 'qh_up', .7); }
      if ((q.t += dt * worldK()) >= q.max) { me.qq.splice(me.qq.indexOf(q), 1); applyHack(q.k, t); }
    }
  }
  for (const d of me.dots) { // THERMAL THROTTLE / WORM: damage over (world) time
    const b = world.bugs.find(x => x.id === d.id && !x.dead);
    const w = dt * worldK(); d.t -= w;
    if (b) { damageBug(b, d.dps * w); if (Math.random() < w * 12) parts.push({ x: b.x + rand(-b.r, b.r), y: b.y + rand(-b.r, b.r), vx: rand(-20, 20), vy: rand(-90, -40), life: .4, max: .4, col: d.worm ? PAL.acid : PAL.orange }); }
    if (d.worm && d.jumps > 0 && (!b || d.t <= d.max - 2)) { // the worm copies itself to 2 nearby bugs
      const from = b || d; d.jumps = 0;
      const L = world.bugs.filter(o => targetable(o) && o.id !== d.id && !me.dots.some(q => q.id === o.id) && Math.hypot(o.x - from.x, o.y - from.y) < 220)
        .sort((p, q) => Math.hypot(p.x - from.x, p.y - from.y) - Math.hypot(q.x - from.x, q.y - from.y)).slice(0, 2);
      for (const o of L) { me.dots.push({ id: o.id, dps: d.dps, t: 6, max: 6, worm: true, jumps: 0, x: o.x, y: o.y }); me.arcs.push({ pts: [[from.x, from.y], [o.x, o.y]], t: T, col: PAL.acid }); }
      if (L.length) cue('qh_spreadx', .7);
    }
    if (b) { d.x = b.x; d.y = b.y; }
  }
  me.dots = me.dots.filter(d => d.t > 0);
  for (const [id, t] of me.marks) if (t < T) me.marks.delete(id);
}
function applyHack(k, b) {
  const P = hackPow(), boss = b.type === 'boss' || isPart(b);
  const c = QH[k].bw ? PAL.rot : PAL.ice;
  cue('qh_done', .7); cue(QH[k].sfx); b.hit = .2; glitch = Math.max(glitch, .15);
  pop(b.x, b.y - b.r - 18, QH[k].name, c, 14); ring(b.x, b.y, b.r, 260, .3, c, 2);
  me.arcs.push({ pts: [[me.x, me.y], [b.x, b.y]], t: T, col: c });
  if (k === 'blackwall') { // something on the other side reaches through: the target, then everything near it
    damageBug(b, 40 * P);
    for (const o of world.bugs) if (targetable(o) && o.id !== b.id && Math.hypot(o.x - b.x, o.y - b.y) < 320) {
      damageBug(o, 16 * P); me.arcs.push({ pts: [[b.x, b.y], [o.x, o.y]], t: T, col: PAL.rot }); burst(o.x, o.y, PAL.rot, 8, true);
    }
    burst(b.x, b.y, PAL.rot, 40, true); flash = .4; flashCol = '255,62,52'; glitch = Math.max(glitch, .8); chroma = Math.max(chroma, 1); shake = Math.max(shake, 16); me.bwT = T;
  }
  if (k === 'ping') {
    for (const o of world.bugs) if (targetable(o) && Math.hypot(o.x - b.x, o.y - b.y) < 260) me.marks.set(o.id, T + 10);
    ring(b.x, b.y, 10, 900, .5, PAL.ice, 2); ring(b.x, b.y, 10, 600, .6, PAL.ice, 1);
  }
  if (k === 'smash') { damageBug(b, 7 * P); burst(b.x, b.y, PAL.ice, 18); shake = Math.max(shake, 6); }
  if (k === 'mutex') { const s = boss ? 1.5 : 4; b.frz = Math.max(b.frz, s); if (!isHost) pend.e.push(['q', b.id, 1]); }
  if (k === 'nullptr') {
    if (boss) pop(b.x, b.y - b.r - 34, 'RESISTED', PAL.rot, 12);
    else { b.blind = 6; if (!isHost) pend.e.push(['q', b.id, 2]); }
  }
  if (k === 'throttle') me.dots.push({ id: b.id, dps: 2.5 * P, t: 5, max: 5, x: b.x, y: b.y });
  if (k === 'worm') me.dots.push({ id: b.id, dps: 1.5 * P, t: 6, max: 6, worm: true, jumps: 2, x: b.x, y: b.y });
  if (k === 'panic') { damageBug(b, boss ? b.mhp * .1 : b.hp + 1); burst(b.x, b.y, PAL.ice, 30, true); flash = .2; flashCol = '82,221,223'; }
}

// ---------- per-frame update ----------
function updMe(dt, I) {
  me.firing = false;
  if (world.phase !== 'play') return;
  if (me.down) {
    const o = [...others.values()].find(q => !q.d && Math.hypot(q.x - me.x, q.y - me.y) < 70);
    me.rev = o ? me.rev + dt * (o.med ? 2 : 1) : Math.max(0, me.rev - dt); // FIELD MEDIC revives 2x faster
    if (me.rev >= 2) { me.down = false; me.hp = Math.min(2, me.mh); me.inv = 2; pop(me.x, me.y - 40, 'REBOOTED', PCOL[myColor], 20); cue('reboot'); }
    return;
  }
  const K = myW();
  me.inv -= dt; me.cd -= dt; me.dashCd -= dt; me.skillCd -= dt; me.stress -= dt; me.superT -= dt; me.noCharge -= dt; me.chainT -= dt;
  cwTick(dt);
  if (me.superT > 0) me.sup = 0; // no meter gain of any kind (boss kills, SUPER CELL, MACRO) while LOAD TEST runs, so supers can't stack
  if (loadTest() || (I.fire && !I.aim)) { // LOAD TEST or keyboard firing: auto-aim at the nearest bug (LOAD TEST also keeps firing)
    const tgt = nearest(me, world.bugs.filter(b => targetable(b) && inView(b.x, b.y))); // only what's on screen
    if (tgt) I = { ...I, ax: tgt.x - me.x, ay: tgt.y - me.y, aim: true, fire: true };
  }
  if (me.chainT <= 0) me.chain = 0;
  for (const k in me.pw) me.pw[k] -= dt;
  let mx = I.mx, my = I.my; const m = Math.hypot(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  if (m > .1) { me.fx = mx / m; me.fy = my / m; }
  if (I.aim) { const am = Math.hypot(I.ax, I.ay) || 1; me.fx = I.ax / am; me.fy = I.ay / am; }
  me.a = Math.atan2(me.fy, me.fx);
  { // SMARTCURVE zone sits on the cursor when you aim with the mouse, otherwise out in front of you
    const mAim = !touchMode && mouse.seen > 0 && I.aim && !keys.Space;
    me.sa = mAim && !loadTest() ? { ...mouseW(), r: smartR() } : { x: me.x + me.fx * 260, y: me.y + me.fy * 260, r: smartR() };
  }
  if (me.scan) I = { ...I, fire: false, dash: false, skill: false, super: false }; // while scanning, clicks upload quickhacks; no abilities
  if (me.dashT > 0) {
    me.dashT -= dt;
    discCells(me.x, me.y, 60, k => cleanCell(k, dt * 7));
    if (me.syn.speedrun) for (const b of world.bugs) if (targetable(b) && Math.hypot(b.x - me.x, b.y - me.y) < b.r + 26) damageBug(b, dt * 40);
    parts.push({ x: me.x, y: me.y, vx: rand(-40, 40), vy: rand(-40, 40), life: .3, max: .3, col: PCOL[myColor] });
  } else {
    // SPAGHETTI PRIME: a noodle arm on you slows you and drags you toward the boss until you dash out
    me.tangleImm = (me.tangleImm || 0) - dt;
    const arm = me.tangleImm > 0 ? null : world.bugs.find(a => a.type === 'arm' && !a.dead && Math.hypot(a.x - me.x, a.y - me.y) < 26);
    const sp = BAL.player.speed * (1 + .12 * me.up.speed) * (me.pw.coffee > 0 ? 1.25 : 1) * (arm ? .35 : 1) * haste() * (1 + cwMod('speed')), k = Math.min(1, dt * 12);
    me.vx += (mx * sp - me.vx) * k; me.vy += (my * sp - me.vy) * k;
    const boss = arm && world.bugs.find(x => x.id === arm.pid);
    if (boss) { const d = Math.hypot(boss.x - me.x, boss.y - me.y) || 1; me.x += (boss.x - me.x) / d * 120 * dt; me.y += (boss.y - me.y) / d * 120 * dt; hint('TANGLED · DASH TO BREAK FREE', BUG.arm.col); }
  }
  if (I.dash && me.dashCd <= 0) {
    const dx = m > .1 ? mx : me.fx, dy = m > .1 ? my : me.fy, dn = Math.hypot(dx, dy) || 1;
    me.tangleImm = 1.2; // dashing rips free of noodle arms
    const ten = hasCw('tendons');
    me.dashT = ten ? .224 : .16; me.dashCd = BAL.player.dashCd * Math.pow(.75, me.up.dash) * (ten ? .8 : 1) * (1 - Math.min(.7, cwMod('dash'))); me.inv = Math.max(me.inv, .3); me.vx = dx / dn * 980; me.vy = dy / dn * 980;
    for (const s of smudges) if (!s.popup) s.life -= 1.5; // dashing shakes splats loose and knocks out one popup
    closeOldestPopup();
    cue(dil > 0 ? 'sandy_dash' : 'dash'); ring(me.x, me.y, 8, 200, .25, PCOL[myColor]);
    if (ten) cue('ankles'); if (hasCw('blades')) cue('blade');
    if (hasCw('reflex') && !(dil > 0)) { dil = .6; dilK = .3; dilOff = 'kerenz_off'; cue('kerenz_on'); chroma = Math.max(chroma, .3); }
  }
  const mk = me.scan ? worldK() : 1; // the scanner slows you with the world (solo): it isn't a free Sandevistan
  const B = bounds(), ox = me.x, oy = me.y;
  me.x = clamp(me.x + me.vx * dt * mk, B.x + 16, B.x + B.w - 16); me.y = clamp(me.y + me.vy * dt * mk, B.y + 16, B.y + B.h - 16);
  if (Math.hypot(me.x - ox - me.vx * dt * mk, me.y - oy - me.vy * dt * mk) > 60) { // a boss locked the arena while you were outside: you get pulled in
    ring(ox, oy, 30, -60, .3, PCOL[myColor]); ring(me.x, me.y, 6, 300, .3, PCOL[myColor]); me.trail = []; me.inv = Math.max(me.inv, 1); cue('warp'); pop(me.x, me.y - 50, 'ARENA LOCK', PAL.rot, 16);
  }
  if (I.fire && me.cd <= 0) { me.cd = K.fire / (1 + .2 * me.up.fire) / (me.pw.coffee > 0 ? 2 : 1) / (me.stress > 0 ? 3 : 1) / (loadTest() ? 4 : 1) / haste() / (1 + cwMod('fire')); shoot(I); }
  me.firing = !!I.fire;
  if (I.skill) { if (me.skillCd <= 0) useSkill(); else { pop(me.x, me.y - 40, skillName() + ' ' + Math.ceil(me.skillCd) + 's', PAL.dim, 12); cue('empty'); } }
  if (I.super) { // netrunners can run the super a second time per charge by paying RAM. Never more than twice.
    if (me.sup >= 100) { fireSuper(); me.supUses = 1; }
    else if (deck() && me.supUses === 1 && me.superT <= 0 && me.ram >= supRam()) {
      const s = me.sup; me.ram -= supRam(); fireSuper(); me.sup = s; me.supUses = 2; cue('overclock', .8); pop(me.x, me.y - 74, 'RE-RUN · -' + supRam() + ' RAM', PAL.ice, 14);
    } else { pop(me.x, me.y - 40, deck() && me.supUses === 1 ? (me.superT > 0 ? 'SUPER RUNNING' : 'RE-RUN NEEDS ' + supRam() + ' RAM') : supName() + ' CHARGING', PAL.dim, 13); cue('empty'); }
  }
  if (I.cyber) useOS();

  const shield = me.pw.firewall > 0, ram = cwOn('berserk');
  for (const b of world.bugs) {
    const D = BUG[b.type];
    if (b.dead || D.noTouch || ghostly(b) || (b.type === 'trojan' && !b.rev) || Math.hypot(me.x - b.x, me.y - b.y) > b.r + (shield ? 30 : 11)) continue;
    if (shield || ram) { if (!D.immortal) damageBug(b, dt * (ram ? 14 * myDmg() : 6)); if (b.type !== 'boss' && !D.part) { const a = Math.atan2(b.y - me.y, b.x - me.x); b.x += Math.cos(a) * 6; b.y += Math.sin(a) * 6; } }
    else if (me.inv <= 0) hurt(b, b.type === 'adware' ? 2 : 0);
  }
  if (!shield && me.inv <= 0) for (const b of world.bugs) { // DEADLOCK beams
    if (b.dead || b.type !== 'lock') continue;
    const p = world.bugs.find(x => x.id === b.aux && !x.dead && x.type === 'lock');
    if (!p || p.id < b.id) continue;
    const vx = p.x - b.x, vy = p.y - b.y, f = clamp(((me.x - b.x) * vx + (me.y - b.y) * vy) / (vx * vx + vy * vy || 1), 0, 1);
    const qx = b.x + vx * f, qy = b.y + vy * f;
    if (Math.hypot(me.x - qx, me.y - qy) < 11) { hurt({ x: qx, y: qy }); break; }
  }
  if (!shield && me.inv <= 0 && world.dep.length) { // LEGACY KERNEL: burning deprecated tiles
    const c = ci(me.x, me.y);
    if (world.dep.some(d => d.k === c && d.t <= 4)) { hurt({ x: me.x, y: me.y + 1 }); hint('DEPRECATED TILES BURN · KEEP MOVING', PAL.red); }
  }
  for (const s of world.shots) {
    if (!s.hit && supOn('mitm') && Math.hypot(s.x - me.x, s.y - me.y) < 90) { // MAN IN THE MIDDLE: the shot is ours now
      s.hit = true; gone.set(s.id, T); if (!isHost) pend.e.push(['s', s.id]);
      const t = nearest(s, world.bugs.filter(targetable));
      altShot(t ? Math.atan2(t.y - s.y, t.x - s.x) : Math.atan2(-s.vy, -s.vx), 700, { x: s.x, y: s.y, home: 4, life: 1.5, dmg: 1.5 });
      ring(s.x, s.y, 4, 120, .2, PCOL[myColor]); continue;
    }
    if (s.hit || Math.hypot(s.x - me.x, s.y - me.y) > (shield ? 32 : 13)) continue;
    s.hit = true; gone.set(s.id, T);
    if (!isHost) pend.e.push(['s', s.id]);
    if (shield) ring(s.x, s.y, 4, 120, .2, '#78ADFF');
    else if (me.inv <= 0) hurt(s, s.k === 'ad' ? 3 : 0);
  }
  if (me.supK === 'debt' && me.superT <= 0) { // TECH DEBT comes due: pay it all back at once
    me.supK = ''; const r = 280, dmg = (4 + 3 * me.debt) * myDmg();
    for (const b of world.bugs) if (targetable(b) && Math.hypot(b.x - me.x, b.y - me.y) < r + b.r) damageBug(b, dmg);
    for (let i = 0; i < 3; i++) ring(me.x, me.y, 10 + i * 30, 900, .5, i % 2 ? PAL.rot : PAL.white, 8 - i * 2);
    shake = Math.max(shake, 20 + me.debt * 2); cue('superland'); cue('expl_m', .7); pop(me.x, me.y - 50, 'PAID BACK x' + me.debt, PAL.rot, 18);
  }
  me.hist.push({ x: me.x, y: me.y, hp: me.hp, t: T }); while (me.hist.length && T - me.hist[0].t > 4) me.hist.shift(); // REWIND
  let inBeacon = false; // HEALTH CHECK beacons: yours and teammates'
  for (const b of beacons) b.t -= dt;
  beacons = beacons.filter(b => b.t > 0);
  for (const b of [...beacons, ...[...others.values()].flatMap(o => o.bc || [])]) if (Math.hypot((b.x ?? b[0]) - me.x, (b.y ?? b[1]) - me.y) < 120) inBeacon = true;
  if (!inBeacon) me.healT = 3;
  else if ((me.healT -= dt) <= 0) { me.healT = 3; if (me.hp < me.mh) { me.hp++; pop(me.x, me.y - 40, '+1 HP', '#1DED83', 14); } }
  const tg = minions.length ? world.bugs.filter(targetable) : [];
  const routed = me.route && me.route.t > T && world.bugs.find(b => b.id === me.route.id && targetable(b)); // ROUTE TRAFFIC
  minions.forEach((n, i) => { // DEVOPS containers: hunt the nearest bug near you, otherwise orbit you
    n.t -= dt;
    const b = routed || nearest(n, tg), hunt = b && (routed || Math.hypot(b.x - me.x, b.y - me.y) < 600), oa = T * 2.5 + i * 6.283 / minions.length;
    const gx = hunt ? b.x : me.x + Math.cos(oa) * 62, gy = hunt ? b.y : me.y + Math.sin(oa) * 62;
    const d = Math.hypot(gx - n.x, gy - n.y) || 1, step = Math.min(d, (n.fast || routed ? 460 : 300) * dt);
    n.x += (gx - n.x) / d * step; n.y += (gy - n.y) / d * step;
    if (hunt && Math.hypot(b.x - n.x, b.y - n.y) < b.r + 12) damageBug(b, dt * (n.fast ? 5 : 2.5) * (routed ? 2 : 1) * (1 + .25 * (me.cp.bite || 0)) * myDmg() * me.summ); // RESOURCE LIMITS, TECH
    cleanCell(ci(n.x, n.y), dt * 2);
  });
  minions = minions.filter(n => n.t > 0);
  for (let i = 0; i < me.up.orbit; i++) {
    const a = T * 3 + i * 6.283 / me.up.orbit, dx = me.x + Math.cos(a) * 58, dy = me.y + Math.sin(a) * 58;
    for (const b of world.bugs) if (targetable(b) && Math.hypot(b.x - dx, b.y - dy) < b.r + 9) damageBug(b, dt * (me.syn.cron ? 14 : 7) * me.summ);
    if (me.syn.cron) discCells(dx, dy, 44, k => cleanCell(k, dt * 3)); else cleanCell(ci(dx, dy), dt * 3);
  }
  if (me.pw.duck > 0 && (me.duckCd -= dt) <= 0) me.duckCd = autoGun(me.x - 34, me.y - 34, '#FFD741', 520) ? .22 : 0;
  for (const t of turrets) { t.t -= dt; if ((t.cd -= dt) <= 0) t.cd = autoGun(t.x, t.y, '#1DED83', 480, 1.2) ? .2 / (1 + .25 * (me.cp.poll || 0)) : 0; } // FAST POLLING
  turrets = turrets.filter(t => t.t > 0);
  for (const w of world.pows) if (!w.taken && Math.hypot(me.x - w.x, me.y - w.y) < 32) grabPow(w);
  if (T - (me.trT || 0) >= 1 / 60) { me.trT = T; me.trail.push({ x: me.x, y: me.y }); if (me.trail.length > 12) me.trail.shift(); } // 60 samples/s at any frame rate
}
const angleDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; return d; };
// SMARTCURVE: lock onto the best bug ahead of the shot (inside the lock zone) (close and in front beats close and behind),
// keep the lock until it dies, and turn at a fixed rate that grows per level so shots arc instead of orbiting.
function homeBullet(s, dt) {
  const t = s.tgt;
  if (!t || t.dead || s.hits.has(t.id)) {
    s.tgt = null;
    const heading = Math.atan2(s.vy, s.vx), reach = (300 + 60 * s.home) * (s.mine && me.syn.lsp ? 2 : 1), Z = s.smart && me.sa;
    let bestScore = Infinity;
    for (const b of world.bugs) {
      if (!targetable(b) || s.hits.has(b.id)) continue;
      if (Z && Math.hypot(b.x - Z.x, b.y - Z.y) > Z.r + b.r) continue; // SMARTCURVE: outside the lock zone
      const d = Math.hypot(b.x - s.x, b.y - s.y); if (d > reach) continue;
      const off = Math.abs(angleDiff(heading, Math.atan2(b.y - s.y, b.x - s.x)));
      if (off > 1.3) continue; // ignore bugs well behind the shot
      const score = d * (1 + off * 1.5);
      if (score < bestScore) { bestScore = score; s.tgt = b; }
    }
    if (!s.tgt) return;
    if (s.smart) cue('lock', .8, 1, .18); // the smart-gun lock-on chirp
  }
  const cur = Math.atan2(s.vy, s.vx), sp = Math.hypot(s.vx, s.vy), turn = (4 + 3 * s.home) * dt;
  const na = cur + clamp(angleDiff(cur, Math.atan2(s.tgt.y - s.y, s.tgt.x - s.x)), -turn, turn);
  s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
}
function updBullets(dt) {
  for (const s of bullets) {
    if (s.home) homeBullet(s, dt);
    if (s.aoe && Math.random() < .6) parts.push({ x: s.x, y: s.y, vx: rand(-30, 30), vy: rand(-30, 30), life: .35, max: .35, col: PAL.dim, big: 3 }); // missile smoke
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    const tail = s.mine && me.syn.tail ? 1.5 : 1, x0 = Math.max(0, cam.x), x1 = Math.min(MW, cam.x + W), y0 = Math.max(0, cam.y), y1 = Math.min(MH, cam.y + H);
    if (s.bounce > 0 && (s.x < x0 || s.x > x1)) { s.bounce--; s.vx *= -1; s.x = clamp(s.x, x0, x1); s.hits.clear(); s.dmg *= tail; } // RECURSION / ricochet: off the screen edge
    if (s.bounce > 0 && (s.y < y0 || s.y > y1)) { s.bounce--; s.vy *= -1; s.y = clamp(s.y, y0, y1); s.hits.clear(); s.dmg *= tail; }
    if (s.x < 0 || s.x > MW || s.y < 0 || s.y > MH) s.life = 0;
    if (!s.mine || s.life <= 0) continue;
    const c = ci(s.x, s.y);
    if (cleanCell(c, s.clean) > .5) { me.score += 5; if (Math.random() < .3) parts.push({ x: s.x, y: s.y, vx: rand(-60, 60), vy: rand(-60, 60), life: .4, max: .4, col: s.col, ch: CH[c] }); }
    if (me.up.clean && c >= 0) for (const d of [-1, 1, -COLS, COLS]) { const n = c + d; if (n >= 0 && n < NC && Math.abs(n % COLS - c % COLS) <= 1) cleanCell(n, .25 * me.up.clean); }
    for (let i = world.bugs.length - 1; i >= 0; i--) { // newest first, so boss parts (QR code, pillars) beat the boss body
      const b = world.bugs[i];
      if (b.dead || ghostly(b) || s.hits.has(b.id) || (b.x - s.x) ** 2 + (b.y - s.y) ** 2 > (b.r + 5 + (s.wide || 0)) ** 2) continue;
      s.hits.add(b.id); damageBug(b, s.dmg);
      if (me.syn.types) s.dmg *= 1.25;
      if (b.type !== 'boss' && !BUG[b.type].part) { b.vx += s.vx * .06; b.vy += s.vy * .06; }
      for (let i = 0; i < 4; i++) parts.push({ x: s.x, y: s.y, vx: rand(-220, 220) - s.vx * .25, vy: rand(-220, 220) - s.vy * .25, life: .22, max: .22, col: i % 2 ? '#fff' : s.col });
      if (rings.length < 120) ring(s.x, s.y, 3, s.rail ? 260 : 160, .14, s.col, 2); // impact pop
      if (!b.dead) cue(s.rail || s.crit ? 'crit' : 'hit', 1, rand(.92, 1.08), .045);
      if (s.crit) { pop(s.x, s.y - 14, 'CRIT', PAL.gold, 12); ring(s.x, s.y, 4, 300, .2, PAL.gold, 3); }
      if (s.aoe) { // MICRO-MISSILE: area burst
        for (const o of world.bugs) if (o !== b && targetable(o) && Math.hypot(o.x - s.x, o.y - s.y) < s.aoe + o.r) damageBug(o, s.dmg * .6);
        ring(s.x, s.y, 6, s.aoe * 4, .25, s.col, 4); burst(s.x, s.y, s.col, 14); discCells(s.x, s.y, s.aoe * .6, k => cleanCell(k, 1)); cue('expl_s', .7); shake = Math.max(shake, 6);
      }
      if (s.pierce > 0) s.pierce--; else { s.life = 0; break; }
    }
  }
  bullets = bullets.filter(s => s.life > 0);
}

// ---------- upgrades + reacting to the shared world ----------
function offerUpgrades() {
  if (me.offer || me.picks <= 0) return;
  const pool = Object.keys(UPG).filter(k => me.up[k] < upgCap(me.wp, k) && !(k === 'hp' && mut('glass')) && !(k === 'homing' && smartLv() >= BAL.smart.maxLv) && !(k === 'zone' && !smartLv()));
  if (!pool.length) { // everything maxed: picks turn into points
    me.score += 2500 * me.picks; pop(me.x, me.y - 50, 'FULLY OPTIMIZED +' + fmt(2500 * me.picks), PAL.gold, 18); me.picks = 0; return;
  }
  me.offer = pool.map(k => [Math.random() ** (1 / (UPG_RARE[k] || 1)), k]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(p => p[1]); // weighted draw: UPG_RARE are rarer
}
// The synergy this pick would complete, if any (for the upgrade card and pickUpgrade)
const synFrom = k => Object.keys(SYN).find(s => !me.syn[s] && SYN[s].need.includes(k) && SYN[s].need.every(n => me.up[n] + (n === k) >= SYN_LV));
function rerollUpgrades() { // GIT STASH perk
  if (!me.offer || me.rerolls <= 0) return;
  me.rerolls--; me.offer = null; offerUpgrades(); cue('up');
}
function pickUpgrade(i) {
  if (!me.offer || !me.offer[i]) return;
  const k = me.offer[i], syn = synFrom(k); me.up[k]++; me.picks--; me.offer = null;
  if (k === 'hp') { me.mh++; me.hp = me.mh; }
  pop(me.x, me.y - 50, UPG[k][0] + ' ' + 'I'.repeat(Math.min(5, me.up[k])), PAL.gold, 18);
  ring(me.x, me.y, 10, 300, .4, PAL.gold, 4); cue('perk');
  if (syn) {
    me.syn[syn] = true; banner = { t: 2.4, big: SYN[syn].name, sub: 'SYNERGY · ' + SYN[syn].desc };
    ring(me.x, me.y, 10, 600, .6, PAL.purple, 6); chroma = Math.max(chroma, .4); cue('perkmax');
  }
  offerUpgrades();
}
function syncLocal() {
  if (world.run !== seen.run) {
    seen.run = world.run; seen.wave = 0; seen.nk = world.nk; seen.hl = world.hl; seen.bk = 0; seen.cleared = false; seen.sw = world.sw; me = mkMe(); turrets = []; minions = []; beacons = []; smudges = []; if (mut('glass')) me.hp = me.mh = 1;
    runBytes = 0; runXp = 0; runDrops = []; camTick(0, true);
  }
  if (world.nk !== seen.nk) { seen.nk = world.nk; nukeFx(world.nx, world.ny); }
  if (world.sw !== seen.sw) { // MAINTENANCE WINDOW from any sysadmin in the room
    seen.sw = world.sw; me.pw.firewall = Math.max(me.pw.firewall || 0, 6);
    ring(me.x, me.y, 10, 300, .5, '#78ADFF', 5); pop(me.x, me.y - 50, 'MAINTENANCE WINDOW · SHIELDED', '#78ADFF', 14);
  }
  if (world.hl !== seen.hl) {
    seen.hl = world.hl;
    const o = others.get(world.ht);
    if (world.ht === myNetId()) failoverFx();
    else if (o) { ring(o.x, o.y, 10, 400, .6, '#1DED83', 6); pop(o.x, o.y - 50, o.n + ' RESTORED', '#1DED83', 16); }
  }
  const bk = world.breakT > 0 ? 1 : 0;
  if (bk && !seen.bk && world.phase === 'play') {
    me.score += 1000 * world.wave; me.picks++; seen.cleared = true;
    if (me.down) { me.down = false; me.hp = 1; me.inv = 2; }
    const pay = BAL.eco.wave * world.wave * (BAL.eco.diff[world.diff] || 1) * (mut('rush') ? BAL.eco.rush : 1);
    earn(BAL.eco.wave * world.wave, BAL.xp.wave * world.wave); saveMeta();
    banner = { t: 2.6, big: 'WAVE CLEAR', sub: (adminMode ? '' : '+' + fmt(pay) + ' ¤ · ') + 'rot halved' };
    cue('clear');
  }
  seen.bk = bk;
  if (world.wave !== seen.wave && world.phase === 'play') {
    const skipped = world.wave > seen.wave && seen.wave > 0 && !seen.cleared; // auto-skip: still earn the upgrade
    seen.wave = world.wave; seen.cleared = false; newSnippet();
    if (skipped) { me.picks++; me.score += 500 * world.wave; popS(W / 2, 150, 'WAVE SKIPPED +' + fmt(500 * world.wave) + ' · bugs carried over', PAL.gold, 16); } // points + a pick, no bytes
    if (isBossWave(world.wave)) { const lp = bossLoop(); banner = { t: 3.2, big: bossName(world.wave) + (lp > 1 ? ' (REMIX ' + lp + ')' : ''), sub: 'BOSS INCOMING · ' + bossOf(world.wave).desc }; glitch = .6; cue('alert'); cue('bossaim', .8); }
    else { banner = { t: 2.6, big: 'WAVE ' + world.wave, sub: '' }; cue(world.wave === 1 ? 'area' : 'wave'); }
  }
  if (world.phase !== seen.phase) {
    seen.phase = world.phase; kbFocus = 0;
    if (world.phase === 'over') {
      overT = 0; shake = 24; glitch = .6; cue('flatline'); endDil(true);
      newBest = !adminMode && me.score > best; // sandbox scores don't count
      if (newBest) { best = me.score; try { localStorage.setItem('coderot-best', best); } catch (_) {} }
      newUnlocks = [];
      if (!adminMode) { const had = unlocked(); recordRun(); newUnlocks = SKINS.filter(s => unlocked().includes(s.id) && !had.includes(s.id)); }
    }
  }
  offerUpgrades();
}
function restart() { if (world.phase !== 'over' || overT < .8) return; if (isHost) startRun(); else pend.e.push(['r']); }
