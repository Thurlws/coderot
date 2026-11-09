'use strict';
// Bosses: six brains, each with a signature mechanic built from "parts" (pillars, QR code, noodle arms, loop body,
// CI pods, hologram decoys). Parts are ordinary bugs with a pid (parent boss id), so hits, kills and online sync
// work like any other enemy. Host-only logic: setupBoss, bossAI, bossParts, partKilled. Everyone: dmgMul, bossEvents.
// Bosses fight inside ARENA (a locked box in the middle of the map, config.js); every position below is relative to it.

const ringShots = (x, y, n, sp, off = T, k = 'orb') => { for (let i = 0; i < n; i++) fireShot(x, y, i * 6.283 / n + off, sp, k); };
const fanShots = (x, y, a, n, gap, sp, k = 'orb') => { for (let i = 0; i < n; i++) fireShot(x, y, a + (i - (n - 1) / 2) * gap, sp, k); };
const steer = (b, x, y, max) => { const dx = x - b.x, dy = y - b.y, d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d, Math.min(max, d * 2.5)]; };
const bossDef = b => BOSSES[b.kind] || BOSSES[0];
const partsOf = (b, type) => world.bugs.filter(p => p.pid === b.id && !p.dead && (!type || p.type === type));
const bossTier = () => Math.max(1, Math.floor(world.wave / 5));
const partHpMul = () => (1 + .35 * (bossTier() - 1)) * (1 + .5 * others.size);
const LAUNCH_T = 45, podHp = () => partHpMul() * 1.4; // THE FINAL DEPLOY: launch countdown + tougher CI pods

function spawnPart(type, b, slot, hpMul = 1, x = b.x, y = b.y) {
  const p = mkBug(type, x, y, world.nid++); p.pid = b.id; p.slot = slot;
  p.hp = p.mhp = Math.round(BUG[type].hp * dif().hp * hpMul * 10) / 10;
  world.bugs.push(p); return p;
}
function setupBoss(b) {
  const B = bossDef(b); b.r = B.r; b.aux = 0;
  if (B.ai === 'monolith') for (let i = 0; i < 3; i++) spawnPart('pillar', b, i, partHpMul());
  if (B.ai === 'bsod') spawnPart('qr', b, 0);
  if (B.ai === 'spaghetti') { b.armT = 1; b.cuts = 0; }
  if (B.ai === 'loop') { b.ps = -1.57; b.pcx = ARENA.x + ARENA.w / 2; b.pcy = ARENA.y + ARENA.h / 2; b.hist = []; b.shed = 0; for (let i = 0; i < 22; i++) spawnPart('body', b, i); }
  if (B.ai === 'deploy') { b.aux = LAUNCH_T; b.holoT = 6; for (let i = 0; i < 4; i++) spawnPart('pod', b, i, podHp()); }
}

// How much of a hit a target takes. 0 = blocked (shield, armor body, immortal part).
function dmgMul(b, viaQr) {
  const D = BUG[b.type];
  if (D.immortal) return 0;
  if (b.type !== 'boss') return 1;
  const ai = bossDef(b).ai, stunned = b.stn > 0;
  if (ai === 'monolith') return partsOf(b, 'pillar').length ? 0 : 1;
  if (ai === 'bsod') return viaQr ? (stunned ? 2 : 1) : 0;
  if (ai === 'deploy') return stunned ? 2 : .25; // armored until the launch is aborted
  if (ai === 'spaghetti') return stunned ? 2 : 1;
  return 1;
}
// Worth aiming at (aim assist, homing, turrets, LOAD TEST)?
// bullets and bodies pass through: decoys, a zombie's grave, a CACHE MISS mid-jump
const ghostly = b => BUG[b.type].ghost || ((b.type === 'zombie' || b.type === 'cache') && b.aux > 0);
const targetable = b => !b.dead && !ghostly(b) && (BUG[b.type].fwd || dmgMul(b) > 0) && (b.rev || b.type !== 'trojan');

function hint(text, col = PAL.gold) { if (T - hintT > 2.5) { hintT = T; popS(W / 2, 140, text, col, 18); } }
function blockedHint(b) {
  cue('armor', 1, 1, .12);
  if (b.type === 'body') return hint('ONLY THE HEAD TAKES DAMAGE');
  if (b.type !== 'boss') return;
  const ai = bossDef(b).ai;
  if (ai === 'monolith') hint('SHIELDED · BREAK THE PILLARS', PAL.ice);
  if (ai === 'bsod') hint('ONLY THE QR CODE TAKES DAMAGE', '#2570D4');
}

// After the first loop through all 6 bosses they come back remixed: loop 2 adds shot rings, loop 3+ also calls in blinking escorts.
const bossLoop = (w = world.wave) => Math.floor((Math.max(1, Math.floor(w / 5)) - 1) / BOSSES.length) + 1;
function bossRemix(b, dt) {
  const loop = bossLoop(); if (loop < 2 || b.age < 4) return;
  if ((b.rmx = (b.rmx ?? 3) - dt) > 0) return;
  b.rmx = 4.5 * dif().fire;
  ringShots(b.x, b.y, 8 + 3 * loop, 210);
  if (loop >= 3) for (let i = 0; i < 2; i++) kid(spawnBug('cache', b.x + rand(-80, 80), b.y + rand(-80, 80)));
}

// ---------- attacks + movement (host) ----------
function bossAI(b, tgt, dt, play) { // returns a movement override [ux, uy, speed] or null (slow chase)
  const B = bossDef(b), rage = b.hp < b.mhp * .4, f = dif().fire * (rage ? .65 : 1);
  if (b.st > 0) { b.st -= dt; return [b.cx, b.cy, b.sp * 5]; } // charging
  let mv = null;
  const A = ARENA;
  if (B.ai === 'bsod') mv = steer(b, A.x + A.w / 2 + Math.sin(T * .5) * 300, A.y + 160, 160);
  if (B.ai === 'loop') mv = [0, 0, 0]; // bossParts drives it along the ∞ path
  if (B.ai === 'deploy') mv = steer(b, A.x + A.w / 2 + Math.sin(T * .35) * 260, A.y + 250, 90);
  if (!play || !tgt || b.frz > 0 || b.stn > 0 || b.y < A.y + 60) return mv;
  b.sc = (b.sc || 0) - dt;
  if (B.ai === 'kernel' && b.sc <= 0) { b.sc = .14 * f; for (const k of rage ? [0, 2.094, 4.189] : [0, Math.PI]) fireShot(b.x, b.y, T * 2.2 + k, 190, 'orb'); }
  if (B.ai === 'loop' && b.sc <= 0) { b.sc = .3 * f; fireShot(b.x, b.y, Math.atan2(tgt.y - b.y, tgt.x - b.x) + rand(-.2, .2), 270, 'orb'); }
  if ((b.cd -= dt) > 0) return mv;
  const a = Math.atan2(tgt.y - b.y, tgt.x - b.x), step = b.act++ % 4;
  const summon = (types, n) => { for (let i = 0; i < n; i++) kid(spawnBug(pick(types), b.x + rand(-70, 70), b.y + rand(-70, 70))); }; // summons pay nothing
  let cd = 2.2;
  switch (B.ai) {
    case 'monolith': // slam shockwaves while the pillars keep it safe
      if (step === 0) ringShots(b.x, b.y, rage ? 28 : 20, 170);
      if (step === 1) for (let i = -2; i <= 2; i++) fireShot(b.x, b.y, a + i * .16, 330, i === 0 ? 'ad' : 'orb');
      if (step === 2) summon(['crawl', 'fork', 'zip'], rage ? 4 : 2);
      if (step === 3) { b.st = .8; b.cx = Math.cos(a); b.cy = Math.sin(a); }
      break;
    case 'kernel': cd = 2.6;
      if (step === 0) ringShots(b.x, b.y, 24, 140);
      if (step === 1) summon(['seg'], 1);
      if (step === 2) fanShots(b.x, b.y, a, 3, .12, 340);
      break;
    case 'spaghetti': cd = 2.4;
      if (step === 0) fanShots(b.x, b.y, a, 3, .3, 260, 'ad');
      if (step === 1) summon(['adware'], rage ? 2 : 1);
      if (step === 2) discCells(b.x, b.y, 160, k => { rot[k] = Math.min(1, rot[k] + .7); });
      break;
    case 'bsod': cd = 2.6; // walls of bullets with one gap
      if (step === 0 || (rage && step === 2)) { const gap = A.x + rand(140, A.w - 140); for (let x = A.x + 20; x < A.x + A.w; x += 44) if (Math.abs(x - gap) > 95) fireShot(x, A.y + 70, Math.PI / 2, 170, 'orb'); }
      if (step === 1) { const gap = A.y + rand(150, A.h - 100); for (let y = A.y + 80; y < A.y + A.h; y += 44) if (Math.abs(y - gap) > 95) fireShot(A.x + 10, y, 0, 190, 'orb'); }
      if (step === 2 && !rage) fanShots(b.x, b.y, a, 7, .14, 300);
      if (step === 3) { summon(['zip'], 3); fireShot(b.x, b.y, a, 300, 'ad'); }
      break;
    case 'loop': cd = 2;
      if (step === 0) ringShots(b.x, b.y, 10, 230);
      if (step === 2) summon(['fork'], 2);
      if (step === 3) fanShots(b.x, b.y, a, 5, .2, 320);
      break;
    case 'deploy': cd = 1.9;
      if (step === 0) { fanShots(b.x, b.y, a, 5, .1, 380); if (rage) fanShots(b.x, b.y, a, 4, .22, 250); }
      if (step === 1) fanShots(b.x, b.y, a, 3, .45, 260, 'ad');
      if (step === 2) { summon(['trojan'], rage ? 2 : 1); ringShots(b.x, b.y, 8, 180); }
      if (step === 3) { ringShots(b.x, b.y, 16, 210); ringShots(b.x, b.y, 16, 150, T + .2); }
      break;
  }
  b.cd = cd * f;
  return mv;
}

// ---------- signature mechanics (host, every frame after movement) ----------
function bossParts(b, dt, L, play) {
  const B = bossDef(b), rage = b.hp < b.mhp * .4, frozen = b.frz > 0;
  if (b.stn > 0) b.stn -= dt;
  const A = ARENA, place = (p, x, y) => { p.x = p.tx = clamp(x, A.x + 16, A.x + A.w - 16); p.y = p.ty = clamp(y, A.y + 16, A.y + A.h - 16); };
  switch (B.ai) {
    case 'monolith': { // 3 orbiting dependency pillars shield it; break all 3 for a 6s window, then they rebuild
      const pl = partsOf(b, 'pillar');
      for (const p of pl) { const a = T * (rage ? 1.3 : .8) + p.slot * 2.094, rr = rage ? 125 : 150; place(p, b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr * .8); }
      if (!pl.length) {
        if (!b.open) { b.open = true; b.aux = 6; }
        else if ((b.aux -= dt) <= 0) { b.open = false; b.aux = 0; for (let i = 0; i < 3; i++) spawnPart('pillar', b, i, partHpMul()); }
      }
      break;
    }
    case 'kernel': { // marks tiles DEPRECATED (2s warning), then they burn for 4s
      if (play && !frozen && (b.dpT = (b.dpT ?? 3) - dt) <= 0) {
        b.dpT = rage ? 3 : 4.5;
        const spots = L.map(p => [p.x + rand(-50, 50), p.y + rand(-50, 50)]);
        for (let i = 0; i < 2; i++) spots.push([A.x + rand(80, A.w - 80), A.y + rand(100, A.h - 80)]);
        for (const [x, y] of spots) discCells(x, y, rage ? 95 : 75, k => { if (!world.dep.some(d => d.k === k)) world.dep.push({ k, t: 6 }); });
      }
      break;
    }
    case 'spaghetti': { // noodle arms reach out, grab a dev and drag them in
      const arms = partsOf(b, 'arm'), max = rage ? 4 : 3;
      if (arms.length < max && b.stn <= 0 && (b.armT -= dt) <= 0) { b.armT = 2.5; const a = spawnPart('arm', b, arms.length, partHpMul()); a.st = 'reach'; }
      for (const a of arms) {
        const tgt = nearest(a, L), dB = Math.hypot(a.x - b.x, a.y - b.y);
        if (frozen || b.stn > 0) a.st = 'retract';
        if (a.st === 'reach' && tgt) {
          const dx = tgt.x - a.x, dy = tgt.y - a.y, d = Math.hypot(dx, dy) || 1, sp = (rage ? 300 : 230) * dt;
          place(a, a.x + dx / d * Math.min(sp, d), a.y + dy / d * Math.min(sp, d));
          if (d < 20) { a.st = 'hold'; a.hold = 2.5; a.grab = tgt; }
          if (dB > 460) a.st = 'retract';
        } else if (a.st === 'hold') {
          if (a.grab && !a.grab.d && !a.grab.down) place(a, a.grab.x, a.grab.y);
          if ((a.hold -= dt) <= 0) a.st = 'retract';
        } else {
          const d = dB || 1; place(a, a.x + (b.x - a.x) / d * 340 * dt, a.y + (b.y - a.y) / d * 340 * dt);
          if (dB < 40 && b.stn <= 0 && !frozen) a.st = 'reach';
        }
      }
      b.aux = b.cuts || 0;
      break;
    }
    case 'bsod': { // only the QR code takes damage; every 20s it reboots and heals unless you hit the QR hard enough
      const q = partsOf(b, 'qr')[0]; if (q) place(q, b.x + 92, b.y + 8);
      if (!play || frozen) break;
      if (b.aux > 0) {
        b.aux += dt * 20;
        if (b.aux >= 100) {
          if ((b.rbDmg || 0) < b.mhp * .08) { b.hp = Math.min(b.mhp, b.hp + b.mhp * .15); b.x = b.tx = A.x + rand(260, A.w - 260); b.y = b.ty = A.y + rand(150, 240); }
          else b.stn = 4;
          b.aux = 0; b.rbT = 0; b.rbDmg = 0;
        }
      } else if (b.stn <= 0 && (b.rbT = (b.rbT || 0) + dt) > (rage ? 14 : 20)) { b.aux = .01; b.rbDmg = 0; }
      break;
    }
    case 'loop': { // head runs a figure-eight that drifts toward the devs; the body follows its trail
      const AX = 360, Bv = 400, sp = (rage ? 1.25 : .9) * (frozen ? .12 : 1), tgt = nearest(b, L);
      if (tgt && !frozen) { b.pcx += Math.sign(tgt.x - b.pcx) * 35 * dt; b.pcy += Math.sign(tgt.y - b.pcy) * 35 * dt; }
      b.pcx = clamp(b.pcx, A.x + AX + 20, A.x + A.w - AX - 20); b.pcy = clamp(b.pcy, A.y + 190, A.y + A.h - 190);
      b.ps += sp * dt;
      const d = 1 + Math.sin(b.ps) ** 2, nx = b.pcx + AX * Math.cos(b.ps) / d, ny = b.pcy + Bv * Math.sin(b.ps) * Math.cos(b.ps) / d;
      if (dt) { b.vx = (nx - b.x) / dt; b.vy = (ny - b.y) / dt; }
      b.x = b.tx = nx; b.y = b.ty = ny;
      b.hist.push([nx, ny]); if (b.hist.length > 1200) b.hist.shift();
      const body = partsOf(b, 'body').sort((p, q) => p.slot - q.slot);
      let acc = 0, j = 0;
      for (let h = b.hist.length - 1; h > 0 && j < body.length; h--) {
        acc += Math.hypot(b.hist[h][0] - b.hist[h - 1][0], b.hist[h][1] - b.hist[h - 1][1]);
        if (acc >= 26 * (j + 1)) { place(body[j], b.hist[h - 1][0], b.hist[h - 1][1]); j++; }
      }
      for (; j < body.length; j++) place(body[j], b.x, b.y);
      const th = [.75, .5, .25];
      while (b.shed < 3 && b.hp < b.mhp * th[b.shed]) { // shed the tail: each lost segment becomes a fork bomb
        b.shed++;
        for (const p of body.slice(-6)) { p.dead = true; gone.set(p.id, T); burst(p.x, p.y, B.col, 8, true); kid(spawnBug('fork', p.x, p.y)); }
      }
      break;
    }
    case 'deploy': { // 4 CI pods fire at you; break them all before T-0 to abort the launch
      const pods = partsOf(b, 'pod'), offs = [[-100, -70], [-115, 15], [100, -70], [115, 15]];
      for (const p of pods) {
        const o = offs[p.slot % 4]; place(p, b.x + o[0], b.y + o[1] + Math.sin(T * 2 + p.slot) * 4);
        if (play && !frozen && b.stn <= 0 && (p.cd = (p.cd ?? rand(.5, 1.5)) - dt) <= 0) {
          p.cd = (rage ? .9 : 1.4) * dif().fire; const t = nearest(p, L);
          if (t) fanShots(p.x, p.y, Math.atan2(t.y - p.y, t.x - p.x), rage ? 2 : 1, .18, 330);
        }
      }
      for (const h of partsOf(b, 'holo')) {
        if ((h.life -= dt) <= 0) { h.dead = true; gone.set(h.id, T); continue; }
        if (play && !frozen && (h.cd = (h.cd ?? rand(.8, 1.6)) - dt) <= 0) { // decoys shoot too, so you can't just ignore them
          h.cd = 1.8 * dif().fire; const t = nearest(h, L);
          if (t) fireShot(h.x, h.y, Math.atan2(t.y - h.y, t.x - h.x), 260, 'orb');
        }
      }
      if (!play || frozen) break;
      if (!pods.length && !b.aborting) { b.aborting = true; b.stn = 4; b.aux = LAUNCH_T; b.hp -= b.mhp * .15; if (b.hp <= 0) killBug(b, false); }
      if (b.aborting && b.stn <= 0) { b.aborting = false; for (let i = 0; i < 4; i++) spawnPart('pod', b, i, podHp()); }
      if (!b.aborting && (b.aux -= dt * (rage ? 1.75 : 1)) <= 0) { // LAUNCH: prod gets wrecked
        b.aux = LAUNCH_T;
        for (let k = 0; k < NC; k++) if (Math.random() < .3) rot[k] = 1;
        for (const t of ['crawl', 'crawl', 'crawl', 'crawl', 'zip', 'zip', 'zip', 'adware', 'adware', 'trojan']) kid(spawnBug(t));
        b.hp = Math.min(b.mhp, b.hp + b.mhp * .1); // a successful launch also patches the boss
        const have = new Set(pods.map(p => p.slot)); for (let i = 0; i < 4; i++) if (!have.has(i)) spawnPart('pod', b, i, podHp());
      }
      if ((b.holoT -= dt) <= 0) { // jump somewhere new and leave two hologram decoys behind
        b.holoT = rage ? 7 : 11;
        const spots = [0, 1, 2].map(() => [A.x + rand(240, A.w - 240), A.y + rand(190, 330)]);
        b.x = b.tx = spots[0][0]; b.y = b.ty = spots[0][1];
        for (let i = 1; i < 3; i++) { const h = spawnPart('holo', b, i, 1, spots[i][0], spots[i][1]); h.life = 6; }
      }
      break;
    }
  }
}
function partKilled(p) { // host: a breakable part died
  const b = world.bugs.find(x => x.id === p.pid && !x.dead); if (!b) return;
  if (p.type === 'arm') { b.cuts = (b.cuts || 0) + 1; if (b.cuts >= 3) { b.cuts = 0; b.stn = 5; } }
}

// ---------- banners + hints from what the boss is doing (runs everywhere, host and guests) ----------
function bossEvents() {
  for (const b of world.bugs) {
    if (b.type !== 'boss' || b.dead) continue;
    const ai = bossDef(b).ai, stn = b.stn > 0, au = b.aux || 0;
    if (b.wStn === false && stn) {
      const msg = { spaghetti: ['NOODLES CUT', 'STUNNED · 2x DAMAGE'], bsod: ['REBOOT FAILED', 'STUNNED · 2x DAMAGE'], deploy: ['LAUNCH ABORTED', 'ARMOR DOWN · 2x DAMAGE'] }[ai];
      if (msg) { banner = { t: 2.2, big: msg[0], sub: msg[1] }; cue('update'); }
    }
    if (ai === 'monolith') { const open = au > 0; if (open && b.wOpen === false) { banner = { t: 2, big: 'CORE EXPOSED', sub: 'hit it now · pillars rebuild in 6s' }; cue('armorbreak'); } b.wOpen = open; }
    if (ai === 'bsod') {
      if (au > 0 && !(b.wAux > 0)) { banner = { t: 2, big: 'REBOOTING', sub: 'hit the QR code before 100%!' }; cue('uiglitch'); cue('loadstart'); }
      if (b.wAux > 0 && au === 0 && !stn) { banner = { t: 2, big: 'REBOOTED', sub: 'it healed 15% · hit the QR code harder' }; }
    }
    if (ai === 'deploy' && b.wAux !== undefined && b.wAux < 3 && au > LAUNCH_T - 10 && !stn) {
      banner = { t: 2.6, big: 'DEPLOYED TO PROD', sub: 'rot everywhere · it healed 10% · break the CI pods next time' };
      flash = 1; flashCol = '255,62,52'; shake = 30; glitch = .8; cue('cannon');
    }
    b.wStn = stn; b.wAux = au;
  }
}
