'use strict';
// Menu wiring, game flow (solo / host / join) and the main loop.

const menuEl = document.getElementById('menu'), msgEl = document.getElementById('netmsg');
const nickEl = document.getElementById('nick'), codeEl = document.getElementById('code');
const classEl = document.getElementById('classes'), classInfo = document.getElementById('classinfo');
let copiedT = 0, busy = false;

nickEl.value = nick;
nickEl.addEventListener('input', () => {
  nick = nickEl.value.toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 12) || 'DEV';
  try { localStorage.setItem('coderot-nick', nick); } catch (_) {}
});
function renderClasses() {
  classEl.textContent = '';
  for (const k of CK) {
    const c = CLASSES[k], b = document.createElement('button');
    b.type = 'button'; b.className = 'cls'; b.setAttribute('aria-pressed', String(k === myClass));
    const nm = document.createElement('b'); nm.textContent = c.name;
    const rl = document.createElement('span'); rl.textContent = c.role;
    b.append(nm, rl);
    b.onclick = () => { myClass = k; try { localStorage.setItem('coderot-class', k); } catch (_) {} renderClasses(); };
    classEl.appendChild(b);
  }
  const c = CLASSES[myClass];
  classInfo.textContent = c.desc + ' Skill: ' + c.skill + ' (' + c.skillDesc.replace(/\.$/, '') + '). Super: ' + c.sup + ' (' + c.supDesc.replace(/\.$/, '') + ').';
  const s = statOf(myClass, myDiff);
  statsEl.textContent = c.name + ' on ' + DIFFS[myDiff].name + ': ' + (s.runs ? 'best ' + fmt(s.best) + ' · wave ' + s.wave + ' · ' + fmt(s.kills) + ' kills · '
    + s.bosses + ' bosses · ' + s.runs + ' run' + (s.runs > 1 ? 's' : '') : 'no runs yet');
}
const statsEl = document.getElementById('stats');
const diffEl = document.getElementById('diffs'), diffInfo = document.getElementById('diffinfo');
function renderDiffs() {
  diffEl.textContent = '';
  for (const k of DK) {
    const d = DIFFS[k], b = document.createElement('button');
    b.type = 'button'; b.className = 'diff'; b.textContent = d.name; b.style.setProperty('--c', d.col);
    b.setAttribute('aria-pressed', String(k === myDiff));
    b.onclick = () => { myDiff = k; try { localStorage.setItem('coderot-diff', k); } catch (_) {} renderDiffs(); renderClasses(); };
    diffEl.appendChild(b);
  }
  diffInfo.textContent = DIFFS[myDiff].desc;
}
const mutEl = document.getElementById('muts'), skinEl = document.getElementById('skins');
function chip(label, on, col, title, fn, disabled) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'diff'; b.textContent = label; b.title = title; b.disabled = !!disabled;
  b.style.setProperty('--c', col); b.setAttribute('aria-pressed', String(on)); b.onclick = fn;
  return b;
}
function renderExtras() { // mutators + skins
  mutEl.textContent = '';
  for (const k of MK) mutEl.appendChild(chip(MUTS[k].name, myMuts.includes(k), '#ff4fd8', MUTS[k].desc + ' · points x' + MUTS[k].score, () => {
    myMuts = myMuts.includes(k) ? myMuts.filter(x => x !== k) : [...myMuts, k];
    try { localStorage.setItem('coderot-muts', JSON.stringify(myMuts)); } catch (_) {} renderExtras();
  }));
  const m = myMuts.reduce((a, k) => a * MUTS[k].score, 1);
  document.getElementById('mutinfo').textContent = myMuts.length ? myMuts.map(k => MUTS[k].desc).join(' · ') + ' · points x' + m.toFixed(2) : '';
  const have = unlocked(); if (!have.includes(mySkin)) mySkin = 'none';
  skinEl.textContent = '';
  for (const s of SKINS) {
    const ok = have.includes(s.id);
    skinEl.appendChild(chip(ok ? s.name : '🔒 ' + s.name, s.id === mySkin, PAL.gold, ok ? s.name : 'Locked: ' + s.need, () => {
      mySkin = s.id; try { localStorage.setItem('coderot-skin', s.id); } catch (_) {} renderExtras();
    }, !ok));
  }
}
const setMsg = (s, bad) => { msgEl.textContent = s; msgEl.classList.toggle('bad', !!bad); };

function resetWorld() {
  Object.assign(world, { phase: 'wait', wave: 0, run: 0, nk: 0, hl: 0, bugs: [], pows: [], shots: [], dep: [], queue: [], spawnT: 0, breakT: 0, nid: 1, bm: 1 });
  Object.assign(seen, { run: 0, wave: 0, nk: 0, hl: 0, bk: 0, phase: 'wait' });
  rot.fill(0); bullets = []; smudges = []; turrets = []; others.clear(); gone.clear();
  pend = { h: new Map(), c: new Set(), e: [] };
  me = mkMe(); banner = null; deaths = []; slowmo = 0;
  setAdmin(false);
}
function enterGame() { mode = 'game'; paused = false; menuEl.hidden = true; ensureAudio(); }
function setRoomInUrl(code) { try { history.replaceState(null, '', code ? '?room=' + code : location.pathname); } catch (_) {} }
function playSolo() { leaveRoom(); resetWorld(); isHost = true; myColor = 0; enterGame(); startRun(); }
async function withBusy(fn) { if (busy) return; busy = true; try { await fn(); } finally { busy = false; } }
const newCode = () => Array.from({ length: 4 }, () => pick('ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.split(''))).join('');
const cleanCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

async function startHosting(code) {
  setMsg('Creating room ' + code + '…');
  await hostRoom(code);
  resetWorld(); isHost = true; enterGame(); startRun(); setRoomInUrl(code); setMsg('');
}
async function startJoining(code) {
  setMsg('Joining room ' + code + '…');
  await joinRoom(code);
  resetWorld(); isHost = false; enterGame(); setRoomInUrl(code); setMsg('');
}
const createRoom = () => withBusy(async () => {
  for (let i = 0; i < 3; i++) { // retry if the random code is taken
    try { return await startHosting(newCode()); } catch (e) { if (e.type !== 'unavailable-id') return setMsg(netError(e), true); }
  }
  setMsg('Could not find a free room code. Try again.', true);
});
const joinByCode = () => withBusy(async () => {
  const code = cleanCode(codeEl.value);
  if (!code) return setMsg('Type the room code your friend gave you.', true);
  try { await startJoining(code); } catch (e) { setMsg(netError(e), true); }
});
const quickMatch = () => withBusy(async () => { // host the public room, or join it if someone already does
  try { await startHosting('PUBLIC'); }
  catch (e) {
    if (e.type !== 'unavailable-id') return setMsg(netError(e), true);
    try { await startJoining('PUBLIC'); } catch (e2) { setMsg(netError(e2), true); }
  }
});
function toMenu(message) {
  leaveRoom(); setRoomInUrl('');
  mode = 'menu'; paused = false; menuEl.hidden = false; resetWorld(); ambient(); renderClasses(); renderExtras();
  document.getElementById('solo').focus(); // keyboard players land back on PLAY SOLO
  setMsg(message || '', !!message);
}
function copyInvite() {
  const link = location.origin + location.pathname + '?room=' + roomCode;
  const done = () => { copiedT = T + 2; };
  if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => { pop(W / 2, H / 2 + 140, link, PAL.white, 13); });
  else pop(W / 2, H / 2 + 140, link, PAL.white, 13);
}
// Background: real snippets of this game's own source, a new one every wave. Needs http(s); file:// keeps the fallback.
const SRC_FILES = ['world', 'player', 'render', 'net', 'input', 'main', 'config', 'audio', 'state'];
let codePool = [];
function newSnippet() {
  for (let tries = 0; tries < 30 && codePool.length; tries++) {
    const src = pick(codePool), start = Math.random() * (src.lines.length - ROWS) | 0;
    const lines = src.lines.slice(start, start + ROWS).map(l => { // halve indentation so more code fits in 32 tiles
      const ind = l.match(/^ */)[0].length; return ' '.repeat(Math.min(6, ind >> 1)) + l.trim();
    });
    if (lines.filter(l => l.trim().length > 3).length < 12) continue; // skip mostly-blank stretches
    return setCode(lines, start + 1, src.f + ':' + (start + 1));
  }
}
Promise.all(SRC_FILES.map(f => fetch('js/' + f + '.js').then(r => r.ok ? r.text() : '').then(t => ({ f: f + '.js', lines: t.split('\n') }), () => null)))
  .then(list => { codePool = list.filter(x => x && x.lines.length > ROWS * 2); newSnippet(); });

function ambient() { world.bugs = []; for (let i = 0; i < 9; i++) world.bugs.push(mkBug(pick(['crawl', 'zip', 'fork', 'adware']), rand(0, W), rand(0, H), -i - 1)); }

// ---------- settings panel ----------
const setEl = document.getElementById('settings'), volEl = document.getElementById('s-volume'), volOut = document.getElementById('s-volume-out');
const SET_BOXES = ['shake', 'flash', 'glitch', 'particles', 'numbers', 'music'];
function syncSettingsUI() {
  for (const k of SET_BOXES) document.getElementById('s-' + k).checked = SET[k];
  volEl.value = Math.round(SET.volume * 100); volOut.textContent = volEl.value + '%';
}
for (const k of SET_BOXES) document.getElementById('s-' + k).onchange = e => { SET[k] = e.target.checked; saveSettings(); };
volEl.oninput = () => { SET.volume = volEl.value / 100; volOut.textContent = volEl.value + '%'; saveSettings(); };
volEl.onchange = () => { ensureAudio(); sfx(660, .12, 'square', .06); }; // preview the new volume
function openSettings() { if (mode === 'game' && world.phase === 'play') paused = true; syncSettingsUI(); setEl.hidden = false; document.getElementById('s-done').focus(); }
function closeSettings() { setEl.hidden = true; if (mode === 'menu') document.getElementById('opensettings').focus(); }
document.getElementById('opensettings').onclick = openSettings;
document.getElementById('s-done').onclick = closeSettings;
document.getElementById('s-reset').onclick = () => { Object.assign(SET, SET_DEFAULT); saveSettings(); syncSettingsUI(); };

document.getElementById('solo').onclick = playSolo;
document.getElementById('quick').onclick = quickMatch;
document.getElementById('create').onclick = createRoom;
document.getElementById('join').onclick = joinByCode;
if (!netAvailable()) { document.getElementById('online').hidden = true; }
const urlRoom = cleanCode(new URLSearchParams(location.search).get('room'));
if (urlRoom) { codeEl.value = urlRoom; setMsg('Invited to room ' + urlRoom + '. Pick a class, then press JOIN.'); }
renderClasses(); renderDiffs(); renderExtras();
const autoSkipEl = document.getElementById('autoskip');
autoSkipEl.checked = myAutoSkip;
function setAutoSkip(on) { // menu checkbox + pause-menu toggle; mid-run it changes the live room (host only)
  myAutoSkip = autoSkipEl.checked = on; if (mode === 'game' && isHost) world.autoskip = on;
  try { localStorage.setItem('coderot-autoskip', on ? '1' : '0'); } catch (_) {}
}
autoSkipEl.onchange = () => setAutoSkip(autoSkipEl.checked);

// ---------- main loop ----------
function update(dt) {
  T += dt; shake = Math.max(0, shake - dt * 40); flash = Math.max(0, flash - dt * 1.6);
  glitch = Math.max(0, glitch - dt * 1.5); chroma = Math.max(0, chroma - dt * 1.5);
  const damp = Math.pow(.06, dt);
  for (const q of parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= damp; q.vy *= damp; }
  for (const r of rings) { r.life -= dt; r.r += r.vr * dt; }
  for (const q of pops) { q.life -= dt * .9; q.y -= 40 * dt; }
  parts = parts.filter(q => q.life > 0); rings = rings.filter(r => r.life > 0); pops = pops.filter(q => q.life > 0);
  for (const d of RAIN) { d.y += d.sp * dt; if (d.y - d.len * 18 > H) { d.y = -20; d.x = Math.floor(rand(0, COLS)) * CELL + CELL / 2; } }
  if (banner && (banner.t -= dt) <= 0) banner = null;
  bossDeathTick(dt);
  for (const [id, t] of gone) if (T - t > 3) gone.delete(id);

  if (mode !== 'game') { updBugs(dt); for (let k = 0; k < NC; k++) rot[k] = Math.max(0, rot[k] - dt * .35); return; }
  if (world.phase === 'over') { overT += dt; paused = false; }
  if (paused && !online()) return; // solo pauses the world; online it keeps going
  const I = paused ? NO_INPUT : readInput();
  me.t += dt;
  for (const s of smudges) {
    s.life -= dt;
    if (!s.popup || s.life <= 0) continue;
    s.x += s.vx * dt; s.y += s.vy * dt; // drift and bounce around the screen
    if (s.x < s.w / 2 || s.x > W - s.w / 2) { s.vx *= -1; s.x = clamp(s.x, s.w / 2, W - s.w / 2); }
    if (s.y < s.h / 2 + 62 || s.y > H - s.h / 2) { s.vy *= -1; s.y = clamp(s.y, s.h / 2 + 62, H - s.h / 2); }
    if ((s.breed -= dt) <= 0) { s.breed = rand(3.5, 5.5); if (Math.random() < .55) addPopup(null, s.x + rand(-80, 80), s.y + rand(-60, 60)); } // popups breed popups
  }
  smudges = smudges.filter(s => s.life > 0);
  if (isHost) { if (!(adminMode && ADM.freeze)) hostUpdate(dt); } // sandbox can freeze the whole world
  else {
    for (const b of world.bugs) { // smooth toward the host's positions
      const k = Math.min(1, dt * 12), px = b.x, py = b.y;
      b.x += (b.tx - b.x) * k; b.y += (b.ty - b.y) * k; b.hit -= dt; b.frz -= dt;
      if (dt) { b.vx = b.vx * .8 + (b.x - px) / dt * .2; b.vy = b.vy * .8 + (b.y - py) / dt * .2; }
    }
    updShots(dt); calcRot();
  }
  if (world.run) { syncLocal(); bossEvents(); }
  updMe(dt, I);
  if (adminMode) admTick();
  for (const o of others.values()) { // friends: smooth position + cosmetic shots
    o.x += (o.tx - o.x) * Math.min(1, dt * 14); o.y += (o.ty - o.y) * Math.min(1, dt * 14);
    o.trail.push({ x: o.x, y: o.y }); if (o.trail.length > 12) o.trail.shift();
    const K = CLASSES[o.cls];
    if (o.f && !o.d && (o.fireT -= dt) <= 0) {
      o.fireT = K.fire;
      for (let i = 0; i < o.sh; i++) {
        const s = (i - (o.sh - 1) / 2) * (K.spread || .08);
        bullets.push({ x: o.x, y: o.y, vx: Math.cos(o.a + s) * K.bspeed, vy: Math.sin(o.a + s) * K.bspeed, life: K.life, col: o.col, mine: false, bounce: 0, rail: o.cls === 'qa', hits: new Set() });
      }
    }
  }
  updBullets(dt);
  netTick(dt);
  if (world.phase === 'play' && !paused) musicTick(dt, clamp(rotFrac / ROT_LIMIT, 0, 1), !!bossAlive());
}

let last = performance.now();
function frame(now) {
  let dt = Math.min(.033, (now - last) / 1000) * (adminMode ? ADM.speed : 1); last = now;
  if (hitstop > 0) { hitstop -= dt; dt = 0; }
  if (slowmo > 0) { slowmo -= dt; dt *= .3; } // boss kill-cam
  update(dt); draw(now / 1000);
  requestAnimationFrame(frame);
}
ambient(); requestAnimationFrame(frame);
