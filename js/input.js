'use strict';
// Keyboard + mouse, touch (twin virtual sticks + buttons) and gamepad, merged into one input snapshot per frame.

const keys = {}, mouse = { x: W / 2, y: H / 2, down: false, seen: -1 };
let gpAim = null, touchMode = false, stickL = null, stickR = null, tap = { dash: false, super: false, skill: false, cyber: false }, prevBtn = {};
const TOUCH_BTN = {
  super: { dx: 120, y: H - 260, r: 44, label: 'SUPER' },
  skill: { dx: 110, y: H - 120, r: 48, label: 'SKILL' },
  dash: { dx: 245, y: H - 95, r: 40, label: 'DASH' },
  cyber: { dx: 250, y: H - 225, r: 38, label: 'CYBER' }};
function placeTouch() { for (const k in TOUCH_BTN) TOUCH_BTN[k].x = W - TOUCH_BTN[k].dx; } // anchored to the right edge of the view
placeTouch();

addEventListener('keydown', e => {
  if (!bootEl.hidden) { if (!e.repeat) { e.preventDefault(); dismissBoot(); } return; }
  if (!cwEl.hidden) { if (e.code === 'Escape') cwBack(); return; } // zoom -> overview -> close
  if (!shopEl.hidden) { if (e.code === 'Escape') shopBack(); if ((e.code === 'KeyQ' || e.code === 'KeyE') && !e.repeat) ptCycle(e.code === 'KeyE' ? 1 : -1); return; }
  const setOpen = !document.getElementById('settings').hidden;
  if (setOpen && e.code === 'Escape') { closeSettings(); return; }
  if (e.target.tagName === 'INPUT') { if (e.code === 'Enter' && e.target.id === 'code') document.getElementById('join').click(); return; }
  if (setOpen) return;
  keys[e.code] = true; ensureAudio();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && mode === 'game') e.preventDefault();
  if (e.code === 'KeyM') muted = !muted;
  if (mode !== 'game') return;
  if (e.code === 'Escape' || e.code === 'KeyP') { if (world.phase === 'play') { paused = !paused; kbFocus = 0; cue(paused ? 'open' : 'close'); } return; }
  if (paused || world.phase === 'over') { // pause + game-over buttons: arrows / Tab pick, Enter / Space press
    const kb = uiButtons.filter(b => b.kb), n = kb.length; if (!n) return;
    const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, Tab: e.shiftKey ? -1 : 1 }[e.code];
    if (d) { kbFocus = (Math.min(kbFocus, n - 1) + d + n) % n; e.preventDefault(); }
    if (e.code === 'Enter' || e.code === 'Space') { cue('click'); kb[Math.min(kbFocus, n - 1)].fn(); e.preventDefault(); }
    return;
  }
  if (me.scan) { // scanner open: arrows pick the quickhack / target, Enter or Space uploads
    const d = { ArrowUp: -1, ArrowDown: 1 }[e.code], t = { ArrowLeft: -1, ArrowRight: 1 }[e.code];
    if (d) qhStep(d); if (t) qhCycle(t);
    if (e.code === 'Enter' || (e.code === 'Space' && !e.repeat)) qhUpload();
    if (d || t || e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); return; }
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
  if (e.pointerType !== 'mouse' || e.button === 0) for (let i = uiButtons.length - 1; i >= 0; i--) { // last drawn = on top, so it wins (left button only: right is back)
    const b = uiButtons[i];
    if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) { if (b.kb) cue('click'); b.fn(); e.preventDefault(); return; }
  }
  if (mode !== 'game' || paused) return;
  if (me.scan && !(e.pointerType === 'touch' || e.pointerType === 'pen')) { if (e.button === 0) qhUpload(); e.preventDefault(); return; } // click = upload
  if (me.scan) { const b = nearest(p, scanTargets()); if (b && Math.hypot(b.x - p.x, b.y - p.y) < 120) { qhTgt = b.id; me.scanP = 0; cue('qh_tag'); return; } } // tap a bug to target it
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
// Right-click never opens the browser menu. In menus it's BACK (clinic zoom > clinic > close, shop, settings, pause); in a run it's the skill.
addEventListener('contextmenu', e => {
  e.preventDefault();
  if (!bootEl.hidden) return;
  if (!cwEl.hidden) cwBack();
  else if (!shopEl.hidden) shopBack();
  else if (!document.getElementById('settings').hidden) closeSettings();
  else if (mode === 'game' && paused && world.phase === 'play') { paused = false; cue('close'); }
});
C.addEventListener('wheel', e => { if (mode === 'game' && me.scan) { qhStep(Math.sign(e.deltaY)); e.preventDefault(); } }, { passive: false });

const NO_INPUT = { mx: 0, my: 0, ax: 0, ay: 0, aim: false, fire: false, dash: false, super: false, skill: false, cyber: false };
function readInput() {
  const k = (...c) => c.some(x => keys[x]);
  const ar = !me.scan; // while scanning, the arrows drive the quickhack menu
  let mx = k('KeyD', ar && 'ArrowRight') - k('KeyA', ar && 'ArrowLeft'), my = k('KeyS', ar && 'ArrowDown') - k('KeyW', ar && 'ArrowUp');
  const held = { fire: k('Space'), dash: k('ShiftLeft', 'ShiftRight'), super: k('KeyQ'), skill: k('KeyE'), cyber: k('KeyC'), scan: k('KeyF') };
  let ax = 0, ay = 0, aim = false;
  const gp = (navigator.getGamepads ? navigator.getGamepads() : [])[0];
  if (gp) {
    const bt = n => gp.buttons[n] && gp.buttons[n].pressed;
    // radial dead zones (a per-axis one snaps the sticks to 8 directions), rescaled so the stick is analog right past the dead zone
    const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0, lm = Math.hypot(lx, ly);
    if (lm > .18) { const s = Math.min(1, (lm - .18) / .72) / lm; mx += lx * s; my += ly * s; }
    mx += bt(15) - bt(14); my += bt(13) - bt(12);
    const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0, rm = Math.hypot(rx, ry);
    if (rm > .15) { // free 360° aim, lightly smoothed; it holds its last direction when you let go (no snapping to the nearest bug)
      const nx = rx / rm, ny = ry / rm;
      if (!gpAim) gpAim = [nx, ny]; else { gpAim[0] += (nx - gpAim[0]) * .45; gpAim[1] += (ny - gpAim[1]) * .45; }
      if (rm > .6) held.fire = true;
    }
    if (bt(0) || bt(7)) held.fire = true;
    if (gpAim && (rm > .15 || held.fire)) { ax = gpAim[0]; ay = gpAim[1]; aim = true; } if (bt(1) || bt(5)) held.dash = true; if (bt(4)) held.scan = true; // LB: hold to scan
    if (me.scan) { for (const [n, f] of [[12, () => qhStep(-1)], [13, () => qhStep(1)], [0, () => qhUpload()]]) { if (bt(n) && !prevBtn['g' + n]) f(); prevBtn['g' + n] = bt(n); } held.fire = false; }
    if (bt(3) || bt(6)) held.super = true; if (bt(2)) held.skill = true; if (bt(10) || bt(11)) held.cyber = true; // L3 / R3: cyberware
  }
  if (stickL) { const dx = stickL.x - stickL.ox, dy = stickL.y - stickL.oy, d = Math.hypot(dx, dy); if (d > 8) { const m = Math.min(1, d / 70); mx = dx / d * m; my = dy / d * m; } }
  if (stickR) { const dx = stickR.x - stickR.ox, dy = stickR.y - stickR.oy; if (Math.hypot(dx, dy) > 12) { ax = dx; ay = dy; aim = true; held.fire = true; } }
  // Space = keyboard fire: skip mouse aim so player.js auto-aims at the nearest bug
  else if (!aim && !touchMode && mouse.seen > 0 && !keys.Space) { ax = mouse.x + cam.x - me.x; ay = mouse.y + cam.y - me.y; aim = true; if (mouse.down) held.fire = true; }
  me.scanHeld = held.scan;
  const out = { mx, my, ax, ay, aim, fire: held.fire };
  for (const b of ['dash', 'super', 'skill', 'cyber']) { out[b] = (held[b] && !prevBtn[b]) || tap[b]; prevBtn[b] = held[b]; tap[b] = false; }
  return out;
}
