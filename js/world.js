'use strict';
// World simulation. Runs on the host (or locally in solo); clients only mirror it from snapshots (net.js).
// Boss brains and boss parts live in bosses.js.

const ci = (x, y) => { const c = Math.floor(x / CELL), r = Math.floor(y / CELL); return c >= 0 && c < COLS && r >= 0 && r < ROWS ? r * COLS + c : -1; };
function discCells(x, y, r, fn) {
  const c0 = Math.max(0, Math.floor((x - r) / CELL)), c1 = Math.min(COLS - 1, Math.floor((x + r) / CELL));
  const r0 = Math.max(0, Math.floor((y - r) / CELL)), r1 = Math.min(ROWS - 1, Math.floor((y + r) / CELL));
  for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++)
    if (Math.hypot((cc + .5) * CELL - x, (rr + .5) * CELL - y) < r) fn(rr * COLS + cc);
}
function cleanCell(k, amt) { // returns how rotten the cell was; clients also queue it for the host
  if (k < 0 || rot[k] <= 0) return 0;
  const before = rot[k]; rot[k] = Math.max(0, rot[k] - amt); cleanedAt[k] = T;
  if (!isHost) pend.c.add(k);
  return before;
}

// ---------- enemies ----------
const isPart = b => !!BUG[b.type].part;
const maxBugs = () => online() ? 70 : 90;
const bossHp = () => Math.round((320 + 230 * (Math.max(1, Math.floor(world.wave / 5)) - 1)) * (1 + .6 * others.size) * dif().hp);
function mkBug(type, x, y, id, kind) {
  const D = BUG[type];
  let hp = D.hp + (type === 'seg' ? Math.floor(world.wave / 3) * 4 : 0) + (type === 'leak' ? Math.floor(world.wave / 4) * 2 : 0);
  hp = type === 'boss' ? world.bm : Math.max(1, Math.round(hp * dif().hp * (1 + WAVE_HP * Math.max(0, world.wave - 1)) * (mut('loot') ? 1.25 : 1) * 10) / 10);
  return { id, type, x, y, tx: x, ty: y, vx: 0, vy: 0, r: D.r, hp, mhp: hp, sp: D.sp * dif().sp * (type === 'boss' ? 1 : (1 + world.wave * .03) * (mut('turbo') ? 1.3 : 1)),
    ph: rand(0, 9), hit: 0, dead: false, cd: rand(1.2, 2.5), act: 0, st: 0, cx: 0, cy: 0, frz: 0, rev: false, age: 0, aux: 0, stn: 0, pid: 0,
    kind: type === 'boss' ? (kind ?? bossIdx(world.wave)) : 0 }; // kind = which BOSSES entry
}
function spawnBug(type, x, y, kind) {
  if (type !== 'boss' && world.bugs.filter(b => !isPart(b)).length >= maxBugs()) return null;
  if (type === 'boss') { world.bm = bossHp(); x = W / 2; y = -70; }
  else if (x == null && type === 'trojan') { x = rand(140, W - 140); y = rand(140, H - 140); } // sits in the open posing as loot
  else if (x == null) {
    const s = Math.random() * 4 | 0;
    x = s === 0 ? -24 : s === 1 ? W + 24 : rand(0, W); y = s < 2 ? rand(0, H) : s === 2 ? -24 : H + 24;
  }
  const b = mkBug(type, x, y, world.nid++, kind); world.bugs.push(b);
  if (type === 'boss') setupBoss(b);
  if (type === 'lock') { // kind = the partner's id when spawning the second of a pair
    if (kind != null) b.aux = kind;
    else { const p = spawnBug('lock', x + rand(-50, 50), y + rand(-50, 50), b.id); if (p) b.aux = p.id; }
  }
  return b;
}
function livePlayers() {
  const L = [];
  if (mode === 'game' && world.run && !me.down) L.push(me);
  for (const o of others.values()) if (!o.d) L.push(o);
  return L;
}
function nearest(b, L) { let t = null, bd = 1e12; for (const p of L) { const d = (p.x - b.x) ** 2 + (p.y - b.y) ** 2; if (d < bd) { bd = d; t = p; } } return t; }
const fireShot = (x, y, a, sp, k) => world.shots.push({ id: world.nid++, k, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 4 });

function updBugs(dt) {
  const L = livePlayers(), play = world.phase === 'play';
  for (const b of world.bugs) {
    if (b.dead) continue;
    b.hit -= dt;
    if (isPart(b)) continue; // its boss places it (bossParts)
    const D = BUG[b.type], tgt = nearest(b, L);
    b.age += dt;
    if (b.type === 'zombie' && b.aux > 0) { // a grave: reaped if its tile gets cleaned, otherwise it rises once
      const c = ci(b.x, b.y);
      if (c >= 0 && rot[c] < .25) { burst(b.x, b.y, '#fff', 12); killBug(b, false); }
      else if ((b.aux -= dt) <= 0) { b.aux = -1; b.hp = b.mhp * .6; b.hit = .3; ring(b.x, b.y, 6, 260, .4, D.col, 5); burst(b.x, b.y, D.col, 20, true); }
      continue;
    }
    const tx = tgt ? tgt.x : W / 2 + Math.cos(T * .4 + b.ph) * 500, ty = tgt ? tgt.y : H / 2 + Math.sin(T * .6 + b.ph * 2) * 280;
    const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1;
    let ux = dx / d, uy = dy / d, sp = b.sp;
    if (b.type === 'zip') { const w = Math.sin(T * 7 + b.ph) * .9; [ux, uy] = [ux - uy * w, uy + ux * w]; }
    if (b.type === 'adware') { // keeps its distance and spams popups at you
      const want = d < 230 ? -1 : d > 330 ? 1 : 0, s = Math.sin(T * .8 + b.ph) > 0 ? 1 : -1;
      [ux, uy] = [ux * want - uy * s * .7, uy * want + ux * s * .7];
      if (play && tgt && b.frz <= 0 && (b.cd -= dt) <= 0 && d < 650) { b.cd = rand(2, 3) * dif().fire; fireShot(b.x, b.y, Math.atan2(dy, dx), 300, 'ad'); }
    }
    if (b.type === 'leak') b.r = Math.min(36, D.r + b.age * .8);
    if (b.type === 'trojan' && !b.rev) { if (tgt && d < 150) { b.rev = true; b.hit = .2; } else sp = 0; }
    if (b.type === 'lock') { // the pair spins around its midpoint while the midpoint creeps at you: a rotating beam to dodge
      const p = world.bugs.find(x => x.id === b.aux && !x.dead && x.type === 'lock');
      if (p) {
        const mx = (b.x + p.x) / 2, my = (b.y + p.y) / 2, md = Math.hypot(tx - mx, ty - my) || 1, lead = Math.min(b.id, p.id), pull = Math.min(md, b.sp * .15);
        const ang = T * (1.1 + world.wave * .02) * (lead % 2 ? 1 : -1) + lead + (b.id === lead ? 0 : Math.PI), R = 95 + 30 * Math.sin(T * .6 + lead);
        const gx = mx + (tx - mx) / md * pull + Math.cos(ang) * R, gy = my + (ty - my) / md * pull + Math.sin(ang) * R, gd = Math.hypot(gx - b.x, gy - b.y) || 1;
        ux = (gx - b.x) / gd; uy = (gy - b.y) / gd; sp = Math.min(gd * 6, 460);
      } else sp = b.sp * 2.4; // partner down: it charges you until the restart
      if (b.lone > 0 && (b.lone -= dt) <= 0) {
        const n = spawnBug('lock', b.x + rand(-40, 40), b.y + rand(-40, 40), b.id);
        if (n) { b.aux = n.id; ring(n.x, n.y, 6, 260, .4, D.col, 5); burst(n.x, n.y, D.col, 16, true); }
      }
    }
    if (b.type === 'cache' && play && tgt) { // strafes at range, phases out, jumps next to you and flushes a ring of shots
      if (b.aux > 0) {
        sp = 0;
        if ((b.st -= dt) <= 0) {
          const k = b.aux - 1; ring(b.x, b.y, b.r, -40, .25, D.col, 3);
          b.x = (k % COLS + .5) * CELL; b.y = ((k / COLS | 0) + .5) * CELL; b.vx = b.vy = 0; b.aux = 0; b.cd = rand(2.4, 3.4) * dif().fire;
          ringShots(b.x, b.y, 10, 230); fanShots(b.x, b.y, Math.atan2(tgt.y - b.y, tgt.x - b.x), 3, .2, 330);
          ring(b.x, b.y, 4, 320, .35, D.col, 4); discCells(b.x, b.y, 60, k2 => { rot[k2] = Math.min(1, rot[k2] + .5); });
        }
      } else {
        const want = d < 220 ? -1 : d > 320 ? .6 : 0, s = Math.sin(T * .9 + b.ph) > 0 ? 1 : -1;
        [ux, uy] = [ux * want - uy * s, uy * want + ux * s];
        if (b.frz <= 0 && b.age > 1.5 && (b.cd -= dt) <= 0) {
          const a = rand(0, 6.283), r = rand(110, 190), k = ci(clamp(tgt.x + Math.cos(a) * r, 60, W - 60), clamp(tgt.y + Math.sin(a) * r, 80, H - 40));
          if (k >= 0) { b.aux = k + 1; b.st = .9; }
        }
      }
    }
    if (b.type === 'zombie' && play) { // feeds on rot and spits orphaned child processes
      const c = ci(b.x, b.y); if (c >= 0 && rot[c] > .5) b.hp = Math.min(b.mhp, b.hp + dt * 2.5);
      if (b.frz <= 0 && (b.cd -= dt) <= 0) {
        b.cd = rand(4, 5.5) * dif().fire;
        for (let i = 0; i < 2; i++) spawnBug('forklet', b.x + rand(-20, 20), b.y + rand(-20, 20));
        ring(b.x, b.y, b.r, 160, .3, D.col, 3);
      }
    }
    if (b.type === 'boss' && play) bossRemix(b, dt);
    if (b.type === 'boss') { const mv = bossAI(b, tgt, dt, play); if (mv) [ux, uy, sp] = mv; if (b.y < 90 && b.age < 4) { ux = 0; uy = 1; sp = 170; } }
    if (b.frz > 0) { b.frz -= dt; sp *= .12; }
    const k = Math.min(1, dt * 3);
    b.vx += (ux * sp - b.vx) * k; b.vy += (uy * sp - b.vy) * k;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.age > 3 && (b.type === 'boss' || b.type === 'adware' || b.type === 'lock' || b.type === 'cache' || b.type === 'zombie')) { const m = b.r * .6; b.x = clamp(b.x, m, W - m); b.y = clamp(b.y, m, H - m); }
    const c = ci(b.x, b.y); if (c >= 0) rot[c] = Math.min(1, rot[c] + dt * D.rot);
    if (b.type === 'leak' || b.type === 'boss' || b.type === 'zombie') discCells(b.x, b.y, b.r * .9, k2 => { rot[k2] = Math.min(1, rot[k2] + dt * .9); });
  }
  for (const b of world.bugs) if (b.type === 'boss' && !b.dead) bossParts(b, dt, L, play);
  // ponytail: O(n²) separation, fine at these bug counts; the boss shoves, never gets shoved; parts are placed, never pushed
  const B = world.bugs;
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j], dx = b.x - a.x, dy = b.y - a.y, m = a.r + b.r, d2 = dx * dx + dy * dy;
    if (a.dead || b.dead || isPart(a) || isPart(b) || ghostly(a) || ghostly(b) || d2 >= m * m || d2 === 0) continue;
    const wa = a.type === 'boss' ? 0 : b.type === 'boss' ? 1 : .5, d = Math.sqrt(d2), o = (m - d) / d;
    a.x -= dx * o * wa; a.y -= dy * o * wa; b.x += dx * o * (1 - wa); b.y += dy * o * (1 - wa);
  }
}
function updShots(dt) { // host and clients both advance shots; clients get corrected by the next snapshot
  for (const s of world.shots) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; if (s.x < -30 || s.x > W + 30 || s.y < -30 || s.y > H + 30) s.life = 0; }
  world.shots = world.shots.filter(s => s.life > 0 && !s.hit);
}
let spreadAcc = 0;
function updRot(dt) {
  spreadAcc += dt;
  while (spreadAcc >= .1) {
    spreadAcc -= .1;
    const lm = mut('legacy') ? 2 : 1, rate = (.025 + world.wave * .004) * dif().rot * lm, breed = (.0006 + world.wave * .0001) * dif().rot * lm;
    for (let k = 0; k < NC; k++) {
      if (rot[k] < 1) continue;
      if (Math.random() < rate) {
        const c = k % COLS, r = k / COLS | 0, d = Math.random() * 4 | 0;
        const nc = c + (d === 0) - (d === 1), nr = r + (d === 2) - (d === 3);
        if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS) rot[nr * COLS + nc] = Math.min(1, rot[nr * COLS + nc] + .3);
      }
      if (!world.breakT && !admHoldSpawns() && Math.random() < breed) { // rot breeds bugs
        const x = (k % COLS + .5) * CELL, y = ((k / COLS | 0) + .5) * CELL;
        if (spawnBug('crawl', x, y)) ring(x, y, 4, 120, .4, PAL.rot);
      }
    }
  }
}
function calcRot() { let n = 0; for (let k = 0; k < NC; k++) if (rot[k] > .5) n++; rotFrac = n / NC; }

// ---------- waves ----------
function nextWave() {
  world.wave = mut('rush') ? (Math.floor(world.wave / 5) + 1) * 5 : world.wave + 1; world.queue = [];
  const w = world.wave, mul = (1 + .4 * others.size) * dif().count;
  const add = (t, n) => { for (let i = 0; i < Math.round(n); i++) world.queue.push(t); };
  if (isBossWave(w)) { add('crawl', 4 * mul); add('fork', 2 * mul); add('adware', 1 + w / 10); }
  else {
    add('crawl', (5 + w * 3) * mul);
    if (w >= 2) { add('zip', w * 1.9 * mul); add('fork', (w - 1) * .8 * mul); }
    if (w >= 3) { add('adware', Math.min(6, (w - 2) * .7) * mul); add('seg', Math.floor((w - 1) / 3) * (others.size > 1 ? 1.5 : 1)); }
    if (w >= 4) { add('leak', Math.min(4, (w - 3) * .5) * mul); add('trojan', Math.min(4, (w - 3) * .6)); }
    if (w >= 11) add('cache', Math.min(4, (w - 10) * .6) * mul); // late-game elites
    if (w >= 12) add('lock', Math.min(3, (w - 11) * .5)); // each one is a pair
    if (w >= 13) add('zombie', Math.min(4, (w - 12) * .5) * mul);
  }
  shuffle(world.queue);
  if (isBossWave(w)) world.queue.push('boss'); // pop() takes from the end, so the boss arrives first
  world.spawnT = 2;
}
function startRun() {
  world.run++; world.diff = myDiff; world.muts = myMuts.slice(); world.autoskip = myAutoSkip; world.wave = 0; world.bugs = []; world.pows = []; world.shots = []; world.dep = [];
  world.breakT = 0; world.phase = 'play';
  rot.fill(0); nextWave();
}
function hostUpdate(dt) {
  if (world.phase === 'wait') return;
  updBugs(dt); updShots(dt);
  world.bugs = world.bugs.filter(b => !b.dead);
  for (const d of world.dep) d.t -= dt;
  world.dep = world.bugs.some(b => b.type === 'boss' && BOSSES[b.kind].ai === 'kernel') ? world.dep.filter(d => d.t > 0) : [];
  for (const w of world.pows) w.t -= dt;
  world.pows = world.pows.filter(w => w.t > 0 && !w.taken);
  if (world.phase !== 'play') { for (let k = 0; k < NC; k++) rot[k] = Math.max(0, rot[k] - dt * .2); return; }
  if (!admHoldSpawns() && world.queue.length && (world.spawnT -= dt) <= 0) {
    world.spawnT = Math.max(.14, .8 - world.wave * .06) / (1 + .3 * others.size) / (mut('turbo') ? 1.4 : 1);
    spawnBug(world.queue.pop());
  }
  updRot(dt); calcRot();
  if ((me.down && [...others.values()].every(o => o.d)) || rotFrac >= ROT_LIMIT) { world.phase = 'over'; return; }
  if (admHoldSpawns()) return; // sandbox: waves don't clear or advance on their own
  if (!world.breakT && !world.queue.length && !world.bugs.length && !deaths.length) { // a dying boss finishes its show first
    world.breakT = 3; world.shots = []; for (let k = 0; k < NC; k++) rot[k] *= .5; }
  if (world.breakT && (world.breakT -= dt) <= 0) { world.breakT = 0; nextWave(); }
  else if (world.autoskip && !world.breakT && !world.queue.length && !world.bugs.some(b => b.type === 'boss')) nextWave(); // leftovers stay
}

// ---------- kills, damage and area effects ----------
function killBug(b, mine) { // runs on every machine for effects; only the host spawns children and loot
  const D = BUG[b.type], boss = b.type === 'boss', big = b.type === 'seg';
  b.dead = true; b.deadAt = T; gone.set(b.id, T);
  if (D.immortal) { burst(b.x, b.y, D.col, 6); return; } // parts that go down with their boss
  const col = boss ? (BOSSES[b.kind] || BOSSES[0]).col : D.col;
  burst(b.x, b.y, col, boss ? 40 : big ? 40 : 14, true, boss ? 500 : 420);
  ring(b.x, b.y, b.r, boss ? 500 : big ? 520 : 300, boss ? .5 : .35, col, boss ? 5 : 3);
  if (!boss) burst(b.x, b.y, '#fff', big ? 10 : 4, false, 260); // white-hot sparks over the colored debris
  shake = Math.max(shake, boss ? 40 : big ? 18 : 5);
  sfx(boss || big ? 90 : rand(260, 460), .18, 'square', .045, 60);
  if (big) { hitstop = .08; glitch = Math.max(glitch, .25); pop(b.x, b.y + 30, 'CORE DUMPED', D.col, 13); }
  if (boss) { // the big finish plays out over ~1.3s of slow-mo (bossDeathTick in render.js)
    hitstop = .12; flash = .5; flashCol = '255,255,255'; chroma = .6; glitch = .4; slowmo = .9; boom(.6, .3);
    deaths.push(mkDeath(b, col));
    me.score += 2000; me.sup = Math.min(100, me.sup + 30); me.bosses++;
  }
  if (mine) {
    me.chain++; me.chainT = 2.2; me.kills++;
    const m = 1 + Math.floor(me.chain / 5), pts = Math.round(D.pts * m * dif().score * mutScore() * (world.autoskip ? AUTO_SKIP_SCORE : 1)); me.score += pts;
    if (me.noCharge <= 0) me.sup = Math.min(100, me.sup + D.charge * (1 + SUPER_GAIN[Math.min(4, me.up.battery)]) * (CLASSES[me.cls].charge || 1)); // supers can't refill themselves
    if (SET.numbers) pop(b.x, b.y - b.r, '+' + fmt(pts) + (m > 1 ? ' x' + m : ''), m > 1 ? PAL.gold : PCOL[myColor], boss ? 26 : big ? 22 : 15);
    if (me.chain % 10 === 0) { pop(me.x, me.y - 56, me.chain + ' CHAIN!', PAL.gold, 20); arp([523, 659, 784], .05, 'square', .04); }
  }
  if (!isHost) return;
  const drop = t => world.pows.push({ id: world.nid++, type: t || pick(PT), x: clamp(b.x + rand(-40, 40), 30, W - 30), y: clamp(b.y + rand(-40, 40), 80, H - 30), t: 12 });
  if (D.part) { partKilled(b); return; }
  if (big) for (let i = 0; i < 3; i++) spawnBug('crawl', b.x + rand(-20, 20), b.y + rand(-20, 20));
  if (b.type === 'fork') for (let i = 0; i < 2; i++) spawnBug('forklet', b.x + rand(-12, 12), b.y + rand(-12, 12));
  if (b.type === 'leak') discCells(b.x, b.y, 90, k => { rot[k] = Math.min(1, rot[k] + .6); });
  if (b.type === 'zombie' && !b.aux) { // first death leaves a grave on a rotten tile
    const z = spawnBug('zombie', b.x, b.y), c = ci(b.x, b.y);
    if (z) { z.aux = 4; if (c >= 0) rot[c] = Math.max(rot[c], .9); hint('CLEAN THE GRAVE’S TILE OR IT RISES', D.col); }
  }
  if (b.type === 'lock') { const p = world.bugs.find(x => x.id === b.aux && !x.dead); if (p) p.lone = 1.5; }
  if (boss) {
    for (const p of world.bugs) if (p.pid === b.id && !p.dead) killBug(p, false); // parts go down with it
    for (let i = 0; i < 5; i++) drop(i === 0 ? 'patch' : null); world.shots = [];
  }
  else if (Math.random() < (big || b.type === 'trojan' ? 1 : mut('loot') ? .21 : .07)) drop();
}
function hostDamage(b, dmg) { // the authoritative hit: host-local hits and remote players' hits both land here
  b.hp -= dmg; b.hit = .07; b.rev = true;
  if (b.type === 'boss' && b.aux > 0 && BOSSES[b.kind].ai === 'bsod') b.rbDmg = (b.rbDmg || 0) + dmg; // damage during a reboot
  if (b.hp <= 0) killBug(b, false);
}
function damageBug(b, dmg, viaQr) {
  if (b.dead) return;
  const D = BUG[b.type];
  if (ghostly(b)) return;
  if (D.fwd) { b.hit = .07; const p = world.bugs.find(x => x.id === b.pid && !x.dead); if (p) damageBug(p, dmg, true); return; }
  const m = dmgMul(b, viaQr);
  if (m <= 0) { b.hit = .03; blockedHint(b); return; }
  dmg *= m;
  b.hp -= dmg; b.hit = .07; b.rev = true;
  if (isHost) { if (b.type === 'boss' && b.aux > 0 && BOSSES[b.kind].ai === 'bsod') b.rbDmg = (b.rbDmg || 0) + dmg; }
  else pend.h.set(b.id, (pend.h.get(b.id) || 0) + dmg);
  if (b.hp <= 0) killBug(b, true);
}
function doNuke(x, y) { // wipes every bug and all rot; bosses only lose a quarter of their HP (parts break first)
  world.nk++; world.nx = x; world.ny = y; world.shots = []; world.dep = [];
  for (const b of world.bugs) if (!b.dead && b.type !== 'boss' && !BUG[b.type].immortal) killBug(b, false);
  for (const b of world.bugs) if (!b.dead && b.type === 'boss') { b.hp -= b.mhp * .25; b.hit = .3; if (b.hp <= 0) killBug(b, false); }
  rot.fill(0);
}
function doHalt() { for (const b of world.bugs) b.frz = b.type === 'boss' ? 2.5 : 5; world.shots = []; }
function doFailover(id) { world.hl++; world.ht = String(id || '').slice(0, 64); }
function doRevert(x, y) {
  discCells(x, y, 300, k => { rot[k] = 0; });
  for (const b of world.bugs) {
    if (b.dead || BUG[b.type].immortal || Math.hypot(b.x - x, b.y - y) > 300) continue;
    b.hp -= b.type === 'boss' ? 30 * Math.max(.25, dmgMul(b, true)) : 8; b.hit = .1; if (b.hp <= 0) killBug(b, false);
  }
}
function doFreeze(x, y) { for (const b of world.bugs) if (!b.dead && Math.hypot(b.x - x, b.y - y) < 320) b.frz = b.type === 'boss' ? 1.5 : 3; }
function doRewrite(x, y) {
  discCells(x, y, 220, k => { rot[k] = 0; });
  for (const b of world.bugs) {
    if (b.dead || b.type === 'boss' || isPart(b)) continue;
    const d = Math.hypot(b.x - x, b.y - y); if (d > 220) continue;
    const a = Math.atan2(b.y - y, b.x - x); b.x += Math.cos(a) * (240 - d) * .6; b.y += Math.sin(a) * (240 - d) * .6;
  }
}
function applyAct(a) { // host: one batch of a remote player's actions. Untrusted, so clamp everything.
  if (!a || typeof a !== 'object') return;
  const h = Array.isArray(a.h) ? a.h.slice(0, 200) : [];
  for (let i = 0; i + 1 < h.length; i += 2) {
    const b = world.bugs.find(x => x.id === h[i]);
    if (b && !b.dead && !BUG[b.type].immortal) hostDamage(b, clamp(num(h[i + 1]), 0, 24));
  }
  for (const k of Array.isArray(a.c) ? a.c.slice(0, 400) : []) if (Number.isInteger(k) && k >= 0 && k < NC) rot[k] = Math.max(0, rot[k] - .6);
  for (const e of Array.isArray(a.e) ? a.e.slice(0, 20) : []) {
    if (!Array.isArray(e)) continue;
    const x = clamp(num(e[1], W / 2), 0, W), y = clamp(num(e[2], H / 2), 0, H);
    if (e[0] === 'g') { const w = world.pows.find(p => p.id === e[1]); if (w) w.taken = true; }
    if (e[0] === 's') { const s = world.shots.find(p => p.id === e[1]); if (s) s.hit = true; }
    if (e[0] === 'n') doNuke(x, y);
    if (e[0] === 'h') doHalt();
    if (e[0] === 'l') doFailover(e[1]);
    if (e[0] === 'v') doRevert(x, y);
    if (e[0] === 'f') doFreeze(x, y);
    if (e[0] === 'w') doRewrite(x, y);
    if (e[0] === 'r' && world.phase === 'over') startRun();
  }
}
