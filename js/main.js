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
function renderClasses() { // the LOADOUT panel: your build at a glance (level, weapon, abilities); each card opens CHARACTER
  classEl.textContent = '';
  const L = lvInfo(), W = WEAPONS[META.wp.eq] || WEAPONS.pulse, mk = META.wp.own[META.wp.eq] || 1, pts = attrPts() + perkPts();
  const card = (big, small, tab) => {
    const b = document.createElement('button'), nm = document.createElement('b'), rl = document.createElement('span');
    b.type = 'button'; b.className = 'cls'; b.setAttribute('aria-pressed', 'false'); nm.textContent = big; rl.textContent = small;
    b.append(nm, rl); b.onclick = () => openShop(tab); classEl.appendChild(b);
  };
  card('LEVEL ' + L.lv, L.need ? fmt(L.into) + ' / ' + fmt(L.need) + ' XP' : 'MAX LEVEL', AK.find(a => attrOf(a) < BAL.attr.max) || 'body');
  card(W.name + (mk > 1 ? ' MK.' + mk : ''), 'WEAPON · ' + ATTR[W.attr].name, 'inv');
  card(ABIL[META.ab.skill].name, 'E · ' + ABIL[META.ab.sup].name + ' · Q', PERK[META.ab.skill].at);
  document.getElementById('wallet').textContent = '◆ ' + fmt(creds) + ' creds';
  document.getElementById('cwsum').textContent = cwLoad() + '/' + cwCap();
  classInfo.textContent = AK.map(a => ATTR[a].name + ' ' + attrOf(a)).join(' · ') + (pts ? ' · ' + attrPts() + ' attribute + ' + perkPts() + ' perk points to spend in CHARACTER' : '');
  const s = statOf(myDiff);
  statsEl.textContent = DIFFS[myDiff].name + ': ' + (s.runs ? 'best ' + fmt(s.best) + ' · wave ' + s.wave + ' · ' + fmt(s.kills) + ' kills · '
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
    b.onclick = () => { myDiff = k; try { localStorage.setItem('coderot-diff', k); } catch (_) {} renderDiffs(); renderClasses(); cue('tab'); };
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
  for (const k of MK) mutEl.appendChild(chip(MUTS[k].name, myMuts.includes(k), PAL.purple, MUTS[k].desc + ' · points x' + MUTS[k].score, () => {
    myMuts = myMuts.includes(k) ? myMuts.filter(x => x !== k) : [...myMuts, k];
    try { localStorage.setItem('coderot-muts', JSON.stringify(myMuts)); } catch (_) {} renderExtras(); cue(myMuts.includes(k) ? 'on' : 'off');
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
  Object.assign(world, { phase: 'wait', wave: 0, run: 0, nk: 0, hl: 0, sw: 0, bugs: [], pows: [], shots: [], dep: [], queue: [], spawnT: 0, breakT: 0, nid: 1, bm: 1 });
  Object.assign(seen, { run: 0, wave: 0, nk: 0, hl: 0, sw: 0, bk: 0, phase: 'wait' });
  rot.fill(0); bullets = []; smudges = []; turrets = []; minions = []; beacons = []; others.clear(); gone.clear();
  pend = { h: new Map(), c: new Set(), e: [] };
  me = mkMe(); banner = null; deaths = []; slowmo = 0; endDil(true); ghosts = [];
  setAdmin(false);
}
function enterGame() { mode = 'game'; paused = false; menuEl.hidden = true; document.body.classList.add('ingame'); ensureAudio(); cue('jackin'); }
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
  mode = 'menu'; paused = false; menuEl.hidden = false; document.body.classList.remove('ingame'); resetWorld(); ambient(); renderClasses(); renderExtras(); cue('close');
  document.getElementById('solo').focus(); // keyboard players land back on PLAY SOLO
  setMsg(message || '', !!message);
}
function copyInvite() {
  const link = location.origin + location.pathname + '?room=' + roomCode;
  const done = () => { copiedT = T + 2; };
  if (navigator.clipboard) navigator.clipboard.writeText(link).then(done, () => { popS(W / 2, H / 2 + 140, link, PAL.white, 13); });
  else popS(W / 2, H / 2 + 140, link, PAL.white, 13);
}
// Background: real snippets of this game's own source, a new one every wave. Needs http(s); file:// keeps the fallback.
const SRC_FILES = ['world', 'player', 'render', 'net', 'input', 'main', 'config', 'audio', 'state'];
let codePool = [];
function newSnippet() {
  for (let tries = 0; tries < 30 && codePool.length; tries++) {
    const src = pick(codePool), start = Math.random() * (src.lines.length - ROWS * 2) | 0;
    const lines = src.lines.slice(start, start + ROWS * 2).map(l => { // two editor panes side by side; halve indentation so more code fits
      const ind = l.match(/^ */)[0].length; return ' '.repeat(Math.min(6, ind >> 1)) + l.trim();
    });
    if (lines.filter(l => l.trim().length > 3).length < 24) continue; // skip mostly-blank stretches
    return setCode(lines, start + 1, src.f + ':' + (start + 1));
  }
}
Promise.all(SRC_FILES.map(f => fetch('js/' + f + '.js').then(r => r.ok ? r.text() : '').then(t => ({ f: f + '.js', lines: t.split('\n') }), () => null)))
  .then(list => { codePool = list.filter(x => x && x.lines.length > ROWS * 2); newSnippet(); });

function ambient() { world.bugs = []; for (let i = 0; i < 9; i++) world.bugs.push(mkBug(pick(['crawl', 'zip', 'fork', 'adware']), cam.x + rand(0, W), cam.y + rand(0, H), -i - 1)); } // the menu shows the map's centre

// ---------- settings panel ----------
const setEl = document.getElementById('settings'), volEl = document.getElementById('s-volume'), volOut = document.getElementById('s-volume-out');
const mvolEl = document.getElementById('s-mvol'), mvolOut = document.getElementById('s-mvol-out');
const SET_BOXES = ['shake', 'flash', 'glitch', 'particles', 'numbers', 'music'];
function syncSettingsUI() {
  for (const k of SET_BOXES) document.getElementById('s-' + k).checked = SET[k];
  volEl.value = Math.round(SET.volume * 100); volOut.textContent = volEl.value + '%';
  mvolEl.value = Math.round(SET.mvol * 100); mvolOut.textContent = mvolEl.value + '%';
}
for (const k of SET_BOXES) document.getElementById('s-' + k).onchange = e => { SET[k] = e.target.checked; saveSettings(); cue(SET[k] ? 'on' : 'off'); };
mvolEl.oninput = () => { SET.mvol = mvolEl.value / 100; mvolOut.textContent = mvolEl.value + '%'; saveSettings(); };
volEl.oninput = () => { SET.volume = volEl.value / 100; volOut.textContent = volEl.value + '%'; saveSettings(); };
volEl.onchange = () => { ensureAudio(); cue('up'); }; // preview the new volume
function openSettings() { if (mode === 'game' && world.phase === 'play') paused = true; syncSettingsUI(); setEl.hidden = false; document.getElementById('s-done').focus(); cue('open'); }
function closeSettings() { setEl.hidden = true; if (mode === 'menu') document.getElementById('opensettings').focus(); cue('close'); }
document.getElementById('opensettings').onclick = openSettings;
document.getElementById('s-done').onclick = closeSettings;
document.getElementById('s-reset').onclick = () => { Object.assign(SET, SET_DEFAULT); saveSettings(); syncSettingsUI(); };

document.getElementById('solo').onclick = playSolo;
document.getElementById('quick').onclick = quickMatch;
document.getElementById('create').onclick = createRoom;
document.getElementById('join').onclick = joinByCode;

// ---------- CHARACTER: one perk tree per attribute (attribute + perk points, from levels) and an INVENTORY tab (weapons, creds). Hold to buy ----------
const shopEl = document.getElementById('shop'), metaEl = document.getElementById('metaonline');
let ptTab = 'body', ptSel = null, ptHold = null, ptFx = null, respecT = 0;
const PT_ICON = { // original line icons, 24x24
  dmg: 'M12 2v6M12 16v6M2 12h6M16 12h6M12 9l3 3-3 3-3-3z', fire: 'M3 6l6 6-6 6M10 6l6 6-6 6M17 6l4 6-4 6', speed: 'M2 8h14M2 12h18M2 16h14M16 5l5 7-5 7',
  charge: 'M3 7h16v10H3zM19 10h2v4h-2M6 10h3v4H6zM10 10h3v4h-3z', dash: 'M4 5l7 7-7 7M12 5l7 7-7 7', hp: 'M12 2l9 4v6l-3 6-6 4-6-4-3-6V6zM12 8v8M8 12h8',
  lic: 'M3 5h18v14H3zM6 9h6M6 13h10M15 8h3v3h-3z', skill: 'M12 2l10 10-10 10L2 12zM15 8H9v8h6M9 12h5', sup: 'M12 2l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z',
  warm: 'M12 2l5 8-1 2 3 3-2 6H7l-2-6 3-3-1-2z', head: 'M5 21V3M5 4h13l-3 4 3 4H5', reroll: 'M4 12l2-5 5-2 6 1M20 12l-2 5-5 2-6-1M17 3v3h-3M7 21v-3h3',
  mem: 'M4 6h16v12H4zM7 9h2v6H7zM11 9h2v6h-2zM15 9h2v6h-2zM6 18v3M10 18v3M14 18v3M18 18v3', hot: 'M3 8h15l-4-4M21 16H6l4 4',
  fup: 'M12 20V5M6 11l6-6 6 6M4 21h16', sbuf: 'M3 5l8 7-8 7zM13 5l8 7-8 7z', qd: 'M4 5h16v3H4zM4 10.5h16v3H4zM4 16h16v3H4z',
  cold: 'M12 2v20M3 7l18 10M3 17l18-10M9 3l3 2 3-2M9 21l3-2 3 2', step: 'M3 19h6v-6h6V7h6M18 4l3 3-3 3', dump: 'M4 14v6h16v-6M12 3v12M7 10l5 5 5-5',
  args: 'M3 12h6M9 12l12-7M9 12h12M9 12l12 7', plate: 'M4 4h16v7l-8 9-8-9zM4 9h16M9 4v11M15 4v11', close: 'M5 5h14v14H5zM9 9h6v6H9zM2 12h3M19 12h3',
  side: 'M2 12h4l2-6 3 12 3-9 2 3h6', hop: 'M3 19l5-12h8l5 12M17 15l4 4-5 1', mass: 'M4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5M10 10h4v4h-4z',
  lb: 'M2 12h6M8 12l5-7h8M8 12h13M8 12l5 7h8', poll: 'M4 18h10v-6H4zM9 12V8h3M14 15h3M18 13l3 2-3 2', rp: 'M3 4v5h5M4 9a8 8 0 1 1 0 6M12 8v4l3 3',
  pier: 'M2 12h20M18 8l4 4-4 4M7 7v10M12 7v10', soak: 'M6 3h12M6 21h12M7 3l10 9-10 9M17 3L7 12l10 9', reg: 'M4 6l2 2 3-3M11 7h9M4 12l2 2 3-3M11 13h9M4 18l2 2 3-3M11 19h9',
  rep: 'M2 10h9v9H2zM7 6h9v9M12 2h9v9', bite: 'M3 6h18v12H3zM3 10l3 3 3-3 3 3 3-3 3 3 3-3', auto: 'M4 20V10M2 12l2-2 2 2M12 20V6M10 8l2-2 2 2M20 20V3M18 5l2-2 2 2',
  medic: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z', watchp: 'M2 12l5-5h10l5 5-5 5H7zM12 9v6M9 12h6', macros: 'M3 7h18M3 12h12M3 17h6M17 14l4 3-4 3' };
const PT_ALIAS = { unit: 'hp', fast: 'fire', lowlat: 'speed', macros: 'macros', head: 'head' };
const S_ = BAL.stat, pc = v => Math.round(v * 1000) / 10 + '%';
const ATTR_FX = { // what one attribute point does (from BAL.stat), shown on the CHARACTER screen
  body: '+1 max HP every ' + S_.body.hpEvery + ' points', reflex: '+' + pc(S_.reflex.speed) + ' move speed, -' + pc(S_.reflex.dash) + ' dash cooldown per point',
  tech: '+' + S_.tech.cap + ' cyberware capacity, +' + pc(S_.tech.summon) + ' turret / drone damage per point',
  net: '+1 RAM every ' + S_.net.ramEvery + ' points, -' + pc(S_.net.hack) + ' quickhack upload per point', focus: '+' + pc(S_.focus.crit) + ' crit, +' + pc(S_.focus.sup) + ' super charge per point' };
const TREES = { ...Object.fromEntries(AK.map(a => [a, { name: ATTR[a].name }])), inv: { name: 'INVENTORY' } };
const treeNodes = () => ptTab === 'inv' ? WK.map((id, i) => ({ id, at: [i % 3, i / 3 | 0] })) : perkTree(ptTab);
const PT_N = 112, PT_GX = 236, PT_GY = 170; // node size, column + row pitch
const lvTxt = (d, n) => d.replace(/\d+(\.\d+)?/, m => String(Math.round(+m * n * 100) / 100)); // '+12% damage' at level 3 = '+36% damage'
const shipPath = id => 'M' + SHAPES[WEAPONS[id].shape].map(([x, y]) => (12 + x * .42).toFixed(1) + ' ' + (12 + y * .42).toFixed(1)).join('L') + 'Z';
function pnode(id) { // one node of the current tab: what it is, its level, what the next level costs (perk point or creds), how to buy it
  if (ptTab === 'inv') { // a weapon: buy it (MK.1), then MK upgrades
    const W = WEAPONS[id], mk = wpOwns(id) ? Math.max(1, META.wp.own[id] || 1) : 0, nx = mk + 1;
    const cost = mk ? BAL.wpn.mkCost[nx] || 0 : W.cost, need = mk ? BAL.wpn.mkLv[nx] || 0 : W.lv;
    return { name: W.name, max: BAL.wpn.mkMax, lv: mk, cost, need, wp: true, type: 'WEAPON · ' + ATTR[W.attr].name + ' +' + pc(S_.weapon) + ' damage per point',
      fx: n => (n > 1 ? 'MK.' + n + ': +' + pc(BAL.wpn.mkDmg * (n - 1)) + ' damage. ' : '') + W.desc,
      lock: myLv() < need ? 'REQUIRES LEVEL ' + need : '', buy: () => { META.wp.own[id] = nx; if (!mk) META.wp.eq = id; } };
  }
  const P = PERK[id], A = P.ab ? ABIL[id] : null, lv = P.free ? 1 : META.pk[id] || 0;
  return { name: P.name, max: P.max, lv, pts: 1, need: P.req, ab: A && A.k,
    type: (A ? 'ABILITY · ' + (A.k === 'skill' ? 'SKILL · E' : 'SUPER · Q') : 'PERK') + ' · ' + ATTR[P.at].name + ' ' + P.req,
    fx: n => A ? A.desc + (A.cd ? ' Cooldown ' + A.cd + 's.' : '') : lvTxt(P.desc, n),
    lock: attrOf(P.at) < P.req ? 'REQUIRES ' + ATTR[P.at].name + ' ' + P.req : '', buy: () => { META.pk[id] = lv + 1; if (A) META.ab[A.k] = id; } };
}
const ptDef = id => treeNodes().find(n => n.id === id);
const canPay = n => n.pts ? perkPts() >= n.pts : creds >= n.cost;
const isEq = id => ptTab === 'inv' ? META.wp.eq === id : META.ab.skill === id || META.ab.sup === id;
function ptState(id) { const n = pnode(id); return n.lv >= n.max ? 'max' : n.lv > 0 ? 'own' : n.lock ? 'lock' : 'open'; }
const ptPos = d => [d.at[0] * PT_GX, d.at[1] * PT_GY];
const btn = (cls, text, id, fn, off) => { const b = el('button', cls, text); b.type = 'button'; b.dataset.id = id; b.disabled = !!off; b.onclick = fn; return b; };
function raiseAttr(a) {
  if (attrPts() < 1 || attrOf(a) >= BAL.attr.max) return cue('buyfail');
  META.at[a] = attrOf(a) + 1; saveMeta(); cue(attrOf(a) >= BAL.attr.max ? 'perkmax' : 'perk'); renderShop(); renderClasses();
}
function respec() { // refunds every attribute + perk point; abilities fall back to the free pair; cyberware the new build can't run comes out
  const c = respecCost();
  if (T > respecT) { respecT = T + 3; return renderShop(); } // first press arms it (3s)
  respecT = 0; if (creds < c) { cue('buyfail'); return renderShop(); }
  creds -= c; META.at = {}; META.pk = {}; META.ab = { skill: 'breakpoint', sup: 'halt' }; cwValidate(); saveMeta(); cue('unequip'); renderShop(); renderClasses();
}
function renderShop() {
  const inv = ptTab === 'inv', a = ptTab, focusId = document.activeElement && document.activeElement.dataset.id, L = lvInfo();
  document.getElementById('shopwallet').textContent = '◆ ' + fmt(creds);
  document.getElementById('shopnick').textContent = nick;
  document.getElementById('shoplv').textContent = 'LEVEL ' + L.lv + (L.need ? ' · ' + fmt(L.into) + ' / ' + fmt(L.need) + ' XP' : ' · MAX') + ' · CHARACTER';
  const tabs = document.getElementById('shoptabs'); tabs.textContent = '';
  for (const k in TREES) {
    const b = el('button', 'tab' + (k === ptTab ? ' on' : ''), TREES[k].name + (k !== 'inv' ? ' ' + attrOf(k) : '')); b.type = 'button'; b.dataset.id = 'tab.' + k; b.setAttribute('aria-pressed', String(k === ptTab));
    b.onclick = () => { if (ptTab !== k) { ptTab = k; ptSel = null; cue('tab'); renderShop(); } }; tabs.appendChild(b);
  }
  // left column: the attribute (level, what a point does, raise), points to spend, respec
  document.getElementById('ptname').textContent = TREES[a].name;
  document.getElementById('ptkind').textContent = inv ? 'Loadout' : 'Attribute';
  document.getElementById('ptrole').textContent = inv ? 'Any build can equip any weapon. Its attribute adds damage per point; MK upgrades add more.' : ATTR[a].desc;
  document.getElementById('ptpts').textContent = inv ? fmt(creds) : perkPts();
  document.getElementById('ptptsl').innerHTML = inv ? 'Creds<br>available' : 'Perk points<br>available';
  document.getElementById('ptapts').textContent = attrPts();
  const box0 = document.getElementById('ptclasses'); box0.textContent = '';
  if (inv) {
    const W = WEAPONS[META.wp.eq], mk = META.wp.own[META.wp.eq] || 1;
    box0.appendChild(el('p', 'ptfx', 'EQUIPPED · ' + W.name + ' MK.' + mk + ' · damage x' + (1 + S_.weapon * (attrOf(W.attr) - BAL.attr.start) + BAL.wpn.mkDmg * (mk - 1)).toFixed(2)));
  } else {
    const lvl = el('p', 'ptatt'); lvl.append(el('b', '', String(attrOf(a))), el('span', '', '/ ' + BAL.attr.max)); box0.appendChild(lvl);
    box0.appendChild(el('p', 'ptfx', ATTR_FX[a] + ' · weapons: ' + WK.filter(k => WEAPONS[k].attr === a).map(k => WEAPONS[k].name).join(', ')));
    const full = attrOf(a) >= BAL.attr.max;
    box0.appendChild(btn('ptc', full ? 'MAXED' : 'RAISE ' + ATTR[a].name + ' +1', 'raise', () => raiseAttr(a), full || attrPts() < 1));
  }
  const spent = attrSpent() + perkSpent(), armed = T < respecT;
  document.getElementById('ptrespec').replaceChildren(btn('ptc' + (armed ? ' armed' : ''), armed ? 'CONFIRM · ◆ ' + fmt(respecCost()) : 'RESPEC · ◆ ' + fmt(respecCost()), 'respec', respec, !spent));
  const all = treeNodes().map(d => pnode(d.id)), got = all.reduce((s, n) => s + n.lv, 0), tot = all.reduce((s, n) => s + n.max, 0);
  document.getElementById('ptprog').textContent = got + ' / ' + tot;
  const bar = document.getElementById('ptbar'); bar.textContent = '';
  for (let i = 0; i < tot; i++) bar.appendChild(el('i', i < got ? 'on' : ''));
  // the tree: traces first (svg), nodes on top
  const N = treeNodes(), cols = Math.max(...N.map(d => d.at[0])) + 1, rows = Math.max(...N.map(d => d.at[1])) + 1;
  const cw = (cols - 1) * PT_GX + PT_N, ch = (rows - 1) * PT_GY + PT_N, cv = document.getElementById('ptcanvas');
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  const svg = document.getElementById('pttraces'); svg.textContent = '';
  svg.setAttribute('viewBox', `-60 -60 ${cw + 120} ${ch + 120}`); svg.style.width = cw + 120 + 'px'; svg.style.height = ch + 120 + 'px';
  const path = (d, cls) => { svg.appendChild(svgEl('path', { d, class: cls })); svg.appendChild(svgEl('path', { d, class: cls + ' dbl', transform: 'translate(4 4)' })); };
  for (const d of N) {
    const [x, y] = ptPos(d), st = ptState(d.id);
    path(`M${x + 70} ${y}V${y - 26}H${x + 118}`, 'stub'); svg.appendChild(svgEl('rect', { x: x + 118, y: y - 29, width: 6, height: 6, class: 'pad' }));
    path(`M${x + 26} ${y + PT_N}V${y + PT_N + 24}H${x - 22}`, 'stub'); svg.appendChild(svgEl('rect', { x: x - 28, y: y + PT_N + 21, width: 6, height: 6, class: 'pad' }));
    if (!d.pre) continue;
    const [px, py] = ptPos(ptDef(d.pre)), x1 = px + PT_N, y1 = py + PT_N / 2, x2 = x, y2 = y + PT_N / 2, xm = (x1 + x2) / 2, sg = Math.sign(y2 - y1);
    path(sg ? `M${x1} ${y1}H${xm - 12}l12 ${12 * sg}V${y2 - 12 * sg}l12 ${12 * sg}H${x2}` : `M${x1} ${y1}H${x2}`, 'trace ' + st);
  }
  const box = document.getElementById('ptnodes'); box.textContent = '';
  N.forEach(d => {
    const n = pnode(d.id), st = ptState(d.id), [x, y] = ptPos(d);
    const b = el('button', 'pnode ' + st + (d.id === ptSel ? ' sel' : '') + (d.id === ptFx ? ' fx' : ''));
    b.type = 'button'; b.dataset.id = 'pn.' + d.id; b.style.left = x + 'px'; b.style.top = y + 'px';
    b.setAttribute('aria-label', n.name + ', level ' + n.lv + ' of ' + n.max + (st === 'lock' ? ', locked' : ''));
    const ic = svgEl('svg', { viewBox: '0 0 24 24', class: 'pic', 'aria-hidden': 'true' });
    ic.appendChild(svgEl('path', { d: inv ? shipPath(d.id) : PT_ICON[d.id] || PT_ICON[PT_ALIAS[d.id]] || (n.ab ? PT_ICON[n.ab] : PT_ICON.lic) }));
    b.append(ic, el('span', 'cnt', inv ? (n.lv ? 'MK.' + n.lv : '·') : n.lv + '/' + n.max), el('span', 'ser', (inv ? 'LV ' : 'REQ ') + n.need + ' · ' + d.id.toUpperCase()));
    if (n.lv && isEq(d.id)) b.appendChild(el('span', 'eqd', 'EQUIPPED'));
    b.onfocus = b.onmouseenter = () => ptPick(d.id);
    b.onpointerdown = e => { if (e.button === 0) holdStart(d.id, b); };
    b.onpointerleave = holdEnd;
    b.onkeydown = e => { if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) { e.preventDefault(); holdStart(d.id, b); } };
    b.onkeyup = e => { if (e.code === 'Enter' || e.code === 'Space') holdEnd(); };
    box.appendChild(b);
  });
  ptFx = null;
  renderPtTip();
  const f = focusId && shopEl.querySelector('[data-id="' + focusId + '"]');
  if (f && !f.disabled) { lastHover = f; f.focus({ preventScroll: true }); }
}
function ptPick(id) {
  if (ptSel === id) return;
  ptSel = id; shopEl.querySelectorAll('.pnode').forEach(b => b.classList.toggle('sel', b.dataset.id === 'pn.' + id)); renderPtTip();
}
function renderPtTip() { // tooltip card beside the selected node: current level, next level, cost, hold prompt, equip
  const tip = document.getElementById('pttip'); tip.textContent = '';
  const d = ptSel && ptDef(ptSel); tip.hidden = !d; if (!d) return;
  const n = pnode(ptSel), st = ptState(ptSel), [, y] = ptPos(d), cw = parseFloat(document.getElementById('ptcanvas').style.width), id = ptSel;
  tip.style.left = cw + 40 + 'px'; tip.style.top = Math.max(-40, y - 20) + 'px'; // own column right of the tree, level with the node: never covers another node
  const hd = el('header'); hd.appendChild(el('h3', '', n.name)); if (n.lv) hd.appendChild(el('span', 'bought', n.lv >= n.max ? 'MAXED' : 'OWNED'));
  tip.append(hd, el('p', 'type', n.type));
  const lvl = (k, v) => { const l = el('p', 'lvl' + (k === 'NEXT' ? ' next' : '')); l.append(el('span', '', k + (n.wp ? ' MK ' : ' LEVEL ')), el('b', '', String(v))); return l; };
  if (n.lv) tip.append(lvl('CURRENT', n.lv), el('p', 'cur', n.fx(n.lv)));
  if (n.lv < n.max) tip.append(lvl('NEXT', n.lv + 1), el('p', 'nxt', n.fx(n.lv + 1)));
  if (n.lock) tip.appendChild(el('p', 'req', n.lock));
  const ft = el('footer');
  if (n.lv < n.max) {
    ft.appendChild(el('span', 'price', n.pts ? n.pts + ' PERK PT' : '◆ ' + fmt(n.cost)));
    const p = el('span', 'hold' + (n.lock || !canPay(n) ? ' no' : ''));
    if (n.lock) p.textContent = 'LOCKED'; else if (!canPay(n)) p.textContent = n.pts ? 'NO PERK POINTS' : 'NOT ENOUGH ◆'; else p.append(el('kbd', '', 'HOLD'), document.createTextNode(n.lv ? ' TO UPGRADE' : ' TO ACQUIRE'));
    ft.appendChild(p);
  } else ft.appendChild(el('span', 'price', 'MAXED'));
  if (n.lv && (n.wp || n.ab)) { // weapons + abilities: equip (one weapon, one skill, one super)
    const on = isEq(id);
    ft.appendChild(btn('btn cp' + (on ? '' : ' btn--primary'), on ? 'EQUIPPED' : 'EQUIP' + (n.ab ? (n.ab === 'skill' ? ' AS SKILL' : ' AS SUPER') : ''), 'eq.' + id, () => {
      if (n.wp) META.wp.eq = id; else META.ab[n.ab] = id;
      saveMeta(); cue('equip'); renderShop(); renderClasses();
    }, on));
  }
  tip.appendChild(ft);
}
function holdStart(id, b) {
  ptPick(id); holdEnd();
  const n = pnode(id);
  if (n.lv >= n.max) return;
  if (n.lock || !canPay(n)) { cue('buyfail'); b.classList.add('deny'); setTimeout(() => b.classList.remove('deny'), 160); return; }
  b.classList.add('holding');
  ptHold = setTimeout(() => {
    ptHold = null; b.classList.remove('holding');
    const m = pnode(id); if (m.lock || !canPay(m) || m.lv >= m.max) return;
    if (!m.pts) creds -= m.cost;
    m.buy(); saveMeta(); cue(m.lv + 1 >= m.max ? 'perkmax' : 'perk'); ptFx = id; renderShop(); renderClasses();
  }, 450);
}
function holdEnd() { if (ptHold) { clearTimeout(ptHold); ptHold = null; } shopEl.querySelectorAll('.pnode.holding').forEach(b => b.classList.remove('holding')); }
addEventListener('pointerup', holdEnd); addEventListener('pointercancel', holdEnd);
function ptCycle(d) { const K = Object.keys(TREES); ptTab = K[(K.indexOf(ptTab) + d + K.length) % K.length]; ptSel = null; cue('tab'); renderShop(); }
function openShop(tab) {
  if (TREES[tab]) ptTab = tab;
  ptSel = null; renderShop(); shopEl.hidden = false; cue('open');
  const f = shopEl.querySelector('.pnode.open, .pnode.own') || shopEl.querySelector('.pnode'); lastHover = f; f.focus({ preventScroll: true });
}
function closeShop() { holdEnd(); shopEl.hidden = true; renderClasses(); document.getElementById('openshop').focus(); cue('close'); }
document.getElementById('openshop').onclick = () => openShop();
document.getElementById('shopdone').onclick = closeShop;
metaEl.checked = myMetaOnline;
metaEl.onchange = () => { myMetaOnline = metaEl.checked; try { localStorage.setItem('coderot-metaonline', myMetaOnline ? '1' : '0'); } catch (_) {} };
if (!netAvailable()) { document.getElementById('online').hidden = true; }
const urlRoom = cleanCode(new URLSearchParams(location.search).get('room'));
if (urlRoom) { codeEl.value = urlRoom; setMsg('Invited to room ' + urlRoom + '. Check your build, then press JOIN.'); }
renderClasses(); renderDiffs(); renderExtras();
const autoSkipEl = document.getElementById('autoskip');
autoSkipEl.checked = myAutoSkip;
function setAutoSkip(on) { // menu checkbox + pause-menu toggle; mid-run it changes the live room (host only)
  myAutoSkip = autoSkipEl.checked = on; if (mode === 'game' && isHost) world.autoskip = on;
  try { localStorage.setItem('coderot-autoskip', on ? '1' : '0'); } catch (_) {}
}
autoSkipEl.onchange = () => setAutoSkip(autoSkipEl.checked);

// ---------- main loop ----------
function update(dt) { // dt = real time; wdt = world time (slower while anyone's time dilation runs). Players always move on real time.
  const wdt = dt * worldK();
  T += dt; shake = Math.max(0, shake - dt * 40); flash = Math.max(0, flash - dt * 1.6);
  glitch = Math.max(0, glitch - dt * 1.5); chroma = Math.max(0, chroma - dt * 1.5);
  musicTick(dt);
  const damp = Math.pow(.06, wdt);
  for (const q of parts) { q.life -= wdt; q.x += q.vx * wdt; q.y += q.vy * wdt; q.vx *= damp; q.vy *= damp; }
  for (const r of rings) { r.life -= wdt; r.r += r.vr * wdt; }
  for (const q of pops) { q.life -= dt * .9; q.y -= 40 * dt; }
  parts = parts.filter(q => q.life > 0); rings = rings.filter(r => r.life > 0); pops = pops.filter(q => q.life > 0);
  for (const d of RAIN) { d.y += d.sp * wdt; if (d.y - d.len * 18 > MH) { d.y = -20; d.x = Math.floor(rand(0, COLS)) * CELL + CELL / 2; } }
  if (banner && (banner.t -= dt) <= 0) banner = null;
  bossDeathTick(wdt);
  for (const [id, t] of gone) if (T - t > 3) gone.delete(id);

  camTick(dt);
  if (mode !== 'game') { updBugs(dt); for (let k = 0; k < NC; k++) rot[k] = Math.max(0, rot[k] - dt * .35); return; }
  if (world.phase === 'over') { overT += dt; paused = false; }
  if (paused && !online()) return; // solo pauses the world; online it keeps going
  if (dil > 0 && (dil -= dt) <= 0) endDil();
  const I = paused ? NO_INPUT : readInput();
  me.t += dt;
  for (const s of smudges) {
    s.life -= wdt * (hasCw('sandbox') ? 2 : 1); // SANDBOX
    if (!s.popup || s.life <= 0) continue;
    s.x += s.vx * wdt; s.y += s.vy * wdt; // drift and bounce around the screen
    if (s.x < s.w / 2 || s.x > W - s.w / 2) { s.vx *= -1; s.x = clamp(s.x, s.w / 2, W - s.w / 2); } // popups live on the screen, not the map
    if (s.y < s.h / 2 + 62 || s.y > H - s.h / 2) { s.vy *= -1; s.y = clamp(s.y, s.h / 2 + 62, H - s.h / 2); }
    if ((s.breed -= wdt) <= 0) { s.breed = rand(3.5, 5.5); if (Math.random() < .55) addPopup(null, s.x + rand(-80, 80), s.y + rand(-60, 60)); } // popups breed popups
  }
  smudges = smudges.filter(s => s.life > 0);
  if (isHost) { if (!(adminMode && ADM.freeze)) hostUpdate(wdt); } // sandbox can freeze the whole world
  else {
    for (const b of world.bugs) { // smooth toward the host's positions
      const k = Math.min(1, dt * 12), px = b.x, py = b.y;
      b.x += (b.tx - b.x) * k; b.y += (b.ty - b.y) * k; b.hit -= wdt; b.frz -= wdt;
      if (dt) { b.vx = b.vx * .8 + (b.x - px) / dt * .2; b.vy = b.vy * .8 + (b.y - py) / dt * .2; }
    }
    updShots(wdt); calcRot();
  }
  if (world.run) { syncLocal(); bossEvents(); }
  if (world.phase === 'play') { const p = rotFrac / ROT_LIMIT; if (p > .8 && !world.mx) { world.mx = 1; cue('maxtac'); } else if (p < .65) world.mx = 0; } // past 80% rot: the heavy response is coming
  updMe(dt, I);
  if (adminMode) admTick();
  for (const o of others.values()) { // friends: smooth position + cosmetic shots
    o.x += (o.tx - o.x) * Math.min(1, dt * 14); o.y += (o.ty - o.y) * Math.min(1, dt * 14);
    if (T - (o.trT || 0) >= 1 / 60) { o.trT = T; o.trail.push({ x: o.x, y: o.y }); if (o.trail.length > 12) o.trail.shift(); }
    const K = WEAPONS[o.wp];
    if (o.f && !o.d && (o.fireT -= dt) <= 0) {
      o.fireT = K.fire;
      for (let i = 0; i < o.sh; i++) {
        const s = (i - (o.sh - 1) / 2) * (K.spread || .08);
        bullets.push({ x: o.x, y: o.y, vx: Math.cos(o.a + s) * K.bspeed, vy: Math.sin(o.a + s) * K.bspeed, life: K.life, col: o.col, mine: false, bounce: 0, rail: !!K.rail, hits: new Set() });
      }
    }
  }
  updBullets(wdt);
  netTick(dt);
}

let last = performance.now();
function frame(now) {
  let dt = Math.min(.033, (now - last) / 1000) * (adminMode ? ADM.speed : 1); last = now;
  if (hitstop > 0) { hitstop -= dt; dt = 0; }
  if (slowmo > 0) { slowmo -= dt; dt *= .3; } // boss kill-cam
  update(dt); draw(now / 1000);
  requestAnimationFrame(frame);
}
setView(screenCols()); camTick(0, true); // the view fits this screen; the map is the same size for everyone
addEventListener('resize', () => setView(screenCols()));
ambient(); requestAnimationFrame(frame);

// ---------- title screen: the first key / click unlocks audio (browser rule), then the menu flickers in ----------
const bootEl = document.getElementById('boot');
function dismissBoot() {
  if (bootEl.hidden) return;
  bootEl.hidden = true; menuEl.hidden = false; ensureAudio(); cue('press'); glitch = Math.max(glitch, .3);
  document.getElementById('solo').focus();
}
if (urlRoom || new URLSearchParams(location.search).has('skipboot')) bootEl.hidden = true; else { menuEl.hidden = true; bootEl.focus(); }
bootEl.addEventListener('click', dismissBoot);

// ---------- UI sounds for every HTML control: a press on click. No hover sound (it read as an error beep, and re-fired after every re-render) ----------
let lastHover = null;
document.addEventListener('click', e => { const b = e.target.closest('button, summary'); if (b && !b.disabled) cue('click'); }, true);

// ---------- cyberware clinic (chassis view) ----------
const cwEl = document.getElementById('cyber'), cwGrid = document.getElementById('cwgrid'), cwTip = document.getElementById('cwtip');
const CW_ICON = { // original line icons, 24x24
  cpu: 'M7 7h10v10H7zM10 10h4v4h-4zM9 3v4M12 3v4M15 3v4M9 17v4M12 17v4M15 17v4M3 9h4M3 12h4M3 15h4M17 9h4M17 12h4M17 15h4',
  optics: 'M2 12l5-5h10l5 5-5 5H7zM12 9l3 3-3 3-3-3z', power: 'M13 3L6 13h5l-1 8 7-10h-5z',
  fw: 'M12 3l8 3v6l-3 6-5 3-5-3-3-6V6zM8 11h8M8 14h8', bus: 'M3 7h12l3 3h3M3 12h18M3 17h8l3-3h7',
  plating: 'M4 5h16l-2 4H6zM4 11h16l-2 4H6zM6 17h12l-2 3H8z', os: 'M4 4h16v16H4zM8 9l3 3-3 3M13 15h4',
  frame: 'M6 3v18M18 3v18M6 7l12 4M18 7L6 11M6 13l12 4M18 13L6 17', grip: 'M12 3v6M12 15v6M3 12h6M15 12h6M9 9h6v6H9z',
  arms: 'M4 9h12l4 3-4 3H4zM7 9V5M7 15v4M11 9V6M11 15v3', drive: 'M8 3h8l2 10H6zM8 17l-1 4M12 17v4M16 17l1 4' };
const NODE = c => [CW_CATS[c][3][0] * 120, CW_CATS[c][3][1] * 170]; // category node on the hologram
let cwView = 'over', cwCat = 'os', cwSock = 'os', cwFilter = 'all', cwTipId = null, cwFx = null, cwHot = null, cwQh = false;
const qIco = k => { const s = svgEl('svg', { viewBox: '0 0 24 24', class: 'ico', 'aria-hidden': 'true' }); s.appendChild(svgEl('path', { d: QH_ICON[k] })); return s; };
const cwDeck = () => { const D = CW[META.cw.eq.os]; return D && D.deck; };
const qhSlotted = () => { const d = cwDeck(); return d ? META.cw.qh.filter(k => qOwns(k) && (!QH[k].bw || d.bw)).slice(0, d.slots) : []; };
const svgEl = (t, a) => { const e = document.createElementNS('http://www.w3.org/2000/svg', t); for (const k in a) e.setAttribute(k, a[k]); return e; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const icon = c => { const s = svgEl('svg', { viewBox: '0 0 24 24', class: 'ico', 'aria-hidden': 'true' }); s.appendChild(svgEl('path', { d: CW_ICON[c] })); return s; };
const socksOf = c => SOCKETS.filter(s => sockCat(s) === c);
const cwAt = id => SOCKETS.find(s => META.cw.eq[s] === id);
const cwFits = (id, sock) => cwLoad() - (META.cw.eq[sock] ? CW[META.cw.eq[sock]].cap : 0) + CW[id].cap <= cwCap();
const cwLock = id => cwOwns(id) ? '' : CW[id].lv > myLv() ? 'LEVEL ' + CW[id].lv : cwBuyable(id) ? '' : 'BLUEPRINT'; // why you can't buy it yet
const qLock = k => qOwns(k) ? '' : (QH[k].lv || 1) > myLv() ? 'LEVEL ' + QH[k].lv : (QH[k].net || 0) > attrOf('net') ? 'NETRUN ' + QH[k].net : '';
const cwKind = D => D.deck ? 'NETDECK · HOLD F' : D.cd ? 'ACTIVE · PRESS C' : 'PASSIVE';

function buildHolo() { // the hologram is your ship's outline, nose up, scaled into the frame
  const P = SHAPES[WEAPONS[META.wp.eq].shape], xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, s = Math.min(370 / (Math.max(...xs) - Math.min(...xs)), 300 / (Math.max(...ys) - Math.min(...ys)));
  const pts = k => P.map(([x, y]) => ((y * s * k).toFixed(1) + ',' + (-(x - cx) * s * k).toFixed(1))).join(' ');
  document.getElementById('cwhull').setAttribute('points', pts(1));
  document.getElementById('cwclipP').setAttribute('points', pts(1));
  document.getElementById('cwhullin').setAttribute('points', pts(.72));
  const tr = document.getElementById('cwtraces'); tr.textContent = '';
  tr.appendChild(svgEl('path', { class: 'spine', d: 'M0 -185V185' }));
  for (const c in CW_CATS) { const [x, y] = NODE(c); tr.appendChild(svgEl('path', { class: 'trace', 'data-cat': c, d: `M${x} ${y}H${x / 2}L0 ${y + Math.abs(x) / 2}` })); }
  document.getElementById('cwchassis').textContent = 'LEVEL ' + myLv() + ' · ' + WEAPONS[META.wp.eq].name;
}
function renderHolo() {
  const eq = META.cw.eq, g = document.getElementById('cwnodes'); g.textContent = '';
  for (const c in CW_CATS) {
    const [x, y] = NODE(c), on = socksOf(c).some(s => eq[s]), sel = c === (cwView === 'zoom' ? cwCat : cwHot);
    g.appendChild(svgEl('rect', { x: x - 6, y: y - 6, width: 12, height: 12, transform: `rotate(45 ${x} ${y})`, class: 'node' + (on ? ' on' : '') + (sel ? ' sel' : '') }));
    if (cwFx && cwFx.cat === c) g.appendChild(svgEl('rect', { x: x - 6, y: y - 6, width: 12, height: 12, transform: `rotate(45 ${x} ${y})`, class: 'burst ' + cwFx.k }));
    document.querySelector(`#cwtraces [data-cat="${c}"]`).setAttribute('class', 'trace' + (on ? ' on' : '') + (sel ? ' sel' : ''));
  }
  const cam = document.getElementById('cwcam'), [zx, zy] = NODE(cwCat);
  cam.style.transform = cwView === 'zoom' ? `scale(1.9) translate(${-zx}px, ${-zy}px)` : '';
}
function drawLines() { // leader lines from each category's socket row to its node
  const L = document.getElementById('cwlines'); L.textContent = '';
  if (cwView !== 'over') return;
  const g = cwGrid.getBoundingClientRect(), m = document.getElementById('cwsvg').getScreenCTM(); if (!m) return;
  for (const row of cwGrid.querySelectorAll('.cat')) {
    const c = row.dataset.cat, r = row.querySelector('.socks').getBoundingClientRect(), [nx, ny] = NODE(c), left = CW_CATS[c][2] === 'L';
    const x1 = (left ? r.right + 10 : r.left - 10) - g.left, y1 = r.top + r.height / 2 - g.top, x2 = m.a * nx + m.e - g.left, y2 = m.d * ny + m.f - g.top;
    const on = socksOf(c).some(s => META.cw.eq[s]), sel = c === cwHot;
    L.appendChild(svgEl('polyline', { points: `${x1},${y1} ${x1 + (left ? 24 : -24)},${y1} ${x2},${y2}`, class: 'lead' + (on ? ' on' : '') + (sel ? ' sel' : '') }));
  }
}
function sockBtn(s, big) {
  const id = META.cw.eq[s], D = CW[id], c = sockCat(s), n = +(s.match(/\d+$/) || [1])[0];
  const b = el('button', 'sock' + (id ? ' on' : '') + (big ? ' big' : '') + (cwView === 'zoom' && s === cwSock ? ' sel' : '') + (cwFx && cwFx.s === s ? ' fx-' + cwFx.k : ''));
  b.type = 'button'; b.dataset.id = 'sock.' + s;
  b.setAttribute('aria-label', CW_SLOTS[c] + ' socket ' + n + ': ' + (D ? D.name : 'empty'));
  if (D) b.style.setProperty('--t', TIER[D.tier]);
  b.appendChild(el('span', 'ic', D ? D.ic : '+'));
  b.onclick = () => { if (cwView === 'over') openZoom(c, s); else { cwSock = s; cwQh = false; cwTipId = META.cw.eq[s] || cwTipId; cue('tab'); renderCw(); } };
  b.onfocus = b.onmouseenter = () => { if (cwView === 'over' && cwHot !== c) { cwHot = c; renderHolo(); drawLines(); } };
  return b;
}
function renderOver() {
  let i = 0;
  for (const side of ['L', 'R']) {
    const col = document.getElementById(side === 'L' ? 'cwleft' : 'cwright'); col.textContent = '';
    for (const c in CW_CATS) {
      if (CW_CATS[c][2] !== side) continue;
      const socks = socksOf(c), names = socks.map(s => META.cw.eq[s]).filter(Boolean).map(id => CW[id].name);
      const box = el('div', 'cat'); box.dataset.cat = c; box.style.setProperty('--i', i++);
      const hd = el('div', 'cathd'); hd.append(icon(c), el('b', '', CW_SLOTS[c]));
      const row = el('div', 'socks'); for (const s of socks) row.appendChild(sockBtn(s));
      box.append(hd, row, el('p', 'cnames' + (names.length ? ' on' : ''), names.join(' · ') || 'EMPTY'), el('p', 'micro', names.length + '/' + socks.length + ' INSTALLED'));
      col.appendChild(box);
    }
  }
}
function tile(id) {
  const D = CW[id], eq = META.cw.eq, at = cwAt(id), own = cwOwns(id), lk = cwLock(id);
  const b = el('button', 'tile' + (at ? ' inst' : '') + (lk ? ' lock' : '') + (id === cwTipId ? ' sel' : '') + (cwFx && cwFx.id === id ? ' fx-' + cwFx.k : ''));
  b.type = 'button'; b.dataset.id = 'cw.' + id; b.style.setProperty('--t', TIER[D.tier]);
  b.append(el('span', 'ic', D.ic), el('span', 'nm', D.name), el('span', 'tag' + (at ? ' inst' : own ? ' own' : ''), at ? 'INSTALLED' : own ? 'OWNED' : lk || '◆ ' + fmt(D.cost)));
  b.onclick = () => cwAct(id);
  b.onfocus = b.onmouseenter = () => { if (cwTipId !== id) { cwTipId = id; renderTip(); cwGrid.querySelectorAll('.tile.sel').forEach(t => t.classList.remove('sel')); b.classList.add('sel'); } };
  return b;
}
function renderZoom() {
  const z = document.getElementById('cwzoom'); z.textContent = '';
  const socks = socksOf(cwCat), have = socks.filter(s => META.cw.eq[s]).length;
  z.appendChild(el('p', 'label', 'INSTALLED:'));
  const row = el('div', 'socks'); for (const s of socks) row.appendChild(sockBtn(s, true)); z.appendChild(row);
  const hd = el('h3', 'zname'); hd.id = 'cwzname'; hd.append(icon(cwCat), el('span', '', CW_SLOTS[cwCat])); z.appendChild(hd);
  z.appendChild(el('p', 'micro', have + '/' + socks.length + ' SOCKETS IN USE · SOCKET ' + (+(cwSock.match(/\d+$/) || [1])[0]) + ' SELECTED'));
  const dk = cwCat === 'os' && cwDeck(); if (!dk) cwQh = false;
  if (dk) { // the deck's quickhack slots
    const sl = qhSlotted(), qr = el('div', 'qslots');
    for (let i = 0; i < dk.slots; i++) {
      const k = sl[i], b = el('button', 'qslot' + (k ? ' on' : '')); b.type = 'button'; b.dataset.id = 'qs.' + i;
      b.setAttribute('aria-label', 'Quickhack slot ' + (i + 1) + ': ' + (k ? QH[k].name : 'empty'));
      if (k) b.appendChild(qIco(k)); else b.textContent = '+';
      b.onclick = () => { cwQh = true; if (k) cwTipId = 'qh.' + k; cue('tab'); renderCw(); }; qr.appendChild(b);
    }
    z.append(el('p', 'label', 'QUICKHACK SLOTS: ' + sl.length + '/' + dk.slots), qr);
  }
  const fh = el('div', 'fhead');
  if (dk) { const tb = el('div', 'filters'); for (const [q, n] of [[false, 'KERNELS'], [true, 'QUICKHACKS']]) { const f = el('button', 'filt big', n); f.type = 'button'; f.setAttribute('aria-pressed', String(cwQh === q)); f.onclick = () => { if (cwQh !== q) { cwQh = q; cwTipId = null; cue('tab'); renderCw(); } }; tb.appendChild(f); } fh.appendChild(tb); }
  else fh.appendChild(el('p', 'label', 'POSSIBLE REPLACEMENTS:'));
  const fl = el('div', 'filters');
  for (const [k, n] of [['all', 'ALL'], ['own', 'OWNED'], ['buy', 'AFFORDABLE']]) {
    const f = el('button', 'filt', n); f.type = 'button'; f.setAttribute('aria-pressed', String(cwFilter === k));
    f.onclick = () => { cwFilter = k; cue('tab'); renderCw(); }; fl.appendChild(f);
  }
  fh.appendChild(fl); z.appendChild(fh);
  const grid = el('div', 'tiles'), pass = (own, cost, lk) => cwFilter === 'all' || (cwFilter === 'own' ? own : own || (!lk && creds >= cost));
  const list = cwQh ? QHK.filter(k => pass(qOwns(k), QH[k].cost, qLock(k))) : CWK.filter(k => CW[k].slot === cwCat && pass(cwOwns(k), CW[k].cost, cwLock(k)));
  for (const id of list) grid.appendChild(cwQh ? qtile(id) : tile(id));
  if (!list.length) grid.appendChild(el('p', 'msg', 'Nothing matches this filter.'));
  z.appendChild(grid);
  if (cwQh) { if (!String(cwTipId).startsWith('qh.')) cwTipId = 'qh.' + (qhSlotted()[0] || list[0] || 'ping'); }
  else if (!CW[cwTipId] || CW[cwTipId].slot !== cwCat) cwTipId = META.cw.eq[cwSock] || list[0] || CWK.find(k => CW[k].slot === cwCat);
  renderTip();
}
function qtile(k) {
  const Q = QH[k], d = cwDeck(), own = qOwns(k), sl = qhSlotted().includes(k), ok = !Q.bw || d.bw, id = 'qh.' + k, lk = qLock(k);
  const b = el('button', 'tile qt' + (Q.bw ? ' bw' : '') + (sl ? ' inst' : '') + (ok && !lk ? '' : ' lock') + (id === cwTipId ? ' sel' : '') + (cwFx && cwFx.id === id ? ' fx-' + cwFx.k : ''));
  b.type = 'button'; b.dataset.id = id; b.style.setProperty('--t', Q.bw ? '#FF3E34' : '#52DDDF');
  const ic = el('span', 'ic'); ic.appendChild(qIco(k));
  b.append(ic, el('span', 'nm', Q.name), el('span', 'tag' + (sl ? ' inst' : own ? ' own' : ''), !ok ? 'TOP DECK ONLY' : sl ? 'SLOTTED' : own ? 'OWNED' : lk || '◆ ' + fmt(Q.cost)));
  b.onclick = () => qAct(k);
  b.onfocus = b.onmouseenter = () => { if (cwTipId !== id) { cwTipId = id; renderTip(); cwGrid.querySelectorAll('.tile.sel').forEach(t => t.classList.remove('sel')); b.classList.add('sel'); } };
  return b;
}
function qAct(k) { // buy it if needed, then slot / unslot it
  const Q = QH[k], d = cwDeck(); cwTipId = 'qh.' + k; if (!d) return;
  if (Q.bw && !d.bw) { cue('buyfail'); return renderCw(); }
  if (!qOwns(k)) { if (qLock(k) || creds < Q.cost) return cue('buyfail'); creds -= Q.cost; META.cw.qown.push(k); cue('money'); }
  const sl = qhSlotted();
  if (sl.includes(k)) { META.cw.qh = sl.filter(x => x !== k); cue('unequip'); cwFx = { k: 'out', id: 'qh.' + k }; }
  else if (sl.length >= d.slots) { cue('buyfail'); cwFx = { k: 'full', id: 'qh.' + k }; }
  else { META.cw.qh = [...sl, k]; cue('qh_press'); setTimeout(() => cue('install', .6), 100); cwFx = { k: 'in', id: 'qh.' + k }; }
  saveMeta(); renderCw(); renderClasses();
}
function renderQhTip(k) {
  const Q = QH[k], d = cwDeck(), own = qOwns(k), sl = qhSlotted(), on = sl.includes(k), ok = d && (!Q.bw || d.bw), lk = qLock(k);
  const hd = el('header'); hd.appendChild(el('h3', '', Q.name)); const rar = el('span', 'rarity', 'QUICKHACK'); rar.style.setProperty('--t', Q.bw ? '#FF3E34' : '#52DDDF'); hd.appendChild(rar);
  const ic = el('div', 'tipic'); ic.style.setProperty('--t', Q.bw ? '#FF3E34' : '#52DDDF'); ic.appendChild(qIco(k));
  const fx = el('ul', 'fx'); fx.appendChild(el('li', '', Q.desc));
  const meta = el('dl', 'meta'), add = (a, v) => meta.append(el('dt', '', a), el('dd', '', v));
  add('RAM COST', Q.ram); add('UPLOAD', Q.up + 's base'); add('SUPER DRAIN', '-' + Q.ram * 4 + '%'); if (Q.bw) add('NEEDS', CW.deck3.name);
  if (!own && (Q.lv || Q.net)) add('REQUIRES', 'LEVEL ' + (Q.lv || 1) + (Q.net ? ' · NETRUN ' + Q.net : ''));
  const ft = el('footer'), cap = el('span', 'capv'); cap.append(el('i'), document.createTextNode(' ' + Q.ram + ' RAM'));
  const btn = el('button', 'btn' + (on ? '' : ' btn--primary') + ' cp'); btn.type = 'button'; btn.dataset.id = 'qa.' + k;
  btn.textContent = !ok ? 'NEEDS TOP DECK' : on ? 'UNSLOT' : !own ? (lk ? lk + ' REQUIRED' : creds >= Q.cost ? 'BUY + SLOT' : 'NOT ENOUGH ◆') : sl.length >= d.slots ? 'SLOTS FULL' : 'SLOT';
  btn.disabled = !ok || (!on && (!own ? !!lk || creds < Q.cost : sl.length >= d.slots)); btn.onclick = () => qAct(k);
  ft.append(cap, el('span', 'price', on ? 'SLOTTED' : own ? 'OWNED' : '◆ ' + fmt(Q.cost)), btn);
  cwTip.append(hd, el('p', 'type', 'QUICKHACK · ' + (Q.bw ? 'BLACKWALL' : 'NETDECK')), ic, fx, meta, el('p', 'lore', Q.lore || ''), ft);
}
function renderTip() {
  cwTip.textContent = ''; const id = cwTipId;
  if (String(id).startsWith('qh.')) return renderQhTip(id.slice(3));
  const D = CW[id]; if (!D) return;
  const at = cwAt(id), own = cwOwns(id), fits = cwFits(id, cwSock), lk = cwLock(id);
  const hd = el('header'); hd.append(el('h3', '', D.name)); const rar = el('span', 'rarity', D.tier); rar.style.setProperty('--t', TIER[D.tier]); hd.appendChild(rar);
  const ic = el('div', 'tipic', D.ic); ic.style.setProperty('--t', TIER[D.tier]);
  const fx = el('ul', 'fx'); fx.appendChild(el('li', '', D.desc));
  const meta = el('dl', 'meta'), add = (k, v) => { meta.append(el('dt', '', k), el('dd', '', v)); };
  if (D.dur) { add('DURATION', D.dur + 's'); add('COOLDOWN', D.cd + 's'); }
  if (D.dil) add('WORLD SPEED', Math.round(D.dil * 100) + '%');
  if (!own && D.lv > 1) add('REQUIRES', 'LEVEL ' + D.lv);
  if (!own && D.bp) add('BLUEPRINT', META.bp.includes(id) ? 'ACQUIRED' : 'DROPS FROM BOSSES');
  if (D.deck) { add('RAM', D.deck.ram); add('RAM REGEN', '1 / ' + D.deck.regen + 's'); add('UPLOAD SPEED', Math.round(100 / D.deck.up) + '%'); add('QUICKHACK SLOTS', D.deck.slots); if (D.deck.bw) add('BLACKWALL', 'ACCESS'); }
  const ft = el('footer'), cap = el('span', 'capv'); cap.append(el('i'), document.createTextNode(' ' + D.cap));
  const btn = el('button', 'btn' + (at ? '' : ' btn--primary') + ' cp'); btn.type = 'button';
  btn.textContent = at ? 'REMOVE' : !own ? (lk ? (lk === 'BLUEPRINT' ? 'NEEDS BLUEPRINT' : lk + ' REQUIRED') : creds >= D.cost ? 'BUY + INSTALL' : 'NOT ENOUGH ◆') : fits ? 'INSTALL' : 'NO CAPACITY';
  btn.disabled = !at && (own ? !fits : !!lk || creds < D.cost);
  btn.onclick = () => cwAct(id);
  ft.append(cap, el('span', 'price', at ? 'INSTALLED · SOCKET ' + (+(at.match(/\d+$/) || [1])[0]) : own ? 'OWNED' : '◆ ' + fmt(D.cost)), btn);
  cwTip.append(hd, el('p', 'type', CW_SLOTS[D.slot] + ' · ' + cwKind(D)), ic, fx, meta, el('p', 'lore', D.lore));
  if (cwFx && cwFx.id === id && cwFx.k === 'in') cwTip.appendChild(el('div', 'installing', 'INSTALLING'));
  cwTip.appendChild(ft);
}
function renderCw() {
  const focusId = document.activeElement && document.activeElement.dataset.id, load = cwLoad(), cap = cwCap();
  cwEl.dataset.view = cwView;
  document.getElementById('cwwallet').textContent = '◆ ' + fmt(creds);
  document.getElementById('cwcapnum').textContent = load + ' / ' + cap;
  document.getElementById('cwnick').textContent = nick;
  document.getElementById('cwcls').textContent = 'LV ' + myLv() + ' · ' + META.shards + '/' + BAL.cw.shardMax + ' CAPACITY SHARDS · ROT//OS 4.0.4';
  const bar = document.getElementById('cwcap'), prev = +(bar.dataset.n || 0); bar.textContent = '';
  for (let i = 0; i < cap; i++) bar.appendChild(el('i', (i < load ? 'on' : '') + (i >= prev && i < load ? ' new' : '')));
  bar.dataset.n = load;
  if (cwView === 'over') renderOver(); else renderZoom();
  renderHolo();
  const P = document.getElementById('cwprompts'); P.textContent = '';
  const pr = (k, t) => { const s = el('span'); s.append(el('kbd', '', k), document.createTextNode(t)); P.appendChild(s); };
  pr('C', 'Kernel in a run'); pr('F', 'Hold: netdeck scanner');
  if (cwView === 'zoom') pr('↵', 'Buy / install / remove');
  const back = el('button', 'btn btn--secondary cp'); back.type = 'button'; back.append(el('kbd', '', 'ESC'), document.createTextNode(cwView === 'zoom' ? ' BACK' : ' CLOSE'));
  back.onclick = cwBack; P.appendChild(back);
  requestAnimationFrame(drawLines);
  const f = focusId && cwEl.querySelector('[data-id="' + focusId + '"]');
  if (f && !f.disabled) { lastHover = f; f.focus({ preventScroll: true }); }
  cwFx = null;
}
function cwAct(id) {
  const D = CW[id], eq = META.cw.eq, at = cwAt(id);
  if (at) { delete eq[at]; cue('unequip'); cwFx = { k: 'out', s: at, cat: D.slot, id }; }
  else {
    if (!cwOwns(id)) {
      if (cwLock(id) || creds < D.cost) return cue('buyfail');
      creds -= D.cost; META.cw.own.push(id); cue('money');
    }
    if (!cwFits(id, cwSock)) { cue('buyfail'); cwFx = { k: 'buy', id }; }
    else {
      eq[cwSock] = id; setTimeout(() => cue('install'), 120); cue(D.eq || 'equip'); cwFx = { k: 'in', s: cwSock, cat: D.slot, id };
      if (D.deck) { // a fresh deck gets your quickhacks slotted (the top deck opens with the BLACKWALL)
        const fit = k => qOwns(k) && (!QH[k].bw || D.deck.bw);
        let q = META.cw.qh.filter(fit); for (const k of QHK) if (fit(k) && !q.includes(k)) q.push(k);
        if (D.deck.bw) q = ['blackwall', ...q.filter(k => k !== 'blackwall')];
        META.cw.qh = q.slice(0, D.deck.slots);
      }
    }
  }
  cwTipId = id; saveMeta(); renderCw(); renderClasses();
}
function openZoom(c, s) {
  cwView = 'zoom'; cwCat = c; cwSock = s; cwFilter = 'all'; cwQh = false; cwTipId = META.cw.eq[s] || null; cue('zoomin');
  renderCw(); const t = cwEl.querySelector('.tile.sel') || cwEl.querySelector('.tile'); lastHover = t; t.focus();
}
function cwBack() {
  if (cwView === 'zoom') { const c = cwCat; cwView = 'over'; cue('zoomout'); renderCw(); const b = cwEl.querySelector(`.cat[data-cat="${c}"] .sock`); if (b) b.focus(); return; }
  closeCw();
}
function openCw() {
  cwView = 'over'; cwHot = null; buildHolo(); document.getElementById('cwcap').dataset.n = cwLoad();
  cwEl.hidden = false; cwEl.classList.remove('intro'); void cwEl.offsetWidth; cwEl.classList.add('intro');
  renderCw(); cue('cwopen');
  cwEl.querySelector('.sock').focus({ preventScroll: true });
}
function closeCw() { cwEl.hidden = true; cue('cwclose'); renderClasses(); document.getElementById('opencw').focus(); }
document.getElementById('opencw').onclick = openCw;
document.getElementById('cwtab-load').onclick = closeCw;
document.getElementById('cwtab-shop').onclick = () => { closeCw(); openShop(); };
addEventListener('resize', () => { if (!cwEl.hidden) drawLines(); });

