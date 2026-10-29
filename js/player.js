'use strict';
// The local player: class weapon, skill, super, dash, power-ups, upgrades, getting hurt, and reacting to world events.

const myK = () => CLASSES[me.cls];

function hurt(src, gunk) {
  me.hp--; me.inv = 1.3; me.chain = 0; shake = Math.max(shake, 14); flash = .7; flashCol = '255,40,80'; glitch = Math.max(glitch, .3);
  const a = Math.atan2(me.y - src.y, me.x - src.x); me.vx = Math.cos(a) * 650; me.vy = Math.sin(a) * 650;
  burst(me.x, me.y, PCOL[myColor], 18); sfx(150, .3, 'sawtooth', .1, 40);
  if (gunk) { smear(gunk); pop(me.x, me.y - 44, 'ADWARE!', BUG.adware.col, 16); }
  if (me.hp <= 0) { me.down = true; me.rev = 0; pop(me.x, me.y - 44, 'DEV DOWN!', PAL.rot, 20); }
}
function grabPow(w) {
  const P = POW[w.type]; w.taken = true; gone.set(w.id, T);
  if (!isHost) pend.e.push(['g', w.id]);
  pop(w.x, w.y - 24, P.label + '!', P.col, 18); arp([660, 880, 1320], .04, 'triangle', .06);
  ring(w.x, w.y, 6, 260, .35, P.col);
  if (w.type === 'sudo' || w.type === 'coffee') me.pw[w.type] = 8;
  if (w.type === 'firewall') me.pw.firewall = 7;
  if (w.type === 'duck') me.pw.duck = 14;
  if (w.type === 'patch') {
    me.patches = (me.patches || 0) + 1;
    if (myK().halfHeal && me.patches % 2) pop(me.x, me.y - 70, 'PATCH PENDING · next one heals', PAL.dim, 12); // half as many heals
    else if (me.hp < me.mh) me.hp++; else me.score += 250;
  }
  if (w.type === 'cell') me.sup = Math.min(100, me.sup + 30);
  if (w.type === 'adblock') smudges = [];
  if (w.type === 'revert') {
    ring(w.x, w.y, 10, 900, .45, PAL.white, 6); shake = 20; hitstop = .05; flash = .3; flashCol = '244,241,255'; boom(.5, .2);
    if (isHost) doRevert(w.x, w.y); else { pend.e.push(['v', w.x | 0, w.y | 0]); discCells(w.x, w.y, 300, k => cleanCell(k, 1)); }
  }
}
// ---------- supers: one per class, charged by kills ----------
function fireSuper() {
  const K = myK(), x = me.x, y = me.y, col = PCOL[myColor];
  me.sup = 0; me.noCharge = { qa: 7, hacker: 2.5 }[me.cls] || 0; // kills made by a running super don't charge the next one
  banner = { t: 1.8, big: K.sup, sub: K.supDesc };
  chroma = Math.max(chroma, .5); shake = Math.max(shake, 14);
  if (me.cls === 'refactorer') { // the nuke
    const n = world.bugs.filter(b => !b.dead && b.type !== 'boss').length;
    me.score += n * 75; pop(x, y - 60, '+' + fmt(n * 75), PAL.gold, 22);
    if (isHost) doNuke(x, y); else pend.e.push(['n', x | 0, y | 0]);
  } else if (me.cls === 'debugger') {
    for (let i = 0; i < 3; i++) ring(x, y, 10 + i * 40, 1300, .8, PAL.ice, 8 - i * 2);
    flash = .6; flashCol = '143,227,255'; arp([1568, 1175, 784, 523], .07, 'triangle', .07);
    for (const b of world.bugs) b.frz = b.type === 'boss' ? 2.5 : 5;
    for (const s of world.shots) { s.hit = true; gone.set(s.id, T); burst(s.x, s.y, PAL.ice, 4); }
    if (isHost) doHalt(); else pend.e.push(['h']);
  } else if (me.cls === 'hacker') {
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * 6.283;
      bullets.push({ x, y, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640, life: 2.4, col, dmg: 2, pierce: 0, bounce: 1, home: 5, clean: .6, hits: new Set(), mine: true });
    }
    ring(x, y, 10, 700, .5, col, 6); glitch = .6; sfx(200, .5, 'sawtooth', .07, 3000);
  } else if (me.cls === 'sysadmin') {
    for (let i = 0; i < 3; i++) { const a = i * 2.094; turrets.push({ x: clamp(x + Math.cos(a) * 70, 20, W - 20), y: clamp(y + Math.sin(a) * 70, 20, H - 20), t: 12, cd: 0 }); }
    turrets = turrets.slice(-5);
    const id = failoverTarget();
    if (isHost) doFailover(id); else pend.e.push(['l', id]);
  } else if (me.cls === 'qa') {
    me.superT = 6; ring(x, y, 10, 500, .5, PAL.gold, 6); arp([880, 1175, 1568, 2093], .05, 'square', .06);
  }
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
  me.hp = myK().halfHeal ? Math.min(me.mh, Math.max(me.hp, 0) + 2) : me.mh; me.inv = Math.max(me.inv, 1.5);
  ring(me.x, me.y, 10, 400, .6, '#5dffa8', 6); flash = .4; flashCol = '93,255,168';
  pop(me.x, me.y - 50, 'RESTORED', '#5dffa8', 20); arp([392, 523, 659, 784, 1047], .06, 'triangle', .07);
}
function nukeFx(x, y) {
  flash = 1.4; flashCol = '255,250,235'; shake = 34; hitstop = .14; glitch = 1; chroma = 1.2;
  for (let i = 0; i < 4; i++) ring(x, y, 10 + i * 30, 1400 + i * 300, .9, i % 2 ? PAL.rot : PAL.white, 10 - i * 2);
  for (let i = 0; i < 6; i++) burst(rand(0, W), rand(0, H), PCOL[i % PCOL.length], 20, true, 600);
  smudges = [];
  boom(1.4, .5); arp([110, 82, 55], .12, 'sawtooth', .08);
}

// ---------- weapons and skills ----------
function autoGun(x, y, col, range, dmg = 1) { // turrets and the duck: shoot the nearest bug
  let tgt = null, bd = range;
  for (const b of world.bugs) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd && targetable(b)) { bd = d; tgt = b; } }
  if (!tgt) return false;
  const a = Math.atan2(tgt.y - y, tgt.x - x);
  bullets.push({ x, y, vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, life: .8, col, dmg, pierce: 0, bounce: 0, home: 0, clean: .4, hits: new Set(), mine: true });
  sfx(1300, .03, 'triangle', .02);
  return true;
}
function shoot(I) {
  const K = myK();
  let a = Math.atan2(me.fy, me.fx);
  if (!I.aim) { // keyboard-only: light aim assist inside a narrow cone
    let bd = 640;
    for (const b of world.bugs) {
      if (!targetable(b)) continue;
      const d = Math.hypot(b.x - me.x, b.y - me.y), ba = Math.atan2(b.y - me.y, b.x - me.x);
      let da = Math.abs(ba - a); if (da > Math.PI) da = 2 * Math.PI - da;
      if (da < .3 && d < bd) { bd = d; a = ba; }
    }
  }
  const n = K.shots + me.up.shots + (me.pw.sudo > 0 ? 2 : 0), sp = K.spread || .08, loadTest = me.superT > 0;
  for (let i = 0; i < n; i++) {
    const s = (i - (n - 1) / 2) * sp + (me.cls === 'refactorer' ? rand(-.04, .04) : 0), v = K.bspeed * (me.cls === 'refactorer' ? rand(.85, 1.1) : 1);
    bullets.push({ x: me.x + Math.cos(a) * 18, y: me.y + Math.sin(a) * 18, vx: Math.cos(a + s) * v, vy: Math.sin(a + s) * v, life: K.life * (1 + .3 * me.up.range),
      col: PCOL[myColor], dmg: K.dmg * (1 + .3 * me.up.dmg), pierce: K.pierce + me.up.pierce + (loadTest ? 99 : 0), bounce: me.up.bounce, home: me.up.homing,
      clean: K.clean, rail: me.cls === 'qa', hits: new Set(), mine: true });
  }
  const mx = me.x + Math.cos(a) * 22, my = me.y + Math.sin(a) * 22, heavy = me.cls === 'qa' || me.cls === 'refactorer';
  parts.push({ x: mx, y: my, vx: 0, vy: 0, life: .07, max: .07, col: PCOL[myColor], big: heavy ? 22 : 13 }); // muzzle bloom
  parts.push({ x: mx, y: my, vx: 0, vy: 0, life: .05, max: .05, col: '#fff', big: heavy ? 11 : 6 });
  for (let i = 0; i < (heavy ? 5 : 2); i++) { const sa = a + rand(-.5, .5), sv = rand(250, 600); parts.push({ x: mx, y: my, vx: Math.cos(sa) * sv, vy: Math.sin(sa) * sv, life: .12, max: .12, col: '#fff' }); }
  const kick = { refactorer: 140, qa: 110 }[me.cls] || 30;
  me.vx -= Math.cos(a) * kick; me.vy -= Math.sin(a) * kick;
  if (me.cls === 'qa') { sfx(220, .2, 'sawtooth', .05, 1800); shake = Math.max(shake, 4); }
  else if (me.cls === 'refactorer') { sfx(140, .12, 'square', .05, 60); shake = Math.max(shake, 5); }
  else sfx((me.cls === 'hacker' ? 1400 : 880) + myColor * 40, .05, 'square', .016, 440);
}
function useSkill() {
  const K = myK(), x = me.x, y = me.y;
  me.skillCd = K.cd * Math.pow(.8, me.up.skill);
  if (me.syn.macro) me.sup = Math.min(100, me.sup + 12);
  pop(x, y - 50, K.skill, PCOL[myColor], 18);
  if (me.cls === 'debugger') {
    ring(x, y, 20, 700, .5, PAL.ice, 6); flash = .25; flashCol = '143,227,255'; arp([1568, 1047, 784], .04, 'triangle', .06);
    for (const b of world.bugs) if (!b.dead && Math.hypot(b.x - x, b.y - y) < 320) b.frz = 3;
    if (isHost) doFreeze(x, y); else pend.e.push(['f', x | 0, y | 0]);
  } else if (me.cls === 'refactorer') {
    ring(x, y, 20, 600, .4, PAL.white, 8); ring(x, y, 10, 400, .5, PCOL[myColor], 4); shake = 18; boom(.4, .25);
    for (const b of world.bugs) if (targetable(b) && Math.hypot(b.x - x, b.y - y) < 220) damageBug(b, 4);
    if (isHost) doRewrite(x, y); else { pend.e.push(['w', x | 0, y | 0]); discCells(x, y, 220, k => cleanCell(k, 1)); }
  } else if (me.cls === 'hacker') {
    const tx = clamp(x + me.fx * 260, 16, W - 16), ty = clamp(y + me.fy * 260, 16, H - 16);
    for (let i = 0; i <= 12; i++) {
      const px = x + (tx - x) * i / 12, py = y + (ty - y) * i / 12;
      discCells(px, py, 44, k => cleanCell(k, 1));
      parts.push({ x: px, y: py, vx: rand(-50, 50), vy: rand(-50, 50), life: .45, max: .45, col: PCOL[myColor], ch: pick(BITS) });
    }
    me.x = tx; me.y = ty; me.inv = Math.max(me.inv, .4); me.trail = [];
    for (const s of smudges) if (!s.popup) s.life = Math.min(s.life, 1.5);
    closeOldestPopup(); closeOldestPopup();
    ring(x, y, 30, -60, .3, PCOL[myColor]); ring(tx, ty, 6, 300, .3, PCOL[myColor]); sfx(300, .12, 'sawtooth', .05, 2400);
  } else if (me.cls === 'sysadmin') {
    turrets.push({ x, y, t: 10, cd: 0 }); if (turrets.length > 2) turrets.shift();
    ring(x, y, 6, 160, .4, '#5dffa8'); arp([392, 523, 784], .05, 'square', .05);
  } else if (me.cls === 'qa') {
    me.stress = 3; ring(x, y, 10, 300, .4, PAL.gold, 4); arp([880, 1175, 1568], .04, 'square', .05);
  }
}

// ---------- per-frame update ----------
function updMe(dt, I) {
  me.firing = false;
  if (world.phase !== 'play') return;
  if (me.down) {
    const o = [...others.values()].find(q => !q.d && Math.hypot(q.x - me.x, q.y - me.y) < 70);
    me.rev = o ? me.rev + dt * (o.cls === 'sysadmin' ? 2 : 1) : Math.max(0, me.rev - dt);
    if (me.rev >= 2) { me.down = false; me.hp = Math.min(2, me.mh); me.inv = 2; pop(me.x, me.y - 40, 'REBOOTED', PCOL[myColor], 20); arp([392, 523, 659, 784], .06, 'triangle', .06); }
    return;
  }
  const K = myK();
  me.inv -= dt; me.cd -= dt; me.dashCd -= dt; me.skillCd -= dt; me.stress -= dt; me.superT -= dt; me.noCharge -= dt; me.chainT -= dt;
  if (me.superT > 0) me.sup = 0; // no meter gain of any kind (boss kills, SUPER CELL, MACRO) while LOAD TEST runs, so supers can't stack
  if (me.superT > 0 || (I.fire && !I.aim)) { // LOAD TEST or keyboard firing: auto-aim at the nearest bug (LOAD TEST also keeps firing)
    const tgt = nearest(me, world.bugs.filter(targetable));
    if (tgt) I = { ...I, ax: tgt.x - me.x, ay: tgt.y - me.y, aim: true, fire: true };
  }
  if (me.chainT <= 0) me.chain = 0;
  for (const k in me.pw) me.pw[k] -= dt;
  let mx = I.mx, my = I.my; const m = Math.hypot(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  if (m > .1) { me.fx = mx / m; me.fy = my / m; }
  if (I.aim) { const am = Math.hypot(I.ax, I.ay) || 1; me.fx = I.ax / am; me.fy = I.ay / am; }
  me.a = Math.atan2(me.fy, me.fx);
  if (me.dashT > 0) {
    me.dashT -= dt;
    discCells(me.x, me.y, 60, k => cleanCell(k, dt * 7));
    if (me.syn.speedrun) for (const b of world.bugs) if (targetable(b) && Math.hypot(b.x - me.x, b.y - me.y) < b.r + 26) damageBug(b, dt * 40);
    parts.push({ x: me.x, y: me.y, vx: rand(-40, 40), vy: rand(-40, 40), life: .3, max: .3, col: PCOL[myColor] });
  } else {
    // SPAGHETTI PRIME: a noodle arm on you slows you and drags you toward the boss until you dash out
    me.tangleImm = (me.tangleImm || 0) - dt;
    const arm = me.tangleImm > 0 ? null : world.bugs.find(a => a.type === 'arm' && !a.dead && Math.hypot(a.x - me.x, a.y - me.y) < 26);
    const sp = K.speed * (1 + .12 * me.up.speed) * (me.pw.coffee > 0 ? 1.25 : 1) * (arm ? .35 : 1), k = Math.min(1, dt * 12);
    me.vx += (mx * sp - me.vx) * k; me.vy += (my * sp - me.vy) * k;
    const boss = arm && world.bugs.find(x => x.id === arm.pid);
    if (boss) { const d = Math.hypot(boss.x - me.x, boss.y - me.y) || 1; me.x += (boss.x - me.x) / d * 120 * dt; me.y += (boss.y - me.y) / d * 120 * dt; hint('TANGLED · DASH TO BREAK FREE', BUG.arm.col); }
  }
  if (I.dash && me.dashCd <= 0) {
    const dx = m > .1 ? mx : me.fx, dy = m > .1 ? my : me.fy, dn = Math.hypot(dx, dy) || 1;
    me.tangleImm = 1.2; // dashing rips free of noodle arms
    me.dashT = .16; me.dashCd = .8 * Math.pow(.75, me.up.dash); me.inv = Math.max(me.inv, .3); me.vx = dx / dn * 980; me.vy = dy / dn * 980;
    for (const s of smudges) if (!s.popup) s.life -= 1.5; // dashing shakes splats loose and knocks out one popup
    closeOldestPopup();
    sfx(200, .15, 'sawtooth', .04, 900); ring(me.x, me.y, 8, 200, .25, PCOL[myColor]);
  }
  me.x = clamp(me.x + me.vx * dt, 16, W - 16); me.y = clamp(me.y + me.vy * dt, 16, H - 16);
  if (I.fire && me.cd <= 0) { me.cd = K.fire / (1 + .2 * me.up.fire) / (me.pw.coffee > 0 ? 2 : 1) / (me.stress > 0 ? 3 : 1) / (me.superT > 0 ? 4 : 1); shoot(I); }
  me.firing = !!I.fire;
  if (I.skill) { if (me.skillCd <= 0) useSkill(); else { pop(me.x, me.y - 40, K.skill + ' ' + Math.ceil(me.skillCd) + 's', PAL.dim, 12); sfx(120, .08, 'square', .03); } }
  if (I.super) { if (me.sup >= 100) fireSuper(); else { pop(me.x, me.y - 40, K.sup + ' ' + Math.floor(me.sup) + '%', PAL.dim, 13); sfx(120, .08, 'square', .03); } }

  const shield = me.pw.firewall > 0;
  for (const b of world.bugs) {
    const D = BUG[b.type];
    if (b.dead || D.noTouch || ghostly(b) || (b.type === 'trojan' && !b.rev) || Math.hypot(me.x - b.x, me.y - b.y) > b.r + (shield ? 30 : 11)) continue;
    if (shield) { if (!D.immortal) damageBug(b, dt * 6); if (b.type !== 'boss' && !D.part) { const a = Math.atan2(b.y - me.y, b.x - me.x); b.x += Math.cos(a) * 6; b.y += Math.sin(a) * 6; } }
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
    if (s.hit || Math.hypot(s.x - me.x, s.y - me.y) > (shield ? 32 : 13)) continue;
    s.hit = true; gone.set(s.id, T);
    if (!isHost) pend.e.push(['s', s.id]);
    if (shield) ring(s.x, s.y, 4, 120, .2, '#7aa8ff');
    else if (me.inv <= 0) hurt(s, s.k === 'ad' ? 3 : 0);
  }
  for (let i = 0; i < me.up.orbit; i++) {
    const a = T * 3 + i * 6.283 / me.up.orbit, dx = me.x + Math.cos(a) * 58, dy = me.y + Math.sin(a) * 58;
    for (const b of world.bugs) if (targetable(b) && Math.hypot(b.x - dx, b.y - dy) < b.r + 9) damageBug(b, dt * (me.syn.cron ? 14 : 7));
    if (me.syn.cron) discCells(dx, dy, 44, k => cleanCell(k, dt * 3)); else cleanCell(ci(dx, dy), dt * 3);
  }
  if (me.pw.duck > 0 && (me.duckCd -= dt) <= 0) me.duckCd = autoGun(me.x - 34, me.y - 34, '#ffe066', 520) ? .22 : 0;
  for (const t of turrets) { t.t -= dt; if ((t.cd -= dt) <= 0) t.cd = autoGun(t.x, t.y, '#5dffa8', 480, 1.2) ? .2 : 0; }
  turrets = turrets.filter(t => t.t > 0);
  for (const w of world.pows) if (!w.taken && Math.hypot(me.x - w.x, me.y - w.y) < 32) grabPow(w);
  me.trail.push({ x: me.x, y: me.y }); if (me.trail.length > 12) me.trail.shift();
}
const angleDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283; return d; };
// AUTOCOMPLETE: lock onto the best bug ahead of the shot (close and in front beats close and behind),
// keep the lock until it dies, and turn at a fixed rate that grows per level so shots arc instead of orbiting.
function homeBullet(s, dt) {
  const t = s.tgt;
  if (!t || t.dead || s.hits.has(t.id)) {
    s.tgt = null;
    const heading = Math.atan2(s.vy, s.vx), reach = (300 + 60 * s.home) * (s.mine && me.syn.lsp ? 2 : 1);
    let bestScore = Infinity;
    for (const b of world.bugs) {
      if (!targetable(b) || s.hits.has(b.id)) continue;
      const d = Math.hypot(b.x - s.x, b.y - s.y); if (d > reach) continue;
      const off = Math.abs(angleDiff(heading, Math.atan2(b.y - s.y, b.x - s.x)));
      if (off > 1.3) continue; // ignore bugs well behind the shot
      const score = d * (1 + off * 1.5);
      if (score < bestScore) { bestScore = score; s.tgt = b; }
    }
    if (!s.tgt) return;
  }
  const cur = Math.atan2(s.vy, s.vx), sp = Math.hypot(s.vx, s.vy), turn = (4 + 3 * s.home) * dt;
  const na = cur + clamp(angleDiff(cur, Math.atan2(s.tgt.y - s.y, s.tgt.x - s.x)), -turn, turn);
  s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp;
}
function updBullets(dt) {
  for (const s of bullets) {
    if (s.home) homeBullet(s, dt);
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    const tail = s.mine && me.syn.tail ? 1.5 : 1;
    if (s.x < 0 || s.x > W) { if (s.bounce > 0) { s.bounce--; s.vx *= -1; s.x = clamp(s.x, 0, W); s.hits.clear(); s.dmg *= tail; } else s.life = 0; }
    if (s.y < 0 || s.y > H) { if (s.bounce > 0) { s.bounce--; s.vy *= -1; s.y = clamp(s.y, 0, H); s.hits.clear(); s.dmg *= tail; } else s.life = 0; }
    if (!s.mine || s.life <= 0) continue;
    const c = ci(s.x, s.y);
    if (cleanCell(c, s.clean) > .5) { me.score += 5; if (Math.random() < .3) parts.push({ x: s.x, y: s.y, vx: rand(-60, 60), vy: rand(-60, 60), life: .4, max: .4, col: s.col, ch: CH[c] }); }
    if (me.up.clean && c >= 0) for (const d of [-1, 1, -COLS, COLS]) { const n = c + d; if (n >= 0 && n < NC && Math.abs(n % COLS - c % COLS) <= 1) cleanCell(n, .25 * me.up.clean); }
    for (let i = world.bugs.length - 1; i >= 0; i--) { // newest first, so boss parts (QR code, pillars) beat the boss body
      const b = world.bugs[i];
      if (b.dead || ghostly(b) || s.hits.has(b.id) || (b.x - s.x) ** 2 + (b.y - s.y) ** 2 > (b.r + 5) ** 2) continue;
      s.hits.add(b.id); damageBug(b, s.dmg);
      if (me.syn.types) s.dmg *= 1.25;
      if (b.type !== 'boss' && !BUG[b.type].part) { b.vx += s.vx * .06; b.vy += s.vy * .06; }
      for (let i = 0; i < 4; i++) parts.push({ x: s.x, y: s.y, vx: rand(-220, 220) - s.vx * .25, vy: rand(-220, 220) - s.vy * .25, life: .22, max: .22, col: i % 2 ? '#fff' : s.col });
      if (rings.length < 120) ring(s.x, s.y, 3, s.rail ? 260 : 160, .14, s.col, 2); // impact pop
      if (!b.dead) sfx(1400, .03, 'square', .012);
      if (s.pierce > 0) s.pierce--; else { s.life = 0; break; }
    }
  }
  bullets = bullets.filter(s => s.life > 0);
}

// ---------- upgrades + reacting to the shared world ----------
function offerUpgrades() {
  if (me.offer || me.picks <= 0) return;
  const pool = Object.keys(UPG).filter(k => me.up[k] < upgCap(me.cls, k) && !(k === 'hp' && mut('glass')));
  if (!pool.length) { // everything maxed: picks turn into points
    me.score += 2500 * me.picks; pop(me.x, me.y - 50, 'FULLY OPTIMIZED +' + fmt(2500 * me.picks), PAL.gold, 18); me.picks = 0; return;
  }
  me.offer = shuffle(pool).slice(0, 3);
}
// The synergy this pick would complete, if any (for the upgrade card and pickUpgrade)
const synFrom = k => Object.keys(SYN).find(s => !me.syn[s] && SYN[s].need.includes(k) && SYN[s].need.every(n => me.up[n] + (n === k) >= SYN_LV));
function pickUpgrade(i) {
  if (!me.offer || !me.offer[i]) return;
  const k = me.offer[i], syn = synFrom(k); me.up[k]++; me.picks--; me.offer = null;
  if (k === 'hp') { me.mh++; me.hp = myK().halfHeal ? Math.min(me.mh, me.hp + 1) : me.mh; }
  pop(me.x, me.y - 50, UPG[k][0] + ' ' + 'I'.repeat(Math.min(5, me.up[k])), PAL.gold, 18);
  ring(me.x, me.y, 10, 300, .4, PAL.gold, 4); arp([523, 784, 1047, 1568], .05, 'triangle', .06);
  if (syn) {
    me.syn[syn] = true; banner = { t: 2.4, big: SYN[syn].name, sub: 'SYNERGY · ' + SYN[syn].desc };
    ring(me.x, me.y, 10, 600, .6, '#ff4fd8', 6); chroma = Math.max(chroma, .4); arp([784, 1047, 1319, 1568, 2093], .05, 'triangle', .07);
  }
  offerUpgrades();
}
function syncLocal() {
  if (world.run !== seen.run) { seen.run = world.run; seen.wave = 0; seen.nk = world.nk; seen.hl = world.hl; seen.bk = 0; seen.cleared = false; me = mkMe(); turrets = []; smudges = []; if (mut('glass')) me.hp = me.mh = 1; }
  if (world.nk !== seen.nk) { seen.nk = world.nk; nukeFx(world.nx, world.ny); }
  if (world.hl !== seen.hl) {
    seen.hl = world.hl;
    const o = others.get(world.ht);
    if (world.ht === myNetId()) failoverFx();
    else if (o) { ring(o.x, o.y, 10, 400, .6, '#5dffa8', 6); pop(o.x, o.y - 50, o.n + ' RESTORED', '#5dffa8', 16); }
  }
  const bk = world.breakT > 0 ? 1 : 0;
  if (bk && !seen.bk && world.phase === 'play') {
    me.score += 1000 * world.wave; me.picks++; seen.cleared = true;
    if (me.down) { me.down = false; me.hp = 1; me.inv = 2; }
    banner = { t: 2.6, big: 'WAVE CLEAR', sub: '+' + fmt(1000 * world.wave) + ' · rot halved · pick an upgrade' };
    arp([523, 659, 784, 1047], .08, 'triangle', .07);
  }
  seen.bk = bk;
  if (world.wave !== seen.wave && world.phase === 'play') {
    const skipped = world.wave > seen.wave && seen.wave > 0 && !seen.cleared; // auto-skip: still earn the upgrade
    seen.wave = world.wave; seen.cleared = false; newSnippet();
    if (skipped) { me.picks++; me.score += 500 * world.wave; pop(W / 2, 150, 'WAVE SKIPPED +' + fmt(500 * world.wave) + ' · bugs carried over', PAL.gold, 16); }
    if (isBossWave(world.wave)) { const lp = bossLoop(); banner = { t: 3.2, big: bossName(world.wave) + (lp > 1 ? ' (REMIX ' + lp + ')' : ''), sub: 'BOSS INCOMING · ' + bossOf(world.wave).desc }; glitch = .6; arp([440, 330, 440, 330, 440], .18, 'sawtooth', .07); }
    else { banner = { t: 2.6, big: 'WAVE ' + world.wave, sub: waveName(world.wave) }; arp([220, 277, 330, 440], .09, 'sawtooth', .04); }
  }
  if (world.phase !== seen.phase) {
    seen.phase = world.phase; kbFocus = 0;
    if (world.phase === 'over') {
      overT = 0; shake = 24; glitch = .6; arp([330, 262, 196, 131], .14, 'sawtooth', .06);
      newBest = !adminMode && me.score > best; // sandbox scores don't count
      if (newBest) { best = me.score; try { localStorage.setItem('coderot-best', best); } catch (_) {} }
      newUnlocks = [];
      if (!adminMode) { const had = unlocked(); recordRun(); newUnlocks = SKINS.filter(s => unlocked().includes(s.id) && !had.includes(s.id)); }
    }
  }
  offerUpgrades();
}
function restart() { if (world.phase !== 'over' || overT < .8) return; if (isHost) startRun(); else pend.e.push(['r']); }
