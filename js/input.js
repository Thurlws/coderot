'use strict';
// Keyboard + mouse, touch (twin virtual sticks + buttons) and gamepad, merged into one input snapshot per frame.

const keys = {}, mouse = { x: W / 2, y: H / 2, down: false, seen: -1 };
let touchMode = false, stickL = null, stickR = null, tap = { dash: false, super: false, skill: false }, prevBtn = {};
const TOUCH_BTN = {
  super: { x: W - 120, y: H - 260, r: 44, label: 'SUPER' },
  skill: { x: W - 110, y: H - 120, r: 48, label: 'SKILL' },
  dash: { x: W - 245, y: H - 95, r: 40, label: 'DASH' }};

addEventListener('keydown', e => {
  if (!shopEl.hidden) { if (e.code === 'Escape') closeShop(); return; }
  const setOpen = !document.getElementById('settings').hidden;
  if (setOpen && e.code === 'Escape') { closeSettings(); return; }
  if (e.target.tagName === 'INPUT') { if (e.code === 'Enter' && e.target.id === 'code') document.getElementById('join').click(); return; }
  if (setOpen) return;
  keys[e.code] = true; ensureAudio();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && mode === 'game') e.preventDefault();
  if (e.code === 'KeyM') muted = !muted;
  if (mode !== 'game') return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (world.phase === 'play') { paused = !paused; kbFocus = 0; } return; }
  if (paused || world.phase === 'over') { // pause + game-over buttons: arrows / Tab pick, Enter / Space press
    const kb = uiButtons.filter(b => b.kb), n = kb.length; if (!n) return;
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, Tab: e.shiftKey ? -1 : 1 }[e.code];
    if (d) { kbFocus = (Math.min(kbFocus, n - 1) + d + n) % n; e.preventDefault(); }
    if (e.code === 'Enter' || e.code === 'Space') { kb[Math.min(kbFocus, n - 1)].fn(); e.preventDefault(); }
    return;
  }
  if (e.code.startsWith('Digit') && me.offer) pickUpgrade(+e.code.slice(5) - 1);
  if (e.code === 'KeyX') closeOldestPopup();
  if (e.code === 'KeyR') rerollUpgrades();
});
addEventListener('keyup', e => { keys[e.code] = false; });
function autoPause() {
  for (const k in keys) keys[k] = false; mouse.down = false; stickL = stickR = null;
  if (mode === 'game' && world.phase === 'play') paused = true;
}
addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });

function toLogical(e) {
  const r = C.getBoundingClientRect(), d = C.width / r.width;
  return { x: ((e.clientX - r.left) * d - ox) / scale, y: ((e.clientY - r.top) * d - oy) / scale };
}
C.addEventListener('pointerdown', e => {
  ensureAudio(); const p = toLogical(e);
  touchMode = e.pointerType === 'touch' || e.pointerType === 'pen';
  for (let i = uiButtons.length - 1; i >= 0; i--) { // last drawn = on top, so it wins
    const b = uiButtons[i];
    if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) { b.fn(); e.preventDefault(); return; }
  }
  if (mode !== 'game' || paused) return;
  try { C.setPointerCapture(e.pointerId); } catch (_) {}
  if (touchMode) {
    for (const k in TOUCH_BTN) { const b = TOUCH_BTN[k]; if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 10) { tap[k] = true; return; } }
    const st = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    if (p.x < W / 2 && !stickL) stickL = st; else if (p.x >= W / 2 && !stickR) stickR = st;
  } else {
    mouse.x = p.x; mouse.y = p.y; mouse.seen = T;
    if (e.button === 2) tap.skill = true; else if (e.button === 0) mouse.down = true;
  }
});
C.addEventListener('pointermove', e => {
  const p = toLogical(e);
  if (e.pointerType === 'mouse') { mouse.x = p.x; mouse.y = p.y; mouse.seen = T; return; }
  for (const s of [stickL, stickR]) if (s && s.id === e.pointerId) { s.x = p.x; s.y = p.y; }
});
function release(e) {
  if (e.pointerType === 'mouse' && e.button === 0) mouse.down = false;
  if (stickL && stickL.id === e.pointerId) stickL = null;
  if (stickR && stickR.id === e.pointerId) stickR = null;
}
C.addEventListener('pointerup', release); C.addEventListener('pointercancel', release);
C.addEventListener('contextmenu', e => e.preventDefault());

const NO_INPUT = { mx: 0, my: 0, ax: 0, ay: 0, aim: false, fire: false, dash: false, super: false, skill: false };
function readInput() {
  const k = (...c) => c.some(x => keys[x]);
  let mx = k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft'), my = k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp');
  const held = { fire: k('Space'), dash: k('ShiftLeft', 'ShiftRight'), super: k('KeyQ'), skill: k('KeyE', 'KeyF') };
  let ax = 0, ay = 0, aim = false;
  const gp = (navigator.getGamepads ? navigator.getGamepads() : [])[0];
  if (gp) {
    const dz = v => Math.abs(v) > .25 ? v : 0, bt = n => gp.buttons[n] && gp.buttons[n].pressed;
    mx += dz(gp.axes[0] || 0) + bt(15) - bt(14); my += dz(gp.axes[1] || 0) + bt(13) - bt(12);
    const gx = dz(gp.axes[2] || 0), gy = dz(gp.axes[3] || 0);
    if (Math.hypot(gx, gy) > .3) { ax = gx; ay = gy; aim = true; if (Math.hypot(gx, gy) > .6) held.fire = true; }
    if (bt(0) || bt(7)) held.fire = true; if (bt(1) || bt(5) || bt(4)) held.dash = true;
    if (bt(3) || bt(6)) held.super = true; if (bt(2)) held.skill = true;
  }
  if (stickL) { const dx = stickL.x - stickL.ox, dy = stickL.y - stickL.oy, d = Math.hypot(dx, dy); if (d > 8) { const m = Math.min(1, d / 70); mx = dx / d * m; my = dy / d * m; } }
  if (stickR) { const dx = stickR.x - stickR.ox, dy = stickR.y - stickR.oy; if (Math.hypot(dx, dy) > 12) { ax = dx; ay = dy; aim = true; held.fire = true; } }
  // Space = keyboard fire: skip mouse aim so player.js auto-aims at the nearest bug
  else if (!aim && !touchMode && mouse.seen > 0 && !keys.Space) { ax = mouse.x - me.x; ay = mouse.y - me.y; aim = true; if (mouse.down) held.fire = true; }
  const out = { mx, my, ax, ay, aim, fire: held.fire };
  for (const b of ['dash', 'super', 'skill']) { out[b] = (held[b] && !prevBtn[b]) || tap[b]; prevBtn[b] = held[b]; tap[b] = false; }
  return out;
}
