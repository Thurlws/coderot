'use strict';
// Online rooms over WebRTC using PeerJS and its free public broker, so a static Vercel deploy is enough (no server).
// Star layout: whoever creates the room hosts the world. Guests send their player state + actions ~30x/s,
// the host sends back world snapshots and everyone's player state.

const PEER_PREFIX = 'coderot-v2-';
let peer = null, conns = new Map(), hostConn = null, roomCode = '', sendAcc = 0, pingAcc = 0;
const pingCol = ms => ms < 90 ? '#5dffa8' : ms < 180 ? PAL.gold : PAL.red;
const online = () => !!peer;
const netAvailable = () => typeof Peer === 'function';

function playerState() {
  return { n: nick, c: myColor, cls: me.cls, x: me.x | 0, y: me.y | 0, a: Math.round(me.a * 100) / 100, hp: me.hp, mh: me.mh, d: me.down ? 1 : 0,
    s: me.score | 0, f: me.firing ? 1 : 0, o: me.up.orbit, fw: me.pw.firewall > 0 ? 1 : 0, dk: me.pw.duck > 0 ? 1 : 0,
    sh: CLASSES[me.cls].shots + me.up.shots + (me.pw.sudo > 0 ? 2 : 0), sk: mySkin, tu: turrets.map(t => [t.x | 0, t.y | 0]), mi: minions.map(n => [n.x | 0, n.y | 0]), bc: beacons.map(b => [b.x | 0, b.y | 0]) };
}
function upsertOther(id, s) { // everything from the network is untrusted: clamp it
  if (!s || typeof s !== 'object') return;
  let o = others.get(id);
  if (!o) { o = { id, trail: [], fireT: 0, x: clamp(num(s.x, W / 2), 0, W), y: clamp(num(s.y, H / 2), 0, H) }; others.set(id, o); }
  o.raw = s; o.seen = T;
  o.tx = clamp(num(s.x, o.x), 0, W); o.ty = clamp(num(s.y, o.y), 0, H); o.a = num(s.a);
  o.hp = clamp(num(s.hp), 0, 30); o.mh = clamp(num(s.mh, 3), 1, 30); o.d = !!s.d; o.s = num(s.s); o.f = !!s.f;
  o.o = clamp(num(s.o), 0, 8); o.fw = !!s.fw; o.dk = !!s.dk; o.sh = clamp(num(s.sh, 1), 1, 14);
  o.sk = SKINS.some(k => k.id === s.sk) ? s.sk : 'none';
  o.n = String(s.n || 'DEV').slice(0, 12); o.cls = CLASSES[s.cls] ? s.cls : 'debugger'; o.col = PCOL[clamp(num(s.c), 0, PCOL.length - 1) | 0];
  o.mi = Array.isArray(s.mi) ? s.mi.slice(0, 9).map(t => [clamp(num(t && t[0]), 0, W), clamp(num(t && t[1]), 0, H)]) : [];
  o.bc = Array.isArray(s.bc) ? s.bc.slice(0, 1).map(t => [clamp(num(t && t[0]), 0, W), clamp(num(t && t[1]), 0, H)]) : [];
  o.tu = Array.isArray(s.tu) ? s.tu.slice(0, 2).map(t => [clamp(num(t && t[0]), 0, W), clamp(num(t && t[1]), 0, H)]) : [];
}

// ---------- snapshots ----------
function encodeWorld() {
  let r = ''; for (let k = 0; k < NC; k++) r += Math.round(rot[k] * 9);
  const b = [], p = [], s = [];
  // per bug: id, type, x, y, hp, flags (1 revealed, 2 frozen, kind<<2, 32 stunned), r, aux (boss: mechanic value · part: parent id)
  for (const x of world.bugs) if (!x.dead) b.push(x.id, BT.indexOf(x.type), x.x | 0, x.y | 0, Math.ceil(x.hp * 10) / 10,
    (x.rev ? 1 : 0) | (x.frz > 0 ? 2 : 0) | (x.kind << 2) | (x.stn > 0 ? 32 : 0), Math.round(x.r), BUG[x.type].part ? x.pid : Math.round(x.aux * 10) / 10);
  const dp = []; for (const d of world.dep) dp.push(d.k, d.t <= 4 ? 1 : 0);
  for (const w of world.pows) if (!w.taken) p.push(w.id, PT.indexOf(w.type), w.x | 0, w.y | 0, Math.ceil(w.t));
  for (const x of world.shots) if (!x.hit) s.push(x.id, SHOTS.indexOf(x.k), x.x | 0, x.y | 0, x.vx | 0, x.vy | 0);
  return { df: world.diff, mu: world.muts, as: world.autoskip ? 1 : 0, mt: world.meta ? 1 : 0, sw: world.sw, ph: world.phase === 'over' ? 1 : 0, wv: world.wave, run: world.run, nk: world.nk, hl: world.hl, ht: world.ht, nx: world.nx | 0, ny: world.ny | 0,
    bk: world.breakT > 0 ? 1 : 0, q: world.queue.length, i: world.nid, bm: world.bm, r, b, p, s, dp };
}
function applyWorld(w) {
  if (!w || typeof w !== 'object') return;
  world.diff = DIFFS[w.df] ? w.df : 'normal'; world.muts = Array.isArray(w.mu) ? w.mu.filter(k => MUTS[k]).slice(0, MK.length) : []; world.autoskip = !!w.as; world.meta = !!w.mt; world.sw = num(w.sw);
  world.phase = w.ph ? 'over' : 'play'; world.wave = num(w.wv); world.run = num(w.run); world.nk = num(w.nk); world.hl = num(w.hl); world.ht = String(w.ht || '');
  world.nx = num(w.nx, W / 2); world.ny = num(w.ny, H / 2); world.breakT = w.bk ? 1 : 0; world.nid = num(w.i, 1); world.bm = num(w.bm, 1) || 1;
  world.queue.length = clamp(num(w.q), 0, 500);
  const r = typeof w.r === 'string' ? w.r : '';
  for (let k = 0; k < NC && k < r.length; k++) { const v = (r.charCodeAt(k) - 48) / 9; if (v >= 0 && v <= 1) rot[k] = T - cleanedAt[k] < .6 ? Math.min(rot[k], v) : v; }
  const ids = new Set(), byId = new Map(world.bugs.map(b => [b.id, b])), B = Array.isArray(w.b) ? w.b : [];
  for (let i = 0; i + 7 < B.length; i += 8) {
    const id = B[i], type = BT[B[i + 1]]; if (!type) continue;
    ids.add(id);
    let b = byId.get(id);
    if (!b) { if (gone.has(id)) continue; b = mkBug(type, num(B[i + 2]), num(B[i + 3]), id); world.bugs.push(b); }
    b.tx = num(B[i + 2], b.x); b.ty = num(B[i + 3], b.y); b.r = clamp(num(B[i + 6], b.r), 4, 90);
    b.rev = b.rev || !!(B[i + 5] & 1); b.frz = B[i + 5] & 2 ? Math.max(b.frz, .2) : 0; b.kind = clamp((B[i + 5] >> 2) & 7, 0, BOSSES.length - 1);
    b.stn = B[i + 5] & 32 ? .5 : 0;
    if (BUG[type].part) b.pid = B[i + 7]; else b.aux = num(B[i + 7]);
    if (b.type === 'boss') b.mhp = world.bm;
    else if (num(B[i + 4]) > b.mhp) b.mhp = num(B[i + 4]); // parts get scaled HP on the host
    if (b.dead && T - b.deadAt > 1) { b.dead = false; gone.delete(id); } // the host never got our hit: bring it back
    if (!b.dead) b.hp = num(B[i + 4], b.hp);
  }
  for (const b of world.bugs) if (!ids.has(b.id) && !b.dead) killBug(b, false); // someone else killed it
  world.bugs = world.bugs.filter(b => ids.has(b.id) || (b.dead && T - b.deadAt < .3));
  const P = Array.isArray(w.p) ? w.p : [], pw = [];
  for (let i = 0; i + 4 < P.length; i += 5) { const type = PT[P[i + 1]]; if (type && !gone.has(P[i])) pw.push({ id: P[i], type, x: num(P[i + 2]), y: num(P[i + 3]), t: num(P[i + 4], 9) }); }
  world.pows = pw;
  const S = Array.isArray(w.s) ? w.s : [], sh = [];
  for (let i = 0; i + 5 < S.length; i += 6) { const k = SHOTS[S[i + 1]]; if (k && !gone.has(S[i])) sh.push({ id: S[i], k, x: num(S[i + 2]), y: num(S[i + 3]), vx: num(S[i + 4]), vy: num(S[i + 5]), life: 4 }); }
  world.shots = sh;
  const DP = Array.isArray(w.dp) ? w.dp.slice(0, 1200) : [];
  world.dep = [];
  for (let i = 0; i + 1 < DP.length; i += 2) if (Number.isInteger(DP[i]) && DP[i] >= 0 && DP[i] < NC) world.dep.push({ k: DP[i], t: DP[i + 1] ? 2 : 5 });
}

// ---------- connections ----------
function hostRoom(code) {
  return new Promise((resolve, reject) => {
    const p = new Peer(PEER_PREFIX + code, { debug: 0 });
    let open = false;
    p.on('open', () => { open = true; peer = p; isHost = true; roomCode = code; myColor = 0; resolve(); });
    p.on('error', e => { if (!open) { p.destroy(); reject(e); } });
    p.on('disconnected', () => { if (peer === p) try { p.reconnect(); } catch (_) {} }); // lost the broker; open games keep running
    p.on('connection', c => {
      c.on('open', () => {
        if (conns.size >= 7) { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); return; }
        const used = new Set([0, ...[...conns.values()].map(x => x.color)]);
        c.color = Math.max(0, PCOL.findIndex((_, i) => !used.has(i)));
        conns.set(c.peer, c); c.send({ t: 'hi', c: c.color });
        pop(W / 2, 110, 'A DEV JOINED', PAL.white, 16);
      });
      c.on('data', d => {
        if (!d || !conns.has(c.peer)) return;
        if (d.t === 'p') { upsertOther(c.peer, d.s); if (d.a) applyAct(d.a); }
        if (d.t === 'ping') c.send({ t: 'pong', at: d.at });
        if (d.t === 'pong') { const o = others.get(c.peer); if (o) o.ping = clamp(performance.now() - num(d.at), 0, 9999); }
      });
      c.on('close', () => { conns.delete(c.peer); others.delete(c.peer); });
      c.on('error', () => {});
    });
  });
}
function joinRoom(code) {
  return new Promise((resolve, reject) => {
    const p = new Peer({ debug: 0 });
    let done = false;
    const fail = e => { if (done) return; done = true; clearTimeout(timer); p.destroy(); reject(e); };
    const timer = setTimeout(() => fail({ type: 'timeout' }), 12000);
    p.on('error', fail);
    p.on('open', () => {
      const c = p.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
      c.on('open', () => { if (done) return; done = true; clearTimeout(timer); peer = p; hostConn = c; isHost = false; roomCode = code; resolve(); });
      c.on('data', onHostMsg);
      c.on('close', () => { if (hostConn === c) { leaveRoom(); toMenu('The host left the room.'); } });
      c.on('error', () => {});
    });
  });
}
function onHostMsg(d) {
  if (!d || typeof d !== 'object') return;
  if (d.t === 'hi') myColor = clamp(num(d.c), 0, PCOL.length - 1) | 0;
  if (d.t === 'full') { leaveRoom(); toMenu('That room is full (8 devs max).'); }
  if (d.t === 'ping' && hostConn) hostConn.send({ t: 'pong', at: d.at });
  if (d.t === 'pong') myPing = clamp(performance.now() - num(d.at), 0, 9999);
  if (d.t === 'w' && peer) {
    if (d.w) applyWorld(d.w);
    const live = new Set();
    for (const s of Array.isArray(d.pl) ? d.pl.slice(0, 8) : []) {
      if (!s || s.id === peer.id) continue;
      live.add(String(s.id)); upsertOther(String(s.id), s);
    }
    for (const k of [...others.keys()]) if (!live.has(k)) others.delete(k);
  }
}
function leaveRoom() {
  const p = peer, hc = hostConn; peer = null; hostConn = null; roomCode = '';
  if (hc) try { hc.close(); } catch (_) {}
  for (const c of conns.values()) try { c.close(); } catch (_) {}
  conns.clear();
  if (p) try { p.destroy(); } catch (_) {}
}
function netTick(dt) {
  if (!peer) return;
  if ((pingAcc += dt) > 2) { // round-trip times: host measures every guest, guests measure the host
    pingAcc = 0; const m = { t: 'ping', at: performance.now() };
    if (isHost) { for (const c of conns.values()) if (c.open) c.send(m); } else if (hostConn && hostConn.open) hostConn.send(m);
  }
  sendAcc += dt; if (sendAcc < 1 / 30) return; sendAcc = 0;
  if (isHost) {
    for (const [id, o] of others) if (T - o.seen > 6) { others.delete(id); const c = conns.get(id); conns.delete(id); if (c) try { c.close(); } catch (_) {} } // tab closed without saying bye
    const msg = { t: 'w', w: world.run ? encodeWorld() : null,
      pl: [{ id: peer.id, ...playerState() }, ...[...others.values()].map(o => ({ ...o.raw, id: o.id }))] };
    for (const c of conns.values()) if (c.open) c.send(msg);
  } else if (hostConn && hostConn.open) {
    let a = null;
    if (pend.h.size || pend.c.size || pend.e.length) {
      const h = []; for (const [id, dm] of pend.h) h.push(id, Math.round(dm * 100) / 100);
      a = { h, c: [...pend.c], e: pend.e };
      pend = { h: new Map(), c: new Set(), e: [] };
    }
    hostConn.send({ t: 'p', s: playerState(), a });
  }
}
function netError(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'No room with that code. Check it with the host.';
  if (t === 'unavailable-id') return 'That room code is already taken. Try again.';
  if (t === 'timeout') return 'Timed out joining. The host may be offline or behind a strict firewall.';
  if (t === 'browser-incompatible') return 'This browser can’t do online play. Try Chrome, Edge, Firefox or Safari.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Can’t reach the matchmaking server. Check your connection and try again.';
  return 'Online play failed (' + (t || 'unknown error') + '). Try again.';
}
