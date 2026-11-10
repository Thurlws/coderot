'use strict';
// All drawing. The view is a 720-tall logical canvas whose width follows the screen (32-48 tiles), letterboxed to the window;
// the world (MW x MH) is drawn through the camera (cam, state.js), the HUD on top in view space.

const mkLayer = (w, h, f) => { const o = document.createElement('canvas'); o.width = w; o.height = h; f(o.getContext('2d')); return o; };
const RAIN = Array.from({ length: 64 }, () => ({ x: rand(0, MW), y: rand(-H, MH), sp: rand(60, 160), len: 6 + (Math.random() * 10 | 0) }));
let BG, VIG, DOTS;
function mkLayers() { // world floor (once) + view-sized vignette and dilation dots (rebuilt whenever the view width changes, setView)
  BG = BG || mkLayer(MW, MH, g => { // world floor: the menu gradient pushed dark, a red gutter per editor pane, cyan-line grid
  const gr = g.createLinearGradient(0, 0, 0, MH);
  gr.addColorStop(0, '#291319'); gr.addColorStop(.45, '#0B0F17'); gr.addColorStop(1, '#060E14'); g.fillStyle = gr; g.fillRect(0, 0, MW, MH);
  for (const px of [0, PANE * CELL]) {
    g.fillStyle = 'rgba(255,97,89,.035)'; g.fillRect(px, 0, CELL * 3.5, MH);
    g.fillStyle = 'rgba(255,97,89,.25)'; g.fillRect(px + CELL * 3.5, 0, 1, MH);
  }
  g.fillStyle = 'rgba(255,97,89,.5)'; g.fillRect(PANE * CELL - 1, 0, 2, MH); // the split between the panes
  g.strokeStyle = 'rgba(52,145,151,.10)'; g.lineWidth = 1;
  for (let x = 0; x <= MW; x += CELL) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, MH); g.stroke(); }
  for (let y = 0; y <= MH; y += CELL) { g.beginPath(); g.moveTo(0, y + .5); g.lineTo(MW, y + .5); g.stroke(); }
  g.fillStyle = 'rgba(94,246,255,.18)'; // registration crosses every 4 tiles
  for (let x = CELL * 4; x < MW; x += CELL * 4) for (let y = CELL * 4; y < MH; y += CELL * 4) { g.fillRect(x - 3, y, 7, 1); g.fillRect(x, y - 3, 1, 7); }
  g.strokeStyle = 'rgba(255,97,89,.45)'; g.lineWidth = 2; g.strokeRect(1, 1, MW - 2, MH - 2); // the edge of the map
});
  VIG = mkLayer(W, H, g => { // tokens fx.vignette (.55 → .6) + scanlines (.08, 4px)
  const gr = g.createRadialGradient(W / 2, H / 2, W * .55 * .5, W / 2, H / 2, W * .72);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.6)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,.08)'; for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
});
  DOTS = mkLayer(W, H, g => { // time dilation: blue halftone dots, bigger toward the edges
    g.fillStyle = '#28FFFF';
    for (let y = 3, row = 0; y < H; y += 7, row++) for (let x = 3 + (row & 1) * 3.5; x < W; x += 7) {
      const d = Math.hypot((x - W / 2) / (W / 2) * .9, (y - H / 2) / (H / 2)), r = clamp((d - .62) * 5, 0, 1.9);
      if (r > .2) { g.globalAlpha = clamp((d - .58) * 1.3, 0, .55); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } // cp-ok: halftone dot
    }
  });
}
mkLayers();

// ---------- style helpers: cyberpunk-ui tokens on canvas (canvas px = 1080p px / 1.5) ----------
const hexA = (c, a) => c[0] === '#' && c.length === 7 ? `rgba(${parseInt(c.slice(1, 3), 16)},${parseInt(c.slice(3, 5), 16)},${parseInt(c.slice(5, 7), 16)},${a})` : c;
// every glyph gets a faint halo of its own hue (fx.hudGlowBlur 8 / .45); outlines and fills don't
let uiA = 1; // multiplies every txt() alpha: the scanner dims the HUD under it
function txt(s, x, y, size, col, font = DISP, align = 'center', alpha = 1, glow = true) {
  X.globalAlpha = alpha * uiA; X.font = (font === DISP ? '600 ' : '') + size + 'px ' + font; X.textAlign = align; X.fillStyle = col;
  if (glow) { X.shadowColor = hexA(col, .45); X.shadowBlur = Math.min(8, 2 + size * .3) * scale; }
  X.fillText(s, x, y); X.shadowBlur = 0; X.globalAlpha = uiA;
}
const tw = (s, size, font = DISP) => { X.font = (font === DISP ? '600 ' : '') + size + 'px ' + font; return X.measureText(s).width; };
function cpath(x, y, w, h, c = 7, tl = 0) { // 45° chamfer bottom-right (+ top-left when tl > 0)
  X.beginPath(); X.moveTo(x + tl, y); X.lineTo(x + w, y); X.lineTo(x + w, y + h - c); X.lineTo(x + w - c, y + h); X.lineTo(x, y + h); X.lineTo(x, y + tl); X.closePath();
}
function plate(x, y, w, h, fill, stroke, c = 7, tl = 0) {
  cpath(x, y, w, h, c, tl);
  if (fill) { X.fillStyle = fill; X.fill(); }
  if (stroke) { X.strokeStyle = stroke; X.lineWidth = 1; X.stroke(); }
}
function para(x, y, w, h, sk) { X.beginPath(); X.moveTo(x + sk, y); X.lineTo(x + w + sk, y); X.lineTo(x + w, y + h); X.lineTo(x, y + h); X.closePath(); }
// skewed vitals bar: track, damage ghost (pale, trails the real value by 400ms), fill, segment gaps
function bar(x, y, w, h, frac, col, seg = 0, ghost = 0, sk = 5) {
  frac = clamp(frac, 0, 1);
  X.fillStyle = hexA(col, .14); para(x, y, w, h, sk); X.fill();
  if (ghost > frac) { X.fillStyle = 'rgba(237,231,230,.6)'; para(x + w * frac, y, w * (Math.min(1, ghost) - frac), h, sk); X.fill(); }
  X.fillStyle = col; para(x, y, w * frac, h, sk); X.fill();
  X.fillStyle = 'rgba(255,255,255,.18)'; para(x, y, w * frac, Math.max(1, h * .3), sk * .3); X.fill(); // lit top edge
  if (seg > 1 && seg < 40) { X.fillStyle = '#0B0F17'; for (let i = 1; i < seg; i++) { para(x + w * i / seg - 1, y, 2, h, sk); X.fill(); } }
}
function ticks(x, y, n, k, col, w = 5, h = 6, gap = 2) { for (let i = 0; i < n; i++) { X.fillStyle = i < k ? col : hexA(col, .15); X.fillRect(x + i * (w + gap), y, w, h); } }
function keycap(x, y, label, col = PAL.cyan, size = 10) { // hollow key glyph
  const w = Math.max(16, tw(label, size) + 8);
  X.strokeStyle = col; X.lineWidth = 1.5; X.strokeRect(x + .5, y + .5, w, 16); txt(label, x + w / 2 + .5, y + 12.5, size, col); return w;
}
// canvas menu item (pause + game over). Red ink; the focused one (keyboard or mouse) gets the cyan chamfered frame.
function button(x, y, w, h, label, col, fn, hot) {
  const i = uiButtons.filter(b => b.kb).length;
  if (mouse.seen > 0 && !touchMode && mouse.x > x && mouse.x < x + w && mouse.y > y && mouse.y < y + h && kbFocus !== i && T - mouse.seen < .05) kbFocus = i;
  const on = kbFocus === i;
  if (on) {
    plate(x, y, w, h, 'rgba(94,246,255,.07)', PAL.cyan, 8);
    X.fillStyle = hexA(PAL.cyan, .6); for (let k = 0; k < 3; k++) X.fillRect(x + w - 30 + k * 6, y + h / 2 - 5, 3, 10); // little decal, like the game's
  }
  txt(label, x + 14, y + h / 2 + 6, 17, on ? PAL.cyan : hot ? PAL.hot : col || PAL.red, DISP, 'left');
  uiButtons.push({ x, y, w, h, fn, kb: true });
}
function meter(x, y, w, frac, fill) { bar(x, y, w, 6, frac, fill, 0, 0, 3); }

// ---------- arena ----------
function drawGrid(t) {
  const sx = clamp(cam.x, 0, MW - 1), sy = clamp(cam.y, 0, MH - 1), sw = Math.min(W, MW - sx), sh = Math.min(H, MH - sy);
  X.drawImage(BG, sx, sy, sw, sh, sx, sy, sw, sh);
  X.font = '18px ' + MONO; X.textAlign = 'center'; X.textBaseline = 'middle';
  for (const d of RAIN) if (inView(d.x, d.y, 40) || inView(d.x, d.y - d.len * 18, 40)) for (let i = 0; i < d.len; i++) {
    X.fillStyle = i === 0 ? 'rgba(94,246,255,.25)' : `rgba(52,145,151,${.16 * (1 - i / d.len)})`;
    X.fillText(BITS[(i * 7 + (d.y / 18 | 0)) % BITS.length], d.x, d.y - i * 18);
  }
  X.font = '20px ' + MONO;
  const tick = Math.floor(t * 8);
  const c0 = Math.max(0, Math.floor(cam.x / CELL)), c1 = Math.min(COLS - 1, Math.floor((cam.x + W) / CELL));
  const r0 = Math.max(0, Math.floor(cam.y / CELL)), r1 = Math.min(ROWS - 1, Math.floor((cam.y + H) / CELL));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const k = r * COLS + c, v = rot[k], x = c * CELL, y = r * CELL;
    if (v > .04) {
      X.fillStyle = `rgba(104,30,31,${v * .65})`; X.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      if (v > .9) { X.fillStyle = `rgba(255,62,52,${.1 + .08 * Math.sin(t * 5 + k)})`; X.fillRect(x + 1, y + 1, CELL - 2, CELL - 2); }
    }
    let ch = CH[k];
    if (v > .55 && (k * 7 + tick) % 5 < 2) ch = GL[(k + tick) % GL.length];
    if (ch === ' ') continue;
    X.fillStyle = v > .3 ? `rgba(255,${97 - v * 40 | 0},${89 - v * 50 | 0},${.45 + v * .5})` : c % PANE < 3 ? 'rgba(223,74,66,.42)' : 'rgba(76,163,154,.34)';
    X.fillText(ch, x + CELL / 2 + (v > .7 ? rand(-1.5, 1.5) : 0), y + CELL / 2 + 1);
  }
  for (const d of world.dep) { // LEGACY KERNEL: deprecated tiles, warning then burning
    const x = (d.k % COLS) * CELL, y = (d.k / COLS | 0) * CELL, burn = d.t <= 4;
    if (burn) {
      X.fillStyle = `rgba(248,${70 + 36 * Math.sin(t * 12 + d.k) | 0},50,${.55 + .15 * Math.sin(t * 9 + d.k)})`; X.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      X.fillStyle = 'rgba(255,215,65,.9)'; X.font = '16px ' + MONO; X.fillText(GL[(d.k + (t * 10 | 0)) % GL.length], x + CELL / 2, y + CELL / 2);
    } else if (Math.floor(t * 6) % 2) {
      X.strokeStyle = PAL.rot; X.lineWidth = 2; X.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
      X.fillStyle = PAL.rot; X.font = '9px ' + MONO; X.fillText('DEPR', x + CELL / 2, y + CELL / 2);
    }
  }
  X.textBaseline = 'alphabetic';
  if (mode === 'game' && bossAlive()) { // the boss arena: a locked frame in the middle of the map
    const A = ARENA, p = .55 + .25 * Math.sin(t * 3);
    X.fillStyle = 'rgba(0,0,0,.35)'; // everything outside the arena dims
    X.fillRect(0, 0, MW, A.y); X.fillRect(0, A.y + A.h, MW, MH - A.y - A.h); X.fillRect(0, A.y, A.x, A.h); X.fillRect(A.x + A.w, A.y, MW - A.x - A.w, A.h);
    X.strokeStyle = hexA(PAL.rot, p); X.lineWidth = 3; X.strokeRect(A.x - 1.5, A.y - 1.5, A.w + 3, A.h + 3);
    X.fillStyle = hexA(PAL.rot, p); for (const [x, y] of [[A.x, A.y], [A.x + A.w, A.y], [A.x, A.y + A.h], [A.x + A.w, A.y + A.h]]) X.fillRect(x - 6, y - 6, 12, 12);
  }
}
// ---------- players ----------
const GHOST = [PAL.cyan, PAL.green, PAL.purple, PAL.gold];
function drawGhosts(list, shape) { // Sandevistan afterimages: hollow copies of the ship cycling through the HUD inks
  X.globalCompositeOperation = 'lighter'; X.lineWidth = 2; X.lineJoin = 'miter';
  for (const g of list) {
    const k = 1 - (T - g.t) / .5; if (k <= 0) continue;
    X.save(); X.translate(g.x, g.y); X.rotate(g.a); X.globalAlpha = k * .55; X.strokeStyle = GHOST[Math.floor(g.t * 28) % 4];
    X.beginPath(); for (const [px, py] of SHAPES[shape] || SHAPES.pulse) X.lineTo(px, py); X.closePath(); X.stroke(); X.restore();
  }
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
}
function drawWire() { // FIBER WHIP lash
  const w = me.wire; if (!w || T - w.t > .2 || me.down) return;
  const k = 1 - (T - w.t) / .2, n = 10;
  X.strokeStyle = PAL.hot; X.lineWidth = 2; X.globalAlpha = k; X.shadowColor = PAL.hot; X.shadowBlur = 10 * scale; X.beginPath();
  for (let i = 0; i <= n; i++) { const f = i / n, wob = Math.sin(f * Math.PI) * 14 * k * Math.sin(T * 60); X.lineTo(me.x + (w.x - me.x) * f - (w.y - me.y) / 200 * wob, me.y + (w.y - me.y) * f + (w.x - me.x) / 200 * wob); }
  X.stroke(); X.shadowBlur = 0; X.globalAlpha = 1;
}

// ---------- enemies ----------
function drawLoot(x, y, col, label, tip, t) {
  X.save(); X.translate(x, y + Math.sin(t * 4 + x) * 4); X.rotate(t * 2);
  X.shadowColor = col; X.shadowBlur = 22; X.strokeStyle = col; X.lineWidth = 3; X.strokeRect(-12, -12, 24, 24);
  X.fillStyle = col; X.fillRect(-5, -5, 10, 10); X.restore();
  txt(label, x, y + 30, 10, col); if (tip) txt(tip, x, y + 42, 9, col, MONO, 'center', .7);
}
'use strict';
// ---------- enemies v2: armoured, angular, one hot optic each. Drawn facing +x (the caller rotates to the bug's heading) ----------
const EN_DARK = '#140A0E'; // cp-ok: enemy art palette
function enPts(P, r) { X.beginPath(); P.forEach(([x, y], i) => i ? X.lineTo(x * r, y * r) : X.moveTo(x * r, y * r)); X.closePath(); }
function enHull(P, r, col, hit, blur = 12, lw = 1.6) { // dark armour plate, hot edge
  enPts(P, r); X.fillStyle = hit ? '#fff' : EN_DARK; X.shadowColor = col; X.shadowBlur = blur * scale; X.fill(); X.shadowBlur = 0;
  X.strokeStyle = col; X.lineWidth = lw; X.lineJoin = 'miter'; X.stroke();
}
function enOptic(x, y, w, h, col) { // a hot slit: white core inside a coloured bloom
  X.shadowColor = col; X.shadowBlur = 10 * scale; X.fillStyle = col; X.fillRect(x - w / 2, y - h / 2, w, h);
  X.shadowBlur = 0; X.fillStyle = '#fff'; X.fillRect(x - w / 4, y - h / 4, w / 2, h / 2);
}
function enLeg(x0, y0, x1, y1, x2, y2) { X.beginPath(); X.moveTo(x0, y0); X.lineTo(x1, y1); X.lineTo(x2, y2); X.stroke(); }

function drawMite(b, t, D, r, hit) { // BUG: a carapaced mite. Tripod gait, snapping mandibles, two optic slits
  const g = t * 16 + b.ph;
  X.strokeStyle = D.col; X.lineWidth = 1.6; X.lineJoin = 'miter'; X.lineCap = 'butt';
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const sw = Math.sin(g + i * 2.1 + (s > 0 ? Math.PI : 0)) * .24 * r, hx = (.35 - i * .42) * r;
    enLeg(hx, s * .45 * r, hx + (.12 - i * .1) * r + sw * .5, s * 1.08 * r, hx + (.42 - i * .38) * r + sw, s * 1.55 * r);
  }
  const m = .16 + .16 * Math.max(0, Math.sin(t * 9 + b.ph)); X.lineWidth = 2;
  for (const s of [-1, 1]) enLeg(.8 * r, s * .28 * r, 1.38 * r, s * (.28 + m) * r, 1.55 * r, s * .06 * r);
  enHull([[1, 0], [.62, -.55], [-.35, -.7], [-1.05, -.4], [-1.25, 0], [-1.05, .4], [-.35, .7], [.62, .55]], r, D.col, hit);
  enPts([[1, 0], [.62, -.55], [.36, -.44], [.36, .44], [.62, .55]], r); X.fillStyle = hexA(D.col, .4); X.fill();
  X.strokeStyle = hexA(D.col, .5); X.lineWidth = 1; X.beginPath();
  for (const sx of [-.15, -.5, -.82]) { const e = .64 - Math.abs(sx) * .25; X.moveTo(sx * r, -e * r); X.lineTo((sx - .14) * r, 0); X.lineTo(sx * r, e * r); }
  X.stroke();
  X.fillStyle = D.col; X.globalAlpha = .45 + .45 * Math.sin(t * 7 + b.ph); X.fillRect(-1.05 * r, -1, .85 * r, 2); X.globalAlpha = 1;
  enOptic(.62 * r, -.2 * r, r * .2, r * .13, D.col); enOptic(.62 * r, .2 * r, r * .2, r * .13, D.col);
}

function drawShard(b, t, D, r, hit) { // GLITCH: an RGB-split blade that tears through frames
  const P = [[1.75, 0], [-.45, -.9], [-.1, 0], [-.45, .9]];
  X.strokeStyle = hexA(D.col, .35); X.lineWidth = 1; X.beginPath();
  for (const y of [-.5, 0, .5]) { const l = 1 + ((t * 7 + y * 3 + b.ph) % 1) * 1.8; X.moveTo(-.6 * r, y * r); X.lineTo(-(.6 + l) * r, y * r); }
  X.stroke();
  const j = (Math.sin(t * 31 + b.ph) > .82) ? 4 : 1.6;
  X.globalCompositeOperation = 'lighter'; X.lineWidth = 1.2; X.globalAlpha = .6;
  for (const [c, dx, dy] of [['#FF3E34', -j, -j * .6], ['#5EF6FF', j * .4, j]]) { X.save(); X.translate(dx, dy); enPts(P, r); X.strokeStyle = c; X.stroke(); X.restore(); }
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  enHull(P, r, D.col, hit, 14);
  X.beginPath(); X.moveTo(1.35 * r, 0); X.lineTo(.1 * r, 0); X.strokeStyle = hexA(D.col, .6); X.lineWidth = 1; X.stroke();
  if (Math.sin(t * 23 + b.ph * 3) > .7) { // a torn slice: one band of the blade jumps sideways
    const y0 = (Math.sin(t * 50 + b.ph) * .5) * r; X.save(); X.beginPath(); X.rect(-2 * r, y0, 4 * r, r * .3); X.clip(); X.translate(r * .5, 0);
    enPts(P, r); X.fillStyle = D.col; X.globalAlpha = .7; X.fill(); X.restore(); X.globalAlpha = 1;
  }
  enOptic(.6 * r, 0, r * .4, r * .22, D.col);
}

function forkShell(r, col, hit, spikes) { // octagonal mine with spikes on its vertices
  X.fillStyle = col;
  for (let i = 0; i < 8; i++) {
    if (!spikes.includes(i)) continue;
    const a = i * Math.PI / 4 + Math.PI / 8, c = Math.cos(a), s = Math.sin(a), n = .2;
    X.beginPath(); X.moveTo((c * .8 - s * n) * r, (s * .8 + c * n) * r); X.lineTo(c * 1.42 * r, s * 1.42 * r); X.lineTo((c * .8 + s * n) * r, (s * .8 - c * n) * r); X.fill();
  }
  const O = Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4 + Math.PI / 8; return [Math.cos(a), Math.sin(a)]; });
  enHull(O, r, col, hit, 12, 1.8);
  enPts(O.map(([x, y]) => [x * .58, y * .58]), r); X.strokeStyle = hexA(col, .45); X.lineWidth = 1; X.stroke();
}
function drawForkBomb(b, t, D, r, hit) { // FORK BOMB: a spiked mine already splitting in two; the seam burns hotter as it pulses
  X.rotate(t * 1.2 + b.ph);
  const gap = (.1 + .12 * (Math.sin(t * 7 + b.ph) * .5 + .5)) * r;
  X.shadowColor = D.col; X.shadowBlur = 14 * scale; X.fillStyle = hexA(D.col, .55); X.fillRect(-.95 * r, -gap, 1.9 * r, gap * 2); X.shadowBlur = 0; // molten core between the halves
  for (const s of [-1, 1]) {
    X.save(); X.beginPath(); X.rect(-2 * r, s > 0 ? 0 : -2 * r, 4 * r, 2 * r); X.clip(); X.translate(0, s * gap);
    forkShell(r, D.col, hit, [0, 1, 2, 3, 4, 5, 6, 7]); X.restore();
  }
  const k = Math.floor(t * 8 + b.ph) % 8; // countdown ring
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; X.fillStyle = i <= k ? D.col : hexA(D.col, .2); X.fillRect(Math.cos(a) * .36 * r - 1.5, Math.sin(a) * .36 * r - 1.5, 3, 3); }
}
function drawForklet(b, t, D, r, hit) { // FORK: a torn-off half shell, tumbling, raw seam glowing
  X.rotate(t * 5 + b.ph);
  X.save(); X.beginPath(); X.rect(-2 * r, 0, 4 * r, 2 * r); X.clip(); forkShell(r, D.col, hit, [0, 1, 2, 3]); X.restore();
  X.globalCompositeOperation = 'lighter'; X.shadowColor = D.col; X.shadowBlur = 10 * scale; X.fillStyle = hexA(D.col, .9); X.fillRect(-r, -1, 2 * r, 3);
  X.shadowBlur = 0; X.globalCompositeOperation = 'source-over';
  enOptic(0, .45 * r, r * .45, r * .25, D.col);
}

function drawAdware(b, t, D, r, hit) { // ADWARE: a popup that grew teeth. Fake close box, cables dangling, maw that chews
  X.rotate(Math.sin(t * 3 + b.ph) * .12);
  const w = r * 2.2, h = r * 1.8, x0 = -w / 2, y0 = -h / 2;
  X.strokeStyle = hexA(D.col, .7); X.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const x = x0 + w * (.18 + .21 * i); X.beginPath(); X.moveTo(x, y0 + h);
    for (let k = 1; k <= 4; k++) X.lineTo(x + Math.sin(t * 6 + i * 1.7 + k) * 3, y0 + h + k * 4.5); X.stroke();
  }
  X.shadowColor = D.col; X.shadowBlur = 16 * scale; cpath(x0, y0, w, h, 8, 5); X.fillStyle = hit ? '#fff' : '#1E0910'; X.fill(); X.shadowBlur = 0; // cp-ok: enemy art palette
  X.strokeStyle = D.col; X.lineWidth = 1.6; X.stroke();
  X.fillStyle = D.col; X.beginPath(); X.moveTo(x0 + 5, y0); X.lineTo(x0 + w, y0); X.lineTo(x0 + w, y0 + 7); X.lineTo(x0, y0 + 7); X.lineTo(x0, y0 + 5); X.closePath(); X.fill();
  if (Math.floor(t * 5 + b.ph) % 2) { X.fillStyle = EN_DARK; X.fillRect(x0 + 5, y0 + 2, 3, 3); X.fillRect(x0 + 10, y0 + 2, 3, 3); }
  X.strokeStyle = EN_DARK; X.lineWidth = 1.4; X.beginPath(); X.moveTo(x0 + w - 7, y0 + 1.5); X.lineTo(x0 + w - 3, y0 + 5.5); X.moveTo(x0 + w - 3, y0 + 1.5); X.lineTo(x0 + w - 7, y0 + 5.5); X.stroke();
  const my = y0 + h * .64, op = (.12 + .14 * (Math.sin(t * 7 + b.ph) * .5 + .5)) * h, mx0 = x0 + 4, mw = w - 8, n = 7;
  X.fillStyle = '#3A0712'; X.fillRect(mx0, my - op, mw, op * 2); // cp-ok: enemy art palette
  X.fillStyle = hit ? D.col : '#FFD9DC'; // cp-ok: enemy art palette
  for (const s of [-1, 1]) {
    X.beginPath(); X.moveTo(mx0, my - s * op - s * 2);
    for (let i = 0; i < n; i++) { X.lineTo(mx0 + mw * (i + .5) / n, my - s * op + s * op * .9); X.lineTo(mx0 + mw * (i + 1) / n, my - s * op - s * 2); }
    X.closePath(); X.fill();
  }
  X.strokeStyle = D.col; X.lineWidth = 1; X.strokeRect(mx0, my - op - 2, mw, op * 2 + 4);
  for (const s of [-1, 1]) { // slanted angry slits
    X.save(); X.translate(s * w * .22, y0 + h * .3); X.rotate(s * .35); enOptic(0, 0, r * .5, r * .16, D.col); X.restore();
  }
}

function drawLeak(b, t, D, r, hit) { // MEMORY LEAK: corrupted ooze with a hex lattice, too many eyes, bytes dripping off
  const N = 22, P = [];
  for (let i = 0; i < N; i++) { const a = i / N * 6.283, rr = 1 + .1 * Math.sin(a * 3 + t * 4 + b.ph) + .06 * Math.sin(a * 7 - t * 6); P.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  for (let i = 0; i < 3; i++) { const f = (t * .7 + i / 3 + b.ph) % 1; X.globalAlpha = 1 - f; X.fillStyle = D.col; X.fillRect((-1.05 - f * 1.4) * r, (i - 1) * .45 * r, 4 - f * 2, 4 - f * 2); }
  X.globalAlpha = 1;
  enPts(P, r); X.save(); X.clip();
  const gr = X.createRadialGradient(0, 0, r * .1, 0, 0, r * 1.1); gr.addColorStop(0, hit ? '#fff' : '#05101F'); gr.addColorStop(1, hexA(D.col, .75)); // cp-ok: enemy art palette
  X.fillStyle = gr; X.fillRect(-1.3 * r, -1.3 * r, 2.6 * r, 2.6 * r);
  X.strokeStyle = hexA(D.col, .3); X.lineWidth = 1; X.beginPath();
  const hs = r * .32;
  for (let q = -3; q <= 3; q++) for (let p = -3; p <= 3; p++) {
    const cx = p * hs * 1.5, cy = (q + (p & 1) * .5) * hs * 1.73;
    for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3; k ? X.lineTo(cx + Math.cos(a) * hs, cy + Math.sin(a) * hs) : X.moveTo(cx + hs, cy); }
  }
  X.stroke(); X.restore();
  enPts(P, r); X.shadowColor = D.col; X.shadowBlur = 18 * scale; X.strokeStyle = D.col; X.lineWidth = 2; X.stroke(); X.shadowBlur = 0;
  const E = [[.3, -.25, 1], [.42, .22, .8], [-.15, -.45, .6], [-.25, .35, .7], [.05, 0, 1.2]];
  E.forEach(([ex, ey, s], i) => { const bl = Math.sin(t * 2.3 + i * 1.9 + b.ph) > .85 ? .15 : 1; enOptic(ex * r, ey * r, r * .26 * s, r * .14 * s * bl, PAL.rot); });
}

function drawTrojanOpen(b, t, D, r, hit) { // TROJAN unmasked: the loot crate split open on four scythe legs, one red eye in the gap
  const st = Math.sin(t * 12 + b.ph), gap = (.16 + .07 * Math.sin(t * 9 + b.ph)) * r;
  X.fillStyle = D.col; X.shadowColor = D.col; X.shadowBlur = 8 * scale;
  for (let i = 0; i < 4; i++) { // scythe blades out of the crate's corners, stabbing in turn
    X.save(); X.rotate(i * Math.PI / 2 + Math.PI / 4 + (i % 2 ? st : -st) * .15);
    enPts([[.55, -.14], [1.35, -.34], [1.9, .12], [1.4, -.06], [.55, .14]], r); X.fill(); X.restore();
  }
  X.shadowBlur = 0;
  X.save(); X.rotate(-Math.PI / 4); X.shadowColor = PAL.rot; X.shadowBlur = 16 * scale; X.fillStyle = hexA(PAL.rot, .85); X.fillRect(-1.05 * r, -gap, 2.1 * r, gap * 2); X.shadowBlur = 0; X.restore();
  for (const s of [-1, 1]) {
    X.save(); X.translate(s * gap * .7, -s * gap * .7);
    enPts(s < 0 ? [[-1, -1], [1, -1], [-1, 1]] : [[1, -1], [1, 1], [-1, 1]], r * .78); X.fillStyle = hit ? '#fff' : EN_DARK; X.fill(); X.strokeStyle = D.col; X.lineWidth = 1.8; X.stroke();
    X.fillStyle = hexA(D.col, .35); enPts(s < 0 ? [[-.8, -.8], [-.2, -.8], [-.8, -.2]] : [[.8, .8], [.2, .8], [.8, .2]], r * .78); X.fill();
    X.restore();
  }
  X.save(); X.rotate(-Math.PI / 4); enOptic(0, 0, r * .9, r * .22, PAL.rot); X.restore();
}

function drawSegfault(b, t, D, r, hit) { // SEGFAULT: an armoured crab tank. Pincers, glowing fault lines, a scanning visor
  const g = t * 6 + b.ph;
  X.strokeStyle = D.col; X.lineWidth = 2.5; X.lineJoin = 'miter';
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const sw = Math.sin(g + i * 2 + (s > 0 ? Math.PI : 0)) * .12 * r, hx = (.2 - i * .38) * r;
    enLeg(hx, s * .7 * r, hx + .05 * r + sw, s * 1.12 * r, hx - .1 * r + sw * 1.5, s * 1.32 * r);
  }
  const op = .1 + .28 * Math.max(0, Math.sin(t * 3.5 + b.ph));
  for (const s of [-1, 1]) { // arm out of the shoulder, then a crab claw: fixed lower jaw, upper jaw that snaps
    X.lineWidth = 3.5; X.beginPath(); X.moveTo(.55 * r, s * .6 * r); X.lineTo(.95 * r, s * .82 * r); X.lineTo(1.12 * r, s * .62 * r); X.stroke();
    X.save(); X.translate(1.12 * r, s * .62 * r); X.scale(1, s);
    enHull([[-.08, .1], [.25, .2], [.62, .02], [.2, -.02]], r, D.col, hit, 8, 2);
    X.rotate(-op); enHull([[-.08, -.05], [.3, -.3], [.72, -.12], [.5, -.06], [.2, -.02]], r, D.col, hit, 8, 2);
    X.restore();
  }
  const S = [[.95, 0], [.68, -.72], [-.15, -.95], [-.85, -.72], [-1.05, 0], [-.85, .72], [-.15, .95], [.68, .72]];
  enHull(S, r, D.col, hit, 18, 2.5);
  enPts([[.55, -.12], [-.95, -.1], [-.95, .1], [.55, .12]], r); X.fillStyle = hexA(D.col, .3); X.fill(); // spine ridge
  X.strokeStyle = hexA(D.col, .55); X.lineWidth = 1.5; X.beginPath(); // armour bands
  for (const sx of [.35, -.1, -.55]) { const e = .9 - Math.abs(sx + .1) * .35; X.moveTo(sx * r, -e * r); X.lineTo((sx - .22) * r, 0); X.lineTo(sx * r, e * r); }
  X.stroke();
  X.globalCompositeOperation = 'lighter'; X.lineWidth = 1.5; X.strokeStyle = '#fff';
  X.globalAlpha = .45 + .45 * Math.abs(Math.sin(t * 5 + b.ph));
  X.shadowColor = D.col; X.shadowBlur = 10 * scale; X.beginPath();
  X.moveTo(-.2 * r, -.9 * r); X.lineTo(-.05 * r, -.55 * r); X.lineTo(-.3 * r, -.3 * r); X.lineTo(-.1 * r, 0);
  X.moveTo(-.75 * r, .55 * r); X.lineTo(-.45 * r, .4 * r); X.lineTo(-.55 * r, .15 * r);
  X.stroke(); X.shadowBlur = 0; X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  X.fillStyle = '#05070B'; enPts([[.86, -.38], [.62, -.46], [.62, .46], [.86, .38]], r); X.fill(); // cp-ok: enemy art palette
  enOptic(.74 * r, Math.sin(t * 2 + b.ph) * .3 * r, r * .14, r * .22, D.col);
}

// dispatcher, same contract as the game's drawBug body (caller already translated to the bug)
const DRAW_BUG = { crawl: drawMite, zip: drawShard, fork: drawForkBomb, forklet: drawForklet, adware: drawAdware, leak: drawLeak, trojan: drawTrojanOpen, seg: drawSegfault };
function drawBug(b, t) {
  const D = BUG[b.type], r = b.r;
  if (b.type === 'trojan' && !b.rev) return drawLoot(b.x, b.y, PAL.gold, 'FREE RAM?', 'totally safe', t);
  if (b.type === 'boss') return drawBoss(b, t);
  if (D.part) return drawPart(b, t);
  if (b.type === 'lock' || b.type === 'cache' || b.type === 'zombie') return drawElite(b, t);
  X.save(); X.translate(b.x, b.y); if (b.type !== 'adware') X.rotate(Math.atan2(b.vy, b.vx));
  DRAW_BUG[b.type](b, t, D, r, b.hit > 0); X.restore();
  if (b.frz > 0) { X.strokeStyle = PAL.ice; X.lineWidth = 2; X.globalAlpha = .8; X.beginPath(); X.arc(b.x, b.y, r + 6, 0, 7); X.stroke(); X.globalAlpha = 1; }
  if (b.type === 'seg' || b.type === 'leak' || b.type === 'adware') hpBar(b, D.col);
}
function hpBar(b, col, w = 48) {
  X.fillStyle = 'rgba(0,0,0,.5)'; X.fillRect(b.x - w / 2, b.y - b.r - 12, w, 4);
  X.fillStyle = col; X.fillRect(b.x - w / 2, b.y - b.r - 12, w * clamp(b.hp / b.mhp, 0, 1), 4);
}
// ---------- late-game elites ----------
const CUBE = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const CUBE_E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
function lockBeam(a, b, t, col) { // crackling mutex beam: hurts on touch (player.js)
  const n = 14, pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, j = i && i < n ? rand(-7, 7) : 0, nx = -(b.y - a.y), ny = b.x - a.x, nl = Math.hypot(nx, ny) || 1;
    pts.push([a.x + (b.x - a.x) * f + nx / nl * j, a.y + (b.y - a.y) * f + ny / nl * j]);
  }
  X.globalCompositeOperation = 'lighter'; X.lineCap = 'round'; X.lineJoin = 'round';
  for (const [c, w, al] of [[col, 14, .18], [col, 4, .9], ['#fff', 1.5, 1]]) {
    X.strokeStyle = c; X.lineWidth = w; X.globalAlpha = al; X.beginPath(); pts.forEach(([x, y], i) => i ? X.lineTo(x, y) : X.moveTo(x, y)); X.stroke();
  }
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
}
function drawElite(b, t) {
  const D = BUG[b.type], r = b.r, hit = b.hit > 0;
  if (b.type === 'lock') { // DEADLOCK: twin gear-locks joined by a spinning beam
    const p = world.bugs.find(x => x.id === b.aux && !x.dead && x.type === 'lock'), rage = !p, col = rage ? PAL.red : D.col;
    if (p && b.id < p.id) lockBeam(b, p, t, D.col);
    X.save(); X.translate(b.x, b.y); X.rotate(t * (rage ? 7 : 2.2) * (b.id % 2 ? 1 : -1));
    X.fillStyle = col; X.shadowColor = col; X.shadowBlur = rage ? 28 : 14;
    for (let i = 0; i < 10; i++) { X.rotate(.6283); X.fillRect(-3.5, -r - 7, 7, 9); }
    poly(6, r); X.fillStyle = hit ? '#fff' : '#241210'; X.fill(); X.lineWidth = 3; X.strokeStyle = col; X.stroke(); X.shadowBlur = 0;
    X.restore();
    X.save(); X.translate(b.x, b.y);
    X.strokeStyle = col; X.lineWidth = 3; X.beginPath(); X.arc(0, -r * .15, r * .42, Math.PI, 0); X.stroke();
    X.fillStyle = col; X.fillRect(-r * .55, -r * .15, r * 1.1, r * .8);
    const glow = .6 + .4 * Math.sin(t * (rage ? 20 : 6));
    X.fillStyle = `rgba(255,255,255,${glow})`; X.shadowColor = '#fff'; X.shadowBlur = 12;
    X.beginPath(); X.arc(0, r * .12, r * .16, 0, 7); X.fill(); X.fillRect(-2, r * .12, 4, r * .38); X.shadowBlur = 0;
    X.restore();
  } else if (b.type === 'cache') { // CACHE MISS: an RGB-split wireframe cube that phases out before it jumps
    const phasing = b.aux > 0;
    if (phasing) { // destination: corner brackets closing in
      const k = b.aux - 1, cx = (k % COLS + .5) * CELL, cy = ((k / COLS | 0) + .5) * CELL, q = 26 + 14 * Math.abs(Math.sin(t * 9));
      X.strokeStyle = D.col; X.lineWidth = 3; X.globalAlpha = .9;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { X.beginPath(); X.moveTo(cx + sx * q, cy + sy * (q - 9)); X.lineTo(cx + sx * q, cy + sy * q); X.lineTo(cx + sx * (q - 9), cy + sy * q); X.stroke(); }
      X.fillStyle = `rgba(120,173,255,${.15 + .15 * Math.sin(t * 20)})`; X.fillRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL); X.globalAlpha = 1;
    }
    const ay = t * 2.1 + b.ph, ax = t * 1.4, s = r * .85;
    const P = CUBE.map(([x, y, z]) => {
      const x1 = x * Math.cos(ay) - z * Math.sin(ay), z1 = x * Math.sin(ay) + z * Math.cos(ay), y1 = y * Math.cos(ax) - z1 * Math.sin(ax), z2 = y * Math.sin(ax) + z1 * Math.cos(ax);
      const k = 3 / (3.4 + z2); return [x1 * s * k, y1 * s * k];
    });
    X.save(); X.translate(b.x, b.y); X.globalCompositeOperation = 'lighter'; X.globalAlpha = phasing ? .25 + .25 * Math.random() : 1;
    const jit = phasing || Math.random() < .08 ? 5 : 2;
    for (const [c, dx] of [['#FF3E34', -jit], ['#5EF6FF', jit], [hit ? '#fff' : D.col, 0]]) {
      X.strokeStyle = c; X.lineWidth = dx ? 1.5 : 2.5; X.beginPath();
      for (const [i, j] of CUBE_E) { X.moveTo(P[i][0] + dx, P[i][1]); X.lineTo(P[j][0] + dx, P[j][1]); } X.stroke();
    }
    X.fillStyle = '#fff'; X.shadowColor = D.col; X.shadowBlur = 16; X.fillRect(-4, -4, 8, 8); X.shadowBlur = 0;
    X.restore(); X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  } else if (b.aux > 0) { // ZOMBIE grave: tombstone, a hand clawing out as the timer runs down
    const k = 1 - clamp(b.aux / 4, 0, 1);
    X.save(); X.translate(b.x, b.y);
    X.fillStyle = '#172C2E'; X.strokeStyle = D.col; X.lineWidth = 2;
    X.beginPath(); X.moveTo(-13, 14); X.lineTo(-13, -4); X.arc(0, -4, 13, Math.PI, 0); X.lineTo(13, 14); X.closePath(); X.fill(); X.stroke();
    X.strokeStyle = D.col; X.lineWidth = 1.5; X.beginPath(); X.moveTo(-6, -6); X.lineTo(6, -6); X.moveTo(0, -12); X.lineTo(0, 4); X.stroke();
    X.fillStyle = D.col; X.globalAlpha = k; // hand
    X.fillRect(15, 14 - 16 * k, 5, 16 * k); for (let i = 0; i < 3; i++) X.fillRect(14 + i * 3, 12 - 16 * k - 4, 2, 5);
    X.globalAlpha = .8; X.strokeStyle = PAL.red; X.beginPath(); X.arc(0, 2, 26, -Math.PI / 2, -Math.PI / 2 + 6.283 * k); X.stroke();
    X.restore(); X.globalAlpha = 1;
    return;
  } else { // ZOMBIE PROCESS: a rotting, swaying terminal window with dead eyes; heals on rot
    const w = r * 2.3, h = r * 1.8, c = ci(b.x, b.y), feeding = c >= 0 && rot[c] > .5;
    X.save(); X.translate(b.x, b.y); X.rotate(Math.sin(t * 1.6 + b.ph) * .12);
    X.shadowColor = D.col; X.shadowBlur = 20; X.fillStyle = hit ? '#fff' : '#172C2E'; X.fillRect(-w / 2, -h / 2, w, h); X.shadowBlur = 0;
    X.fillStyle = '#2E9C64'; X.fillRect(-w / 2, -h / 2, w, 7);
    X.strokeStyle = D.col; X.lineWidth = 2; X.beginPath(); // ragged frame with a bite out of one corner
    X.moveTo(-w / 2, -h / 2); X.lineTo(w / 2 - 12, -h / 2); X.lineTo(w / 2 - 6, -h / 2 + 7); X.lineTo(w / 2, -h / 2 + 4); X.lineTo(w / 2, h / 2); X.lineTo(-w / 2, h / 2); X.closePath(); X.stroke();
    X.strokeStyle = 'rgba(46,156,100,.5)'; X.lineWidth = 1; X.beginPath(); X.moveTo(-w * .2, -h / 2 + 7); X.lineTo(-w * .05, 0); X.lineTo(-w * .15, h * .2); X.stroke();
    for (const sd of [-1, 1]) { X.fillStyle = D.col; X.shadowColor = D.col; X.shadowBlur = 10; X.fillRect(sd * w * .2 - 6, -2 + (sd > 0 ? 3 : 0), 12, 4); }
    X.shadowBlur = 0; X.fillStyle = D.col; for (let i = 0; i < 6; i++) X.fillRect(-w * .25 + i * w * .1, h * .22 + (i % 2) * 3, w * .06, 4);
    for (let i = 0; i < 4; i++) { const dx = -w / 2 + 8 + i * (w - 16) / 3, len = 6 + 10 * ((t * .8 + i * .37 + b.ph) % 1); X.fillRect(dx, h / 2, 3, len); }
    X.restore();
    if (feeding) for (let i = 0; i < 3; i++) { const f = (t * .9 + i / 3) % 1; txt('+', b.x - 16 + i * 16, b.y - r - 4 - f * 24, 14, '#1DED83', DISP, 'center', 1 - f); }
  }
  if (b.frz > 0) { X.strokeStyle = PAL.ice; X.lineWidth = 2; X.globalAlpha = .8; X.beginPath(); X.arc(b.x, b.y, r + 8, 0, 7); X.stroke(); X.globalAlpha = 1; }
  hpBar(b, D.col, 40);
}
function poly(n, r) { X.beginPath(); for (let i = 0; i <= n; i++) { const a = i * 6.283 / n - Math.PI / 2; X.lineTo(Math.cos(a) * r, Math.sin(a) * r); } }
// ---------- bosses ----------
const parentOf = p => world.bugs.find(x => x.id === p.pid);
const aimAt = (b, fallback) => { const p = nearest(b, livePlayers()); return p ? Math.atan2(p.y - b.y, p.x - b.x) : fallback; };
function drawBoss(b, t) {
  const ai = bossDef(b).ai;
  if (ai === 'kernel') drawKernel(b, t);
  else if (ai === 'bsod') drawBsod(b, t);
  else if (ai === 'loop') drawLoop(b, t);
  else if (ai === 'deploy') drawDeploy(b, t);
  else drawClassicBoss(b, t);
  if (b.frz > 0) { X.strokeStyle = PAL.ice; X.lineWidth = 3; X.beginPath(); X.arc(b.x, b.y, b.r + 14, 0, 7); X.stroke(); }
  if (b.stn > 0) for (let i = 0; i < 5; i++) { const a = t * 4 + i * 1.257; txt('*', b.x + Math.cos(a) * (b.r + 10), b.y - b.r - 10 + Math.sin(a) * 8, 18, PAL.gold, DISP); }
  X.textBaseline = 'middle';
}
// THE MONOLITH + SPAGHETTI PRIME keep their original look; the Monolith adds a shield while its pillars stand
function drawClassicBoss(b, t) {
  const B = bossDef(b), r = b.r, rage = b.hp < b.mhp * .4, hit = b.hit > 0, open = B.ai === 'monolith' && b.aux > 0;
  const col = open ? PAL.gold : rage && Math.sin(t * 10) > 0 ? PAL.red : B.col, spin = rage ? 1.6 : .8;
  if (B.ai === 'monolith' && !open && partsOf(b, 'pillar').length) {
    X.strokeStyle = `rgba(82,221,223,${.35 + .2 * Math.sin(t * 4)})`; X.lineWidth = 3; X.shadowColor = PAL.ice; X.shadowBlur = 16;
    X.beginPath(); X.arc(b.x, b.y, r * 1.55, 0, 7); X.stroke(); X.shadowBlur = 0;
  }
  if (open) txt('CORE EXPOSED ' + Math.ceil(b.aux) + 's', b.x, b.y - r * 1.6, 13, PAL.gold);
  X.save(); X.translate(b.x, b.y);
  X.font = '16px ' + MONO; X.textAlign = 'center'; X.textBaseline = 'middle';
  for (let i = 0; i < 24; i++) { // orbiting glyph ring
    const a = i / 24 * 6.283 + t * spin;
    X.fillStyle = i % 3 ? B.col : '#fff'; X.globalAlpha = i % 3 ? .7 : 1;
    X.fillText(BITS[(i + (t * 6 | 0)) % BITS.length], Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35);
  }
  X.globalAlpha = 1;
  X.shadowColor = col; X.shadowBlur = 40; X.strokeStyle = col; X.lineWidth = 6;
  if (B.sides) {
    X.rotate(t * spin * .6); poly(B.sides, r); X.stroke();
    X.rotate(-t * spin * 1.2); X.lineWidth = 3; poly(B.sides, r * .72); X.stroke();
    X.rotate(t * spin * .6);
  } else { // SPAGHETTI PRIME: writhing noodles
    X.lineWidth = 5; X.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a0 = i / 9 * 6.283 + t * .3; X.beginPath();
      for (let s = 0; s <= 10; s++) { const rr = r * (.5 + s * .1), w = Math.sin(t * 5 + i + s * .7) * .35; X.lineTo(Math.cos(a0 + w) * rr, Math.sin(a0 + w) * rr); }
      X.stroke();
    }
  }
  X.shadowBlur = 0;
  X.fillStyle = hit ? '#fff' : '#351113'; X.beginPath(); X.arc(0, 0, r * .62, 0, 7); X.fill();
  const ea = aimAt(b, t);
  X.fillStyle = col; X.shadowColor = col; X.shadowBlur = 30;
  X.beginPath(); X.arc(Math.cos(ea) * r * .2, Math.sin(ea) * r * .2, r * (.22 + .03 * Math.sin(t * 9)), 0, 7); X.fill();
  X.shadowBlur = 0; X.fillStyle = '#fff'; X.beginPath(); X.arc(Math.cos(ea) * r * .28, Math.sin(ea) * r * .28, r * .08, 0, 7); X.fill();
  X.restore();
}
// LEGACY KERNEL: a beige CRT monitor typing kernel panics, eyes on the screen
function drawKernel(b, t) {
  const r = b.r, w = r * 2.5, h = r * 1.9, hit = b.hit > 0, rage = b.hp < b.mhp * .4;
  X.save(); X.translate(b.x, b.y);
  X.shadowColor = rage && Math.sin(t * 10) > 0 ? PAL.red : '#C583FF'; X.shadowBlur = 26;
  X.fillStyle = hit ? '#fff' : '#C0C8CF'; X.fillRect(-w / 2, -h / 2, w, h); X.shadowBlur = 0;
  X.fillStyle = '#A09A96'; X.fillRect(-w * .25, h / 2, w * .5, 14); X.fillRect(-w * .38, h / 2 + 14, w * .76, 7);
  X.fillStyle = '#0E0E17'; X.fillRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 26);
  X.font = '10px ' + MONO; X.textAlign = 'left'; X.textBaseline = 'alphabetic'; X.fillStyle = '#1DED83';
  ['> kernel panic', '> legacy=true', '> sys_call 0x1F'].forEach((s, i) => X.fillText(s.slice(0, Math.max(0, Math.floor(t * 8) % 26 - i * 4)), -w / 2 + 16, -h / 2 + 26 + i * 13));
  const ea = aimAt(b, t);
  for (const s of [-1, 1]) { X.fillStyle = '#1DED83'; X.fillRect(s * 22 - 7 + Math.cos(ea) * 4, 12 + Math.sin(ea) * 3, 14, 10); }
  X.fillStyle = 'rgba(0,0,0,.25)'; for (let y = -h / 2 + 10; y < h / 2 - 16; y += 3) X.fillRect(-w / 2 + 10, y, w - 20, 1);
  X.fillStyle = '#C583FF'; X.beginPath(); X.arc(w / 2 - 16, h / 2 - 9, 3, 0, 7); X.fill();
  X.restore();
}
// BLUE SCREEN: a crash window; the QR code is a separate part
function drawBsod(b, t) {
  const w = 300, h = 160, x = b.x - w / 2, y = b.y - h / 2, rb = b.aux > 0;
  X.shadowColor = '#2570D4'; X.shadowBlur = 24; X.fillStyle = b.hit > 0 ? '#64A1FF' : '#1A2A40'; X.fillRect(x, y, w, h); X.shadowBlur = 0;
  X.strokeStyle = b.stn > 0 ? PAL.gold : '#2570D4'; X.lineWidth = 3; X.strokeRect(x, y, w, h);
  txt(':(', x + 20, y + 62, 46, '#fff', 'sans-serif', 'left');
  txt('Your arena ran into a problem', x + 20, y + 96, 12, '#fff', 'sans-serif', 'left');
  txt(rb ? Math.floor(b.aux) + '% rebooting' : b.stn > 0 ? 'REBOOT FAILED' : 'collecting error info', x + 20, y + 118, 12, rb ? PAL.gold : '#78ADFF', 'sans-serif', 'left');
  if (rb) { X.fillStyle = 'rgba(255,255,255,.2)'; X.fillRect(x + 20, y + 132, 140, 8); X.fillStyle = PAL.gold; X.fillRect(x + 20, y + 132, 140 * b.aux / 100, 8); }
}
// INFINITE LOOP: chrome code-serpent. Neon trail, { } vertebrae with a light pulse, skull head, ∞ halo
function drawLoop(b, t) {
  const body = partsOf(b, 'body').sort((p, q) => p.id - q.id), pts = [b, ...body];
  X.lineCap = 'round'; X.lineJoin = 'round';
  [['rgba(29,237,131,.1)', 34], ['rgba(94,246,255,.16)', 20], ['rgba(255,255,255,.22)', 4]].forEach(([c, lw]) => {
    X.strokeStyle = c; X.lineWidth = lw; X.beginPath(); pts.forEach((p, i) => i ? X.lineTo(p.x, p.y) : X.moveTo(p.x, p.y)); X.stroke();
  });
  for (let i = body.length - 1; i >= 0; i--) {
    const p = body[i], q = pts[i], ang = Math.atan2(q.y - p.y, q.x - p.x), wave = Math.sin(t * 8 - i * .5), sz = 13 - i * .18;
    X.save(); X.translate(p.x, p.y); X.rotate(ang);
    X.fillStyle = p.hit > 0 ? '#fff' : '#13141F'; X.strokeStyle = wave > .6 ? '#fff' : '#1DED83'; X.lineWidth = 1.5;
    X.shadowColor = '#1DED83'; X.shadowBlur = wave > .6 ? 18 : 6;
    X.beginPath(); X.moveTo(sz, 0); X.lineTo(0, -sz); X.lineTo(-sz, 0); X.lineTo(0, sz); X.closePath(); X.fill(); X.stroke(); X.shadowBlur = 0;
    X.strokeStyle = 'rgba(94,246,255,.6)'; X.lineWidth = 1; X.beginPath(); X.moveTo(0, -sz); X.lineTo(-5, -sz - 8); X.moveTo(0, sz); X.lineTo(-5, sz + 8); X.stroke();
    X.restore();
    txt(i % 2 ? '{' : '}', p.x, p.y + 1, Math.max(9, sz), wave > .6 ? '#fff' : '#5EF6FF', MONO);
  }
  const ha = Math.atan2(b.vy, b.vx), jaw = .35 + .25 * Math.sin(t * 6);
  X.save(); X.translate(b.x, b.y); X.rotate(ha);
  X.shadowColor = '#1DED83'; X.shadowBlur = 24; X.fillStyle = b.hit > 0 ? '#fff' : '#C0C8CF';
  X.beginPath(); X.moveTo(28, 0); X.lineTo(9, -17); X.lineTo(-15, -13); X.lineTo(-20, 0); X.lineTo(-15, 13); X.lineTo(9, 17); X.closePath(); X.fill(); X.shadowBlur = 0;
  X.fillStyle = '#1DED83';
  for (const s of [-1, 1]) { X.save(); X.rotate(s * jaw); X.beginPath(); X.moveTo(19, s * 7); X.lineTo(44, s * 15); X.lineTo(21, s * 15); X.closePath(); X.fill(); X.restore(); }
  X.fillStyle = '#0E0E17'; X.fillRect(-9, -7, 20, 14);
  X.fillStyle = PAL.red; X.shadowColor = PAL.red; X.shadowBlur = 14; X.beginPath(); X.arc(4, 0, 4.5, 0, 7); X.fill(); X.shadowBlur = 0;
  X.restore();
  X.save(); X.translate(b.x, b.y - 40); X.strokeStyle = PAL.gold; X.lineWidth = 2.5; X.shadowColor = PAL.gold; X.shadowBlur = 14;
  X.beginPath(); for (let s = 0; s <= 6.3; s += .1) { const d = 1 + Math.sin(s + t * 2) ** 2; X.lineTo(18 * Math.cos(s + t * 2) / d, 14 * Math.sin(s + t * 2) * Math.cos(s + t * 2) / d); } X.stroke();
  X.restore();
}
// THE FINAL DEPLOY: armored warhead on a launch gantry, hazard chevrons, red eye, countdown on the hull
function warhead(x, y, s, t, crit, hit, alpha = 1) {
  X.save(); X.translate(x, y); X.scale(s, s); X.globalAlpha = alpha;
  X.shadowColor = PAL.red; X.shadowBlur = crit ? 40 : 22;
  X.fillStyle = hit ? '#fff' : '#13141F';
  X.beginPath(); X.moveTo(0, -118); X.bezierCurveTo(34, -96, 40, -40, 38, 62); X.lineTo(-38, 62); X.bezierCurveTo(-40, -40, -34, -96, 0, -118); X.fill(); X.shadowBlur = 0;
  X.strokeStyle = '#505050'; X.lineWidth = 1.5; for (const yy of [-70, -30, 10, 40]) { X.beginPath(); X.moveTo(-36, yy); X.lineTo(36, yy); X.stroke(); }
  X.fillStyle = PAL.gold; for (let i = -4; i < 4; i++) { X.beginPath(); X.moveTo(i * 10, 46); X.lineTo(i * 10 + 6, 46); X.lineTo(i * 10 + 12, 56); X.lineTo(i * 10 + 6, 56); X.fill(); }
  for (const sd of [-1, 1]) { X.fillStyle = '#161625'; X.beginPath(); X.moveTo(sd * 36, 10); X.lineTo(sd * 70, 70); X.lineTo(sd * 36, 58); X.fill(); X.strokeStyle = PAL.red; X.lineWidth = 1.5; X.stroke(); }
  const v = .5 + .5 * Math.sin(t * (crit ? 14 : 5));
  X.strokeStyle = `rgba(255,62,52,${.4 + .6 * v})`; X.lineWidth = 2; for (const sd of [-1, 1]) { X.beginPath(); X.moveTo(sd * 14, -60); X.lineTo(sd * 22, -20); X.lineTo(sd * 16, 20); X.stroke(); }
  X.fillStyle = PAL.red; X.shadowColor = PAL.red; X.shadowBlur = 26; X.beginPath(); X.ellipse(0, -84, 12, 7 + 3 * v, 0, 0, 7); X.fill();
  X.fillStyle = '#fff'; X.beginPath(); X.arc(Math.sin(t) * 4, -84, 3, 0, 7); X.fill(); X.shadowBlur = 0;
  X.restore();
}
function drawDeploy(b, t) {
  const s = b.r / 52, crit = b.aux < 15, cx = b.x, cy = b.y;
  X.save(); X.translate(cx, cy + 10 * s); X.rotate(t * .6);
  for (let i = 0; i < 24; i++) { X.rotate(6.283 / 24); X.fillStyle = i % 2 ? PAL.gold : '#241210'; X.beginPath(); X.moveTo(118 * s, -8 * s); X.lineTo(132 * s, 0); X.lineTo(118 * s, 8 * s); X.lineTo(124 * s, 0); X.fill(); }
  X.restore();
  for (let i = 0; i < 4; i++) { const yy = cy + 70 * s + ((t * 60 + i * 30) % 60); X.fillStyle = `rgba(117,117,117,${.3 - (yy - cy - 70 * s) / 220})`; X.beginPath(); X.arc(cx + Math.sin(i * 2 + t) * 22, yy, 12 + i * 2, 0, 7); X.fill(); }
  warhead(cx, cy, s, t, crit, b.hit > 0);
  X.fillStyle = '#0E0E17'; X.fillRect(cx - 26, cy - 14 * s - 9, 52, 20);
  txt('T-' + String(Math.max(0, Math.ceil(b.aux))).padStart(2, '0'), cx, cy - 14 * s + 7, 14, crit && Math.floor(t * 6) % 2 ? '#fff' : PAL.red, MONO);
  if (b.stn > 0) txt('ARMOR DOWN', cx, cy + 80 * s, 12, PAL.gold);
}
// boss parts
function drawPart(p, t) {
  const b = parentOf(p), D = BUG[p.type], hit = p.hit > 0;
  if (p.type === 'body') return; // drawn with the Infinite Loop
  if (p.type === 'pillar') {
    if (b) { X.strokeStyle = `rgba(248,106,50,${.4 + .3 * Math.sin(t * 6 + p.slot)})`; X.lineWidth = 2; X.setLineDash([6, 6]); X.beginPath(); X.moveTo(p.x, p.y); X.lineTo(b.x, b.y); X.stroke(); X.setLineDash([]); }
    X.shadowColor = D.col; X.shadowBlur = 14; X.fillStyle = hit ? '#fff' : '#241210'; X.fillRect(p.x - 15, p.y - 20, 30, 40); X.shadowBlur = 0;
    X.strokeStyle = D.col; X.lineWidth = 2; X.strokeRect(p.x - 15, p.y - 20, 30, 40);
    txt('dep', p.x, p.y + 1, 10, D.col, MONO);
    X.fillStyle = 'rgba(0,0,0,.5)'; X.fillRect(p.x - 15, p.y + 24, 30, 4); X.fillStyle = D.col; X.fillRect(p.x - 15, p.y + 24, 30 * clamp(p.hp / p.mhp, 0, 1), 4);
  } else if (p.type === 'qr') {
    const s = 64, x = p.x - s / 2, y = p.y - s / 2, hot = Math.floor(t * 4) % 2;
    X.fillStyle = hit ? PAL.gold : '#fff'; X.fillRect(x, y, s, s); X.fillStyle = '#1A2A40';
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if ((i * 3 + j * 5 + i * j) % 3 === 0) X.fillRect(x + 4 + i * 8.4, y + 4 + j * 8.4, 7, 7);
    X.strokeStyle = hot ? PAL.gold : PAL.red; X.lineWidth = 3; X.strokeRect(x - 5, y - 5, s + 10, s + 10);
    txt('WEAK POINT', p.x, y + s + 18, 10, PAL.gold);
  } else if (p.type === 'arm') {
    if (b) {
      X.lineCap = 'round'; X.strokeStyle = D.col; X.lineWidth = 7; X.shadowColor = PAL.gold; X.shadowBlur = 12; X.beginPath(); X.moveTo(b.x, b.y);
      for (let s = 1; s <= 16; s++) { const f = s / 16; X.lineTo(b.x + (p.x - b.x) * f + Math.sin(s + t * 6 + p.slot) * 8 * (1 - f * .5), b.y + (p.y - b.y) * f + Math.cos(s + t * 5) * 6 * (1 - f * .5)); }
      X.stroke(); X.shadowBlur = 0;
    }
    X.fillStyle = hit ? '#fff' : '#FFD741'; X.beginPath(); X.arc(p.x, p.y, 11, 0, 7); X.fill();
    X.strokeStyle = '#681E1F'; X.lineWidth = 2; X.beginPath(); X.arc(p.x, p.y, 6, t * 4, t * 4 + 4); X.stroke();
  } else if (p.type === 'pod') {
    if (b) { X.strokeStyle = '#505050'; X.lineWidth = 5; X.beginPath(); X.moveTo(b.x + (p.x - b.x) * .35, b.y + (p.y - b.y) * .35); X.lineTo(p.x, p.y); X.stroke(); }
    const tgt = nearest(p, livePlayers());
    if (tgt) { const a = Math.atan2(tgt.y - p.y, tgt.x - p.x); X.strokeStyle = 'rgba(255,62,52,.4)'; X.lineWidth = 1; X.beginPath(); X.moveTo(p.x, p.y); X.lineTo(p.x + Math.cos(a) * 900, p.y + Math.sin(a) * 900); X.stroke(); }
    X.fillStyle = hit ? '#fff' : '#161625'; X.beginPath(); X.arc(p.x, p.y, 14, 0, 7); X.fill();
    X.strokeStyle = PAL.red; X.lineWidth = 2.5; X.shadowColor = PAL.red; X.shadowBlur = 10; X.stroke(); X.shadowBlur = 0;
    txt('CI', p.x, p.y + 1, 9, PAL.red, MONO);
    X.fillStyle = 'rgba(0,0,0,.5)'; X.fillRect(p.x - 14, p.y + 18, 28, 3); X.fillStyle = PAL.red; X.fillRect(p.x - 14, p.y + 18, 28 * clamp(p.hp / p.mhp, 0, 1), 3);
  } else if (p.type === 'holo') {
    const s = (b ? b.r : 46) / 52;
    warhead(p.x + rand(-2, 2), p.y, s, t, false, false, .2 + .15 * Math.random());
    txt('T-' + String(Math.max(0, Math.ceil(b ? b.aux : 60))).padStart(2, '0'), p.x, p.y - 14 * s + 7, 14, 'rgba(255,62,52,.5)', MONO);
  }
}
// ---------- boss deaths: each boss dies its own way, in slow-mo, building to one big finish() ----------
function mkDeath(b, col) { // snapshot what the death animation needs; the boss itself is gone after this frame
  const ai = bossDef(b).ai, d = { ai, x: b.x, y: b.y, col, r: b.r, t: 0, n: 0, done: false };
  if (ai === 'monolith') d.shards = Array.from({ length: 6 }, (_, i) => {
    const a0 = i * 1.047 - Math.PI / 2, a1 = a0 + 1.047, v = [[0, 0], [Math.cos(a0) * b.r, Math.sin(a0) * b.r], [Math.cos(a1) * b.r, Math.sin(a1) * b.r]];
    const cx = (v[1][0] + v[2][0]) / 3, cy = (v[1][1] + v[2][1]) / 3, sp = rand(260, 440), al = Math.atan2(cy, cx);
    return { x: b.x + cx, y: b.y + cy, pts: v.map(([x, y]) => [x - cx, y - cy]), vx: Math.cos(al) * sp, vy: Math.sin(al) * sp, rot: 0, vr: rand(-7, 7) };
  });
  if (ai === 'spaghetti') { d.noodles = Array.from({ length: 16 }, () => ({ x: b.x, y: b.y, a: rand(0, 6.283), v: rand(320, 680), ph: rand(0, 9), len: rand(40, 85) })); d.splats = []; }
  if (ai === 'bsod') {
    d.tiles = [];
    for (let i = 0; i < 10; i++) for (let j = 0; j < 6; j++) {
      const x = b.x - 150 + 15 + i * 30, y = b.y - 80 + 13.3 + j * 26.7;
      d.tiles.push({ x, y, vx: (x - b.x) * rand(2, 4) + rand(-60, 60), vy: (y - b.y) * rand(2, 4) - rand(150, 380), rot: 0, vr: rand(-6, 6), c: pick(['#1A2A40', '#2570D4', '#2570D4', '#1A2A40', '#78ADFF']) });
    }
  }
  if (ai === 'loop') d.segs = [{ x: b.x, y: b.y }, ...partsOf(b, 'body').sort((p, q) => p.id - q.id).map(p => ({ x: p.x, y: p.y, dead: false }))];
  if (ai === 'deploy') { d.ry = b.y; d.vy = 0; }
  return d;
}
function finish(d, x = d.x, y = d.y) { // the kill moment every boss death builds to
  d.done = true; d.ft = d.t; hitstop = .18; flash = 1.1; flashCol = '255,215,65'; chroma = 1.2; glitch = .7; shake = 40; cue('expl_l'); cue('cyberexpl', .7);
  discCells(d.x, d.y, 260, k => cleanCell(k, 1)); // the blast scrubs the rot around it
  for (let i = 0; i < 3; i++) ring(x, y, 10 + i * 30, 700 + i * 320, 1, i % 2 ? PAL.white : d.col, 8 - i * 2);
  setTimeout(() => cue('levelup', .8), 600);
}
function bossDeathTick(dt) {
  for (const d of deaths) {
    const t = d.t += dt, after = d.done ? t - d.ft : 0;
    if (after > 1 && !d.bn) { d.bn = true; banner = { t: 2.4, big: 'BOSS DEFEATED', sub: '+2,000 bounty for every dev' }; } // after the show, not over it
    if (d.ai === 'monolith') { // cracks spread, then the hexagon blows apart into six burning shards
      if (!d.done && Math.random() < .5) { const a = rand(0, 6.283); parts.push({ x: d.x + Math.cos(a) * d.r * .8, y: d.y + Math.sin(a) * d.r * .8, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200, life: .3, max: .3, col: PAL.gold }); shake = Math.max(shake, 6); }
      if (!d.done && t > .55) { finish(d); burst(d.x, d.y, d.col, 60, true, 700); }
      if (d.done) for (const s of d.shards) {
        s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= Math.pow(.25, dt); s.vy *= Math.pow(.25, dt); s.rot += s.vr * dt;
        if (Math.random() < .4 && after < 1.6) parts.push({ x: s.x, y: s.y, vx: rand(-40, 40), vy: rand(-40, 40), life: .5, max: .5, col: pick([d.col, PAL.gold, PAL.red]) });
      }
    } else if (d.ai === 'kernel') { // the CRT powers off: collapse to a line, then a dot
      if (!d.n && t > .35) { d.n = 1; cue('focus_off'); }
      if (!d.done && t > .95) { finish(d); burst(d.x, d.y, '#1DED83', 40, true, 600); burst(d.x, d.y, '#C583FF', 30, true, 500); }
    } else if (d.ai === 'spaghetti') { // it swells, then flings noodles everywhere and splats sauce on the code
      if (!d.done && t > .45) {
        finish(d);
        for (let i = 0; i < 10; i++) { const a = rand(0, 6.283), rr = rand(20, 160); d.splats.push({ x: d.x + Math.cos(a) * rr, y: d.y + Math.sin(a) * rr, r: rand(14, 34), s: rand(0, 9) }); }
      }
      if (d.done) for (const n of d.noodles) {
        n.x += Math.cos(n.a) * n.v * dt; n.y += Math.sin(n.a) * n.v * dt; n.a += Math.sin(t * 6 + n.ph) * dt * 2;
        const v0 = n.v; n.v *= Math.pow(.12, dt);
        if (v0 >= 90 && n.v < 90) d.splats.push({ x: n.x, y: n.y, r: rand(8, 16), s: n.ph });
      }
    } else if (d.ai === 'bsod') { // a reboot that finally succeeds, then the window shatters into pixels
      if (!d.done && Math.floor(t * 12) !== Math.floor((t - dt) * 12)) cue('hover', 2, 1 + t, .02);
      if (!d.done && t > .8) { finish(d); burst(d.x, d.y, '#2570D4', 50, false, 700); }
      if (d.done) for (const p of d.tiles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.rot += p.vr * dt; }
    } else if (d.ai === 'loop') { // the body detonates tail-first, racing up to the head
      const body = d.segs.length - 1;
      while (d.n < body && t > d.n * .07) {
        const s = d.segs[body - d.n]; s.dead = true;
        burst(s.x, s.y, d.n % 2 ? '#fff' : d.col, 10, true, 300); ring(s.x, s.y, 4, 240, .25, d.n % 3 ? d.col : '#5EF6FF', 3);
        cue('weakhit', 1, 1 + d.n * .03, .02); shake = Math.max(shake, 6); d.n++;
      }
      if (!d.done && d.n >= body && t > body * .07 + .15) { finish(d); burst(d.x, d.y, d.col, 60, true, 700); }
    } else if (d.ai === 'deploy') { // it launches anyway... and blows up into fireworks
      if (!d.done) {
        d.vy -= 1500 * dt; d.ry += d.vy * dt;
        for (let i = 0; i < 3; i++) parts.push({ x: d.x + rand(-14, 14), y: d.ry + d.r * 1.3, vx: rand(-80, 80), vy: rand(80, 220), life: .7, max: .7, col: pick(['#757575', '#505050', PAL.rot, PAL.gold]), big: rand(5, 11) });
        if (!d.n) { d.n = 1; cue('launcher', 1.5, .6); }
        if (t > 1) { finish(d, d.x, ARENA.y + 90); d.n = 0; }
      } else while (d.n < 6 && after > d.n * .17) {
        const x = clamp(d.x + rand(-380, 380), ARENA.x + 80, ARENA.x + ARENA.w - 80), y = ARENA.y + rand(70, 300), c = PCOL[(d.n * 3) % PCOL.length];
        burst(x, y, c, 40, false, 420); burst(x, y, '#fff', 10, false, 200); ring(x, y, 4, 380, .5, c, 3); cue('expl_s', .6, rand(.9, 1.2), .05); d.n++;
      }
    }
  }
  deaths = deaths.filter(d => d.t < 3.4 || !d.bn);
}
function drawDeaths(t) {
  for (const d of deaths) {
    const after = d.done ? d.t - d.ft : 0, fade = d.done ? clamp(1 - after / 2.2, 0, 1) : 1;
    X.save();
    if (d.ai === 'monolith') {
      if (!d.done) {
        const k = d.t / .55;
        X.translate(d.x + rand(-3, 3) * k, d.y + rand(-3, 3) * k);
        X.shadowColor = d.col; X.shadowBlur = 40; poly(6, d.r); X.fillStyle = `rgb(${40 + 215 * k | 0},${20 + 200 * k | 0},${14 + 150 * k | 0})`; X.fill();
        X.strokeStyle = d.col; X.lineWidth = 6; X.stroke(); X.shadowBlur = 0;
        X.strokeStyle = '#fff'; X.lineWidth = 2;
        for (let i = 0; i < 8; i++) { const a = i * 2.39; X.beginPath(); X.moveTo(0, 0); X.lineTo(Math.cos(a) * d.r * k * .6 + Math.sin(i) * 8, Math.sin(a) * d.r * k * .6); X.lineTo(Math.cos(a + .2) * d.r * k * 1.05, Math.sin(a + .2) * d.r * k * 1.05); X.stroke(); }
      } else {
        X.globalAlpha = fade;
        for (const s of d.shards) {
          X.save(); X.translate(s.x, s.y); X.rotate(s.rot); X.beginPath(); s.pts.forEach(([x, y], i) => i ? X.lineTo(x, y) : X.moveTo(x, y)); X.closePath();
          X.fillStyle = '#241210'; X.fill(); X.strokeStyle = d.col; X.lineWidth = 3; X.shadowColor = d.col; X.shadowBlur = 16; X.stroke(); X.restore();
        }
        X.translate(d.x, d.y); X.globalAlpha = clamp(1 - after / .9, 0, 1); X.strokeStyle = d.col; X.lineWidth = 8; poly(6, 40 + after * 900); X.stroke();
        X.strokeStyle = '#fff'; X.lineWidth = 3; poly(6, 20 + after * 700); X.stroke();
      }
    } else if (d.ai === 'kernel') {
      const w = d.r * 2.5, h = d.r * 1.9, sw = w - 20, sh = h - 26; X.translate(d.x, d.y);
      if (d.t < .7) { // the case fades while the picture collapses
        X.globalAlpha = clamp(1 - (d.t - .35) / .35, 0, 1); X.fillStyle = '#C0C8CF'; X.fillRect(-w / 2, -h / 2, w, h); X.fillStyle = '#A09A96'; X.fillRect(-w * .25, h / 2, w * .5, 14);
        X.globalAlpha = 1; X.fillStyle = '#0E0E17'; X.fillRect(-sw / 2, -h / 2 + 10, sw, sh);
        const k = clamp((d.t - .35) / .35, 0, 1), hh = Math.max(3, sh * (1 - k) ** 2);
        X.fillStyle = k ? '#EDE7E6' : '#1DED83'; X.shadowColor = '#1DED83'; X.shadowBlur = 30; X.globalAlpha = k ? 1 : .35;
        if (!k) for (let i = 0; i < 40; i++) X.fillRect(-sw / 2 + Math.random() * (sw - 6), -h / 2 + 10 + Math.random() * (sh - 3), rand(2, 10), 2); // static
        else X.fillRect(-sw / 2, -h / 2 + 10 + (sh - hh) / 2, sw, hh);
      } else if (!d.done) { // line shrinks to a dot
        const k = (d.t - .7) / .25, lw = Math.max(4, sw * (1 - k));
        X.fillStyle = '#EDE7E6'; X.shadowColor = '#1DED83'; X.shadowBlur = 30; X.fillRect(-lw / 2, -h / 2 + 10 + sh / 2 - 1.5, lw, 3);
      } else {
        X.globalAlpha = fade; X.fillStyle = '#fff'; X.shadowColor = '#1DED83'; X.shadowBlur = 40; X.beginPath(); X.arc(0, -h / 2 + 10 + sh / 2, 5 * (1 - after / 2.2) + 1, 0, 7); X.fill(); X.shadowBlur = 0;
        const n = after * 34 | 0;
        ['[  OK  ] Stopped Legacy Kernel.', '[  OK  ] Reached target: Power-Off.'].forEach((s, i) => txt(s.slice(0, Math.max(0, n - i * 30)), -150, 60 + i * 18, 13, '#1DED83', MONO, 'left', fade));
      }
    } else if (d.ai === 'spaghetti') {
      for (const s of d.splats || []) { // sauce on the code
        X.globalAlpha = .75 * fade; X.fillStyle = '#AE3B36'; X.beginPath();
        for (let i = 0; i <= 12; i++) { const a = i / 12 * 6.283, rr = s.r * (.7 + .3 * Math.sin(a * 3 + s.s)); X.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr); }
        X.fill(); X.globalAlpha = .5 * fade; X.fillStyle = '#F47949'; X.beginPath(); X.arc(s.x - s.r * .2, s.y - s.r * .2, s.r * .3, 0, 7); X.fill();
      }
      X.globalAlpha = 1; X.lineCap = 'round';
      if (!d.done) {
        const k = d.t / .45; X.translate(d.x, d.y); X.strokeStyle = d.col; X.lineWidth = 5 + 3 * k; X.shadowColor = PAL.red; X.shadowBlur = 20 * k;
        for (let i = 0; i < 9; i++) {
          const a0 = i / 9 * 6.283; X.beginPath();
          for (let s = 0; s <= 10; s++) { const rr = d.r * (.5 + s * .1) * (1 + .5 * k), w = Math.sin(d.t * 30 + i + s * .7) * (.35 + k); X.lineTo(Math.cos(a0 + w) * rr, Math.sin(a0 + w) * rr); }
          X.stroke();
        }
      } else {
        X.globalAlpha = fade; X.strokeStyle = d.col; X.lineWidth = 5; X.shadowColor = PAL.gold; X.shadowBlur = 8;
        for (const n of d.noodles) {
          X.beginPath();
          for (let s = 0; s <= 8; s++) { const f = s / 8, bx = n.x - Math.cos(n.a) * n.len * f, by = n.y - Math.sin(n.a) * n.len * f, w = Math.sin(f * 9 + t * 10 + n.ph) * 6; X.lineTo(bx - Math.sin(n.a) * w, by + Math.cos(n.a) * w); }
          X.stroke();
        }
      }
    } else if (d.ai === 'bsod') {
      if (!d.done) {
        const w = 300, h = 160, x = d.x - w / 2, y = d.y - h / 2, pct = Math.min(100, d.t / .8 * 100 | 0);
        X.shadowColor = '#2570D4'; X.shadowBlur = 30; X.fillStyle = Math.random() < .15 ? '#64A1FF' : '#1A2A40'; X.fillRect(x, y, w, h); X.shadowBlur = 0;
        txt(':|', x + 20, y + 62, 46, '#fff', 'sans-serif', 'left'); txt(pct + '% rebooting', x + 20, y + 118, 12, PAL.gold, 'sans-serif', 'left');
        X.fillStyle = 'rgba(255,255,255,.2)'; X.fillRect(x + 20, y + 132, 260, 8); X.fillStyle = PAL.gold; X.fillRect(x + 20, y + 132, 2.6 * pct, 8);
      } else {
        X.globalAlpha = fade;
        for (const p of d.tiles) { X.save(); X.translate(p.x, p.y); X.rotate(p.rot); X.fillStyle = p.c; X.fillRect(-15, -13, 30, 26); X.strokeStyle = '#2570D4'; X.lineWidth = 1; X.strokeRect(-15, -13, 30, 26); X.restore(); }
        const k = clamp(after / .25, 0, 1); X.globalAlpha = Math.min(k, fade);
        txt(':)', d.x, d.y + 30, 90 + 30 * (1 - k), '#fff', 'sans-serif'); txt('restart successful', d.x, d.y + 64, 14, '#78ADFF', 'sans-serif');
      }
    } else if (d.ai === 'loop') {
      X.lineCap = 'round';
      const live = d.segs.filter((s, i) => i === 0 || !s.dead);
      if (!d.done) {
        X.strokeStyle = 'rgba(29,237,131,.25)'; X.lineWidth = 16; X.beginPath(); live.forEach((s, i) => i ? X.lineTo(s.x, s.y) : X.moveTo(s.x, s.y)); X.stroke();
        const heat = d.n / Math.max(1, d.segs.length - 1);
        for (const s of live) { X.save(); X.translate(s.x + rand(-2, 2), s.y + rand(-2, 2)); X.rotate(.785); X.fillStyle = `rgb(${93 + 162 * heat | 0},255,${168 + 87 * heat | 0})`; X.shadowColor = d.col; X.shadowBlur = 20; X.fillRect(-9, -9, 18, 18); X.restore(); }
      } else { // the ∞ snaps in two and the halves spin away
        X.globalAlpha = fade; X.strokeStyle = PAL.gold; X.lineWidth = 4; X.shadowColor = PAL.gold; X.shadowBlur = 18;
        for (const s of [-1, 1]) { X.save(); X.translate(d.x + s * (20 + after * 260), d.y - 30 - after * 40); X.rotate(s * after * 5); X.beginPath(); X.ellipse(0, 0, 22, 14, 0, s > 0 ? -1.2 : 1.9, s > 0 ? 4.3 : 7.5); X.stroke(); X.restore(); }
      }
    } else if (d.ai === 'deploy') {
      if (!d.done) {
        const s = d.r / 52, fl = 40 + Math.random() * 40;
        X.fillStyle = PAL.gold; X.shadowColor = PAL.rot; X.shadowBlur = 30;
        X.beginPath(); X.moveTo(d.x - 18 * s, d.ry + 62 * s); X.lineTo(d.x, d.ry + (62 + fl) * s); X.lineTo(d.x + 18 * s, d.ry + 62 * s); X.fill(); X.shadowBlur = 0;
        warhead(d.x + rand(-2, 2), d.ry, s, t, true, false);
      } else txt('DEPLOYED TO /dev/null', ARENA.x + ARENA.w / 2, ARENA.y + 470, 26, PAL.red, DISP, 'center', Math.min(1, after * 3) * fade);
    }
    X.restore(); X.globalAlpha = 1; X.shadowBlur = 0;
  }
}
function drawShot(s, t) {
  X.save(); X.translate(s.x, s.y);
  if (s.k === 'ad') {
    X.rotate(t * 6); X.shadowColor = BUG.adware.col; X.shadowBlur = 16;
    X.fillStyle = '#31181E'; X.fillRect(-9, -7, 18, 14); X.fillStyle = BUG.adware.col; X.fillRect(-9, -7, 18, 4);
    X.strokeStyle = BUG.adware.col; X.lineWidth = 2; X.strokeRect(-9, -7, 18, 14);
  } else {
    X.shadowColor = PAL.red; X.shadowBlur = 18; X.fillStyle = PAL.red; X.beginPath(); X.arc(0, 0, 8, 0, 7); X.fill();
    X.fillStyle = '#fff'; X.beginPath(); X.arc(0, 0, 3.5, 0, 7); X.fill();
  }
  X.restore();
}

// ---------- players ----------
function drawDuck(x, y, t) {
  X.save(); X.translate(x, y + Math.sin(t * 6) * 3);
  X.shadowColor = '#FFD741'; X.shadowBlur = 14; X.fillStyle = '#FFD741';
  X.beginPath(); X.ellipse(0, 4, 13, 9, 0, 0, 7); X.fill(); X.beginPath(); X.arc(7, -6, 7, 0, 7); X.fill();
  X.shadowBlur = 0; X.fillStyle = '#EFA248'; X.beginPath(); X.moveTo(13, -6); X.lineTo(20, -4); X.lineTo(13, -2); X.fill();
  X.fillStyle = '#000000'; X.beginPath(); X.arc(9, -8, 1.6, 0, 7); X.fill();
  X.restore();
}
function drawTurret(x, y, t, col = '#1DED83') {
  X.save(); X.translate(x, y);
  X.fillStyle = 'rgba(29,237,131,.15)'; X.beginPath(); X.arc(0, 0, 18, 0, 7); X.fill();
  X.strokeStyle = col; X.lineWidth = 2; X.shadowColor = col; X.shadowBlur = 14; X.strokeRect(-9, -9, 18, 18);
  X.rotate(t * 4); X.fillStyle = col; X.fillRect(-2, -16, 4, 12); X.restore();
}
function drawAltMarks(t) { // your own alt-ability markers: watched / routed bug, backdoor, rewind ghost, tech debt
  const col = PCOL[myColor];
  for (const [m, c] of [[me.watch, PAL.ice], [me.route, col]]) {
    const b = m && m.t > T && world.bugs.find(x => x.id === m.id && !x.dead); if (!b) continue;
    X.save(); X.translate(b.x, b.y); X.rotate(t * 2); X.strokeStyle = c; X.lineWidth = 2; X.shadowColor = c; X.shadowBlur = 10;
    for (let i = 0; i < 4; i++) { X.rotate(Math.PI / 2); X.beginPath(); X.moveTo(b.r + 6, 0); X.lineTo(b.r + 16, 0); X.stroke(); }
    X.beginPath(); X.arc(0, 0, b.r + 10, 0, 7); X.stroke(); X.restore();
  }
  if (me.door && me.door.t > T) {
    const d = me.door; X.save(); X.translate(d.x, d.y); X.rotate(t * 3); X.strokeStyle = col; X.lineWidth = 2; X.shadowColor = col; X.shadowBlur = 12;
    X.strokeRect(-10, -10, 20, 20); X.restore(); txt(Math.ceil(d.t - T) + 's', d.x, d.y + 28, 10, col, DISP);
    X.globalAlpha = .25; X.strokeStyle = col; X.setLineDash([4, 6]); X.beginPath(); X.moveTo(me.x, me.y); X.lineTo(d.x, d.y); X.stroke(); X.setLineDash([]); X.globalAlpha = 1;
  }
  if (me.ab.sup === 'rewind' && me.sup >= 100 && me.hist[0]) { // where REWIND would take you
    const h = me.hist[0]; X.globalAlpha = .35 + .15 * Math.sin(t * 6); X.strokeStyle = PAL.ice; X.lineWidth = 2;
    X.beginPath(); X.arc(h.x, h.y, 16, 0, 7); X.stroke(); X.globalAlpha = 1;
  }
  if (me.superT > 0 && me.supK === 'debt') txt('DEBT x' + me.debt, me.x, me.y - 34, 12, PAL.rot, DISP);
}
function drawPlayer(p, t) {
  X.globalCompositeOperation = 'lighter'; X.fillStyle = p.col;
  if (p.skin === 'binary') { X.font = '14px ' + MONO; X.textAlign = 'center'; }
  if (!p.cm) p.trail.forEach((q, i) => {
    const f = i / p.trail.length;
    if (p.skin === 'rainbow') X.fillStyle = `hsl(${(t * 240 + i * 25) % 360},100%,60%)`;
    if (p.skin === 'binary') { X.globalAlpha = f * .7; X.fillText((i + (t * 10 | 0)) % 2 ? '1' : '0', q.x, q.y); return; }
    X.globalAlpha = f * (p.skin === 'rainbow' ? .45 : .22); X.beginPath(); X.arc(q.x, q.y, 11 * f, 0, 7); X.fill();
  });
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  if (p.bz && !p.down) { // BERSERK.SYS: hostile-red pressure ring
    X.save(); X.translate(p.x, p.y); X.rotate(t * 3); X.strokeStyle = PAL.rot; X.lineWidth = 2; X.shadowColor = PAL.rot; X.shadowBlur = 14 * scale;
    X.beginPath(); for (let i = 0; i <= 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 24 : 30; X.lineTo(Math.cos(a) * r, Math.sin(a) * r); } X.stroke(); X.restore();
  }
  if (p.skin === 'halo' && !p.down) {
    X.save(); X.translate(p.x, p.y); X.rotate(-t * 2); X.strokeStyle = p.col; X.lineWidth = 2; X.shadowColor = p.col; X.shadowBlur = 12;
    X.setLineDash([3, 7]); X.beginPath(); X.arc(0, 0, 21, 0, 7); X.stroke(); X.setLineDash([]); X.restore();
  }
  for (const tu of p.tu || []) drawTurret(tu[0], tu[1], t);
  for (const [bx, by] of p.bc || []) { // HEALTH CHECK beacon
    X.globalAlpha = .12 + .06 * Math.sin(t * 4); X.fillStyle = '#1DED83'; X.beginPath(); X.arc(bx, by, 120, 0, 7); X.fill();
    X.globalAlpha = .6; X.strokeStyle = '#1DED83'; X.lineWidth = 2; X.setLineDash([6, 8]); X.beginPath(); X.arc(bx, by, 120, t, t + 6.283); X.stroke(); X.setLineDash([]);
    X.globalAlpha = 1; X.fillStyle = '#1DED83'; X.fillRect(bx - 3, by - 10, 6, 20); X.fillRect(bx - 10, by - 3, 20, 6);
  }
  for (const [mx, my] of p.mi || []) { // DEVOPS containers
    X.save(); X.translate(mx, my); X.rotate(Math.sin(t * 5 + mx) * .3);
    X.fillStyle = 'rgba(14,14,23,.8)'; X.fillRect(-8, -8, 16, 16); X.strokeStyle = p.col; X.lineWidth = 2; X.shadowColor = p.col; X.shadowBlur = 10; X.strokeRect(-8, -8, 16, 16);
    X.fillStyle = p.col; X.fillRect(-4, -2, 8, 4); X.restore();
  }
  if (p.down) {
    X.strokeStyle = 'rgba(255,255,255,.25)'; X.lineWidth = 4; X.beginPath(); X.arc(p.x, p.y, 26, 0, 7); X.stroke();
    if (p.rev) { X.strokeStyle = p.col; X.beginPath(); X.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + p.rev / 2 * 6.283); X.stroke(); }
    txt('✕', p.x, p.y + 1, 22, '#A09A96');
    txt(online() ? 'STAND HERE TO REVIVE' : 'DOWN', p.x, p.y + 44, 10, p.col, DISP, 'center', .6 + .4 * Math.sin(t * 6));
    txt(p.name, p.x, p.y - 34, 11, p.col);
    return;
  }
  for (let i = 0; i < p.orbit; i++) {
    const a = t * 3 + i * 6.283 / p.orbit, dx = p.x + Math.cos(a) * 58, dy = p.y + Math.sin(a) * 58;
    X.save(); X.translate(dx, dy); X.rotate(t * 8); X.shadowColor = p.col; X.shadowBlur = 14; X.fillStyle = p.col; X.fillRect(-6, -6, 12, 12); X.restore();
  }
  if (p.duck) drawDuck(p.x - 34, p.y - 34, t);
  if (p.fw) {
    X.save(); X.translate(p.x, p.y); X.rotate(t); X.strokeStyle = '#64A1FF'; X.lineWidth = 3; X.shadowColor = '#64A1FF'; X.shadowBlur = 16;
    X.beginPath(); for (let i = 0; i <= 6; i++) { const a = i * Math.PI / 3; X.lineTo(Math.cos(a) * 32, Math.sin(a) * 32); } X.stroke(); X.restore();
  }
  const blink = p.inv > 0 && Math.floor(t * 20) % 2;
  X.save(); X.translate(p.x, p.y); X.globalAlpha = (blink ? .35 : 1) * (p.cm ? (p.isMe ? .28 : .12) + .08 * Math.sin(t * 40) : 1); // OPTICAL CAMO shimmer
  if (p.sudo) { X.strokeStyle = PAL.gold; X.lineWidth = 2; X.setLineDash([6, 6]); X.lineDashOffset = -t * 40; X.beginPath(); X.arc(0, 0, 25, 0, 7); X.stroke(); X.setLineDash([]); }
  X.rotate(p.a);
  X.shadowColor = p.col; X.shadowBlur = 26; X.fillStyle = p.col;
  X.beginPath(); for (const [px, py] of SHAPES[p.shape] || SHAPES.pulse) X.lineTo(px, py); X.closePath(); X.fill();
  if (p.skin === 'gold') { // gold rim with a moving glint
    const g = X.createLinearGradient(-20, -14, 24, 14), s = (t * .6) % 1;
    g.addColorStop(0, PAL.gold); g.addColorStop(s, '#fff'); g.addColorStop(Math.min(1, s + .15), PAL.gold); g.addColorStop(1, '#A17E33');
    X.strokeStyle = g; X.lineWidth = 3; X.shadowColor = PAL.gold; X.stroke();
  }
  X.shadowBlur = 0; X.fillStyle = '#fff'; X.beginPath(); X.moveTo(11, 0); X.lineTo(-3, -5); X.lineTo(-3, 5); X.fill();
  X.restore();
  txt(p.name, p.x, p.y - 32, 11, p.col, DISP, 'center', p.cm ? .3 : p.isMe ? 1 : .85);
  const n = Math.min(10, p.mh), pw = n * 8;
  for (let i = 0; i < n; i++) { X.fillStyle = i < p.hp ? p.col : 'rgba(255,255,255,.15)'; X.fillRect(p.x - pw / 2 + i * 8, p.y + 24, 6, 4); }
}

function drawWorld(t) {
  drawGrid(t);
  for (const w of world.pows) { if (w.taken || !inView(w.x, w.y, 60) || (w.t < 3 && Math.floor(t * 8) % 2)) continue; const P = POW[w.type]; drawLoot(w.x, w.y, P.col, P.label, P.tip, t); }
  for (const b of world.bugs) if (!b.dead && (inView(b.x, b.y, b.r + 120) || b.type === 'boss')) drawBug(b, t);
  for (const s of world.shots) if (!s.hit) drawShot(s, t);
  drawDeaths(t);
  X.globalCompositeOperation = 'lighter'; X.lineCap = 'round';
  for (const s of bullets) { // glow pass, colored streak, then a white-hot core
    const tl = s.rail ? .055 : .032, x0 = s.x - s.vx * tl, y0 = s.y - s.vy * tl, a = s.mine ? 1 : .6;
    X.strokeStyle = s.col; X.globalAlpha = .18 * a; X.lineWidth = s.rail ? 18 : 12;
    X.beginPath(); X.moveTo(x0, y0); X.lineTo(s.x, s.y); X.stroke();
    X.globalAlpha = a; X.lineWidth = s.rail ? 6 : 4; X.stroke();
    X.strokeStyle = '#fff'; X.lineWidth = s.rail ? 2.5 : 1.5;
    X.beginPath(); X.moveTo(s.x - s.vx * tl * .45, s.y - s.vy * tl * .45); X.lineTo(s.x, s.y); X.stroke();
    X.fillStyle = '#fff'; X.beginPath(); X.arc(s.x, s.y, s.rail ? 3.5 : 2.5, 0, 7); X.fill();
  }
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  for (const o of others.values()) { // their Sandevistan leaves the same afterimages
    o.gh = (o.gh || []).filter(g => T - g.t < .5);
    if (CW[o.ov] && CW[o.ov].dil && !o.d && (!o.gh.length || T - o.gh[o.gh.length - 1].t > .035)) o.gh.push({ x: o.x, y: o.y, a: o.a, t: T });
    if (o.gh.length) drawGhosts(o.gh, WEAPONS[o.wp].shape);
  }
  if (world.run && ghosts.length) drawGhosts(ghosts, WEAPONS[me.wp].shape);
  if (world.run) drawWire();
  for (const o of others.values()) drawPlayer({ x: o.x, y: o.y, a: o.a, col: o.col, name: o.n, shape: WEAPONS[o.wp].shape, hp: o.hp, mh: o.mh, down: o.d, rev: 0, inv: 0, orbit: o.o,
    duck: o.dk, fw: o.fw, sudo: o.sh > WEAPONS[o.wp].shots + 1, trail: o.trail, tu: o.tu, mi: o.mi, bc: o.bc, skin: o.sk, cm: o.cm, bz: o.ov === 'berserk' }, t);
  if (world.run) drawPlayer({ x: me.x, y: me.y, a: me.a, col: PCOL[myColor], name: nick, shape: WEAPONS[me.wp].shape, hp: me.hp, mh: me.mh, down: me.down, rev: me.rev, inv: me.inv,
    orbit: me.up.orbit, duck: me.pw.duck > 0, fw: me.pw.firewall > 0, sudo: me.pw.sudo > 0, trail: me.trail, tu: turrets.map(t2 => [t2.x, t2.y]), mi: minions.map(n => [n.x, n.y]), bc: beacons.map(b => [b.x, b.y]), isMe: true, skin: mySkin, cm: cwOn('camo'), bz: cwOn('berserk') }, t);
  if (world.run && !me.down) drawAltMarks(t);
  if (mode === 'game' && world.run) drawCyberFx(t);
  X.globalCompositeOperation = 'lighter';
  X.font = '18px ' + MONO; X.textAlign = 'center';
  for (const q of parts) {
    X.globalAlpha = q.life / q.max; X.fillStyle = q.col;
    if (q.ch) X.fillText(q.ch, q.x, q.y); else if (q.big) { X.beginPath(); X.arc(q.x, q.y, q.big, 0, 7); X.fill(); } else X.fillRect(q.x - 2, q.y - 2, 4, 4);
  }
  for (const r of rings) { X.globalAlpha = Math.max(0, r.life / r.max); X.strokeStyle = r.col; X.lineWidth = r.w; X.beginPath(); X.arc(r.x, r.y, Math.max(0, r.r), 0, 7); X.stroke(); }
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  for (const q of pops) txt(q.text, q.x, q.y, q.size, q.col, DISP, 'center', Math.min(1, q.life * 2));
}
function wrapText(s, max) {
  const out = []; let line = '';
  for (const w of s.split(' ')) { if ((line + ' ' + w).trim().length > max && line) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); }
  return [...out, line];
}
function drawPopup(s, t) { // a fake window: flashing border, real X (sometimes on the left), maybe-trap button
  const age = T - s.born, popIn = Math.min(1, age * 6), a = clamp(s.life, 0, 1);
  const w = s.w * (.6 + .4 * popIn), h = s.h * (.6 + .4 * popIn), x = s.x - w / 2 + (age < .4 ? Math.sin(age * 80) * 4 : 0), y = s.y - h / 2;
  const hot = Math.floor(t * 4 + s.born) % 2 ? BUG.adware.col : PAL.gold;
  X.globalAlpha = a;
  X.shadowColor = hot; X.shadowBlur = 20; X.fillStyle = '#31181E'; X.fillRect(x, y, w, h); X.shadowBlur = 0;
  X.fillStyle = hot; X.fillRect(x, y, w, 24);
  X.strokeStyle = hot; X.lineWidth = 3; X.strokeRect(x, y, w, h);
  txt('⚠ ' + (s.trap ? 'IMPORTANT' : 'ALERT'), x + (s.left ? 34 : 10), y + 17, 11, '#31181E', DISP, 'left', a);
  const xb = { x: s.left ? x + 6 : x + w - 22, y: y + 5, w: 16, h: 15 };
  X.globalAlpha = a; X.fillStyle = '#31181E'; X.fillRect(xb.x, xb.y, xb.w, xb.h);
  txt('x', xb.x + 8, xb.y + 12, 11, hot, DISP, 'center', a);
  const lines = wrapText(s.text, Math.floor((w - 30) / 10));
  lines.slice(0, 2).forEach((l, i) => txt(l, s.x, y + 54 + i * 20 - (lines.length > 1 ? 4 : 0), 14, PAL.white, DISP, 'center', a));
  const ob = { x: s.x - 55, y: y + h - 34, w: 110, h: 24 };
  X.globalAlpha = a; X.fillStyle = hot; X.fillRect(ob.x, ob.y, ob.w, ob.h);
  txt(s.ok, s.x, ob.y + 17, 11, '#31181E', DISP, 'center', a);
  X.globalAlpha = 1;
  if (world.phase !== 'play' || paused || popIn < 1) return;
  const pad = 6; // forgiving hit areas so the X is clickable while drifting
  uiButtons.push({ x: xb.x - pad, y: xb.y - pad, w: xb.w + pad * 2, h: xb.h + pad * 2, fn: () => closePopup(s) });
  uiButtons.push({ ...ob, fn: () => closePopup(s, s.trap ? 'trap' : null) });
  if (!touchMode) uiButtons.push({ x, y, w, h, fn: () => cue('buyfail', .5) }); // clicking the body just eats your shot
}
function drawSmudges(t) { // ADWARE gunk: rot splats and fake popups covering the screen
  for (const s of smudges) {
    if (s.popup) { drawPopup(s, t); continue; }
    const a = clamp(s.life / 1.5, 0, 1) * .93;
    X.globalAlpha = a;
    {
      X.fillStyle = '#31181E';
      X.beginPath();
      for (let i = 0; i <= 20; i++) { const aa = i / 20 * 6.283, rr = s.r * (.75 + .25 * Math.sin(aa * 5 + s.seed)); X.lineTo(s.x + Math.cos(aa) * rr, s.y + Math.sin(aa) * rr); }
      X.fill();
      X.fillStyle = '#F86A32';
      for (let i = 0; i < 5; i++) { const dx = s.x + Math.sin(s.seed + i * 2.1) * s.r * .6, len = 20 + (i * 13 + s.seed * 7) % 40; X.fillRect(dx - 3, s.y + s.r * .5, 6, len * (1 - s.life / s.max + .3)); }
      X.font = '22px ' + MONO; X.textAlign = 'center';
      for (let i = 0; i < 6; i++) X.fillText(GL[(i + (s.seed | 0) + (t * 4 | 0)) % GL.length], s.x + Math.cos(i + s.seed) * s.r * .4, s.y + Math.sin(i * 1.7 + s.seed) * s.r * .4);
    }
  }
  X.globalAlpha = 1;
}

// ---------- HUD (theme hud: transparent, red default ink, cyan for yours, amber for goals) ----------
let hpGhost = 3, hpSeen = 3, hpHold = 0, bossGhost = 1, bossSeen = 1, bossHold = 0;
function ghostOf(v, seen, ghost, hold) { // damage ghost: holds for 400ms (motion.damageGhostDelay), then drains over ~250ms
  if (v < seen) hold = T + .4; if (v > ghost) ghost = v;
  if (T > hold) ghost = Math.max(v, ghost - (ghost - v) * .25 - .002);
  return [v, ghost, hold];
}
// RAM modules: a row of small upright cells, full ones lit, the recharging one filling from the bottom
function cells(x, y, n, have, col, w = 8, h = 14, gap = 3, sk = 2) {
  for (let i = 0; i < n; i++) {
    const cx = x + i * (w + gap), f = clamp(have - i, 0, 1);
    X.fillStyle = hexA(col, .14); para(cx, y, w, h, sk); X.fill();
    if (f > 0) { X.fillStyle = f >= 1 ? col : hexA(col, .55); para(cx, y + h * (1 - f), w, h * f, sk * f); X.fill(); }
  }
  return n * (w + gap);
}
function drawHUD(t) {
  const col = PCOL[myColor], x0 = 27, y0 = 20, os = osDef(), dk = deck();
  [hpSeen, hpGhost, hpHold] = ghostOf(me.hp, hpSeen, hpGhost, hpHold);
  // ---- top-left vitals: wave box, name, skewed HP bar, netdeck RAM modules ----
  plate(x0, y0, 36, 36, 'rgba(14,14,23,.75)', PAL.cyan, 6);
  txt(String(world.wave).padStart(2, '0'), x0 + 18, y0 + 25, 21, PAL.cyan);
  txt('WAVE', x0 + 18, y0 + 48, 8, PAL.cyan, DISP, 'center', .7);
  const bx = x0 + 46, low = me.hp === 1 && me.mh > 1;
  txt(nick, bx, y0 + 9, 12, col, DISP, 'left');
  txt('LV ' + me.lv + ' · ' + WEAPONS[me.wp].name + (me.mk > 1 ? ' MK.' + me.mk : ''), bx + tw(nick, 12) + 8, y0 + 9, 10, PAL.label, DISP, 'left');
  bar(bx, y0 + 14, 190, 11, me.down ? 0 : me.hp / me.mh, low && Math.floor(t * 4) % 2 ? PAL.rot : PAL.red, me.mh, hpGhost / me.mh);
  txt(String(Math.max(0, me.hp)), bx + 206, y0 + 26, 19, PAL.red, DISP, 'left');
  txt('/' + me.mh, bx + 206 + tw(String(Math.max(0, me.hp)), 19) + 2, y0 + 26, 11, PAL.label, DISP, 'left');
  if (dk) cells(bx, y0 + 30, ramMax(), me.ram, PAL.cyan);
  txt('SCORE', x0, y0 + 70, 10, PAL.label, DISP, 'left');
  txt(fmt(me.score), x0 + 38, y0 + 71, 17, PAL.white, DISP, 'left');
  if (!adminMode) { // this run's earnings: bytes + a slim bar of XP toward your next level
    const cx2 = x0 + 46 + Math.max(110, tw(fmt(me.score), 17)), L = lvInfo();
    txt('¤ ' + fmt(runBytes), cx2, y0 + 71, 14, PAL.gold, DISP, 'left');
    if (L.need) { X.fillStyle = hexA(PAL.gold, .15); X.fillRect(cx2, y0 + 75, 80, 2); X.fillStyle = PAL.gold; X.fillRect(cx2, y0 + 75, 80 * L.into / L.need, 2); }
  }
  let cx = x0; const chipsY = y0 + 80;
  const chip = (s, c) => { const w = tw(s, 10) + 12; plate(cx, chipsY, w, 15, hexA(c, .12), hexA(c, .6), 4); txt(s, cx + 6, chipsY + 11, 10, c, DISP, 'left'); cx += w + 4; };
  if (me.chain >= 5) chip('x' + (1 + Math.floor(me.chain / 5)) + ' COMBO', PAL.gold);
  for (const k of ['sudo', 'coffee', 'firewall', 'duck']) if (me.pw[k] > 0) chip(POW[k].label + ' ' + Math.ceil(me.pw[k]), POW[k].col);
  if (me.stress > 0) chip('STRESS ' + Math.ceil(me.stress), PAL.gold);
  if (me.down) chip('DOWN · WAITING FOR A REVIVE', PAL.rot);
  // ---- top-right: rot monitor (the minimap slot) + status plate + objectives ----
  const mw = 176, mh = 104, mx = W - 27 - mw, my = y0, cs = Math.min(5, 160 / COLS, 90 / ROWS);
  plate(mx, my, mw, mh, 'rgba(14,14,23,.7)', 'rgba(255,97,89,.5)', 10);
  const gx = mx + (mw - COLS * cs) / 2, gy = my + (mh - ROWS * cs) / 2;
  for (let k = 0; k < NC; k++) { const v = rot[k]; X.fillStyle = v > .04 ? `rgba(255,62,52,${.25 + v * .75})` : 'rgba(52,145,151,.16)'; X.fillRect(gx + (k % COLS) * cs, gy + (k / COLS | 0) * cs, cs - 1, cs - 1); }
  for (const b of world.bugs) if (!b.dead && !BUG[b.type].part) { X.fillStyle = b.type === 'boss' ? PAL.rot : PAL.red; const s = b.type === 'boss' ? 5 : 2; X.fillRect(gx + b.x / CELL * cs - s / 2, gy + b.y / CELL * cs - s / 2, s, s); }
  for (const o of others.values()) { X.fillStyle = o.col; X.fillRect(gx + o.x / CELL * cs - 2, gy + o.y / CELL * cs - 2, 4, 4); }
  for (const w of world.pows) if (w.type === 'stash' && !w.taken) { X.fillStyle = PAL.gold; X.fillRect(gx + w.x / CELL * cs - 2, gy + w.y / CELL * cs - 2, 4, 4); }
  X.strokeStyle = hexA(PAL.cyan, .6); X.lineWidth = 1; X.strokeRect(gx + cam.x / CELL * cs + .5, gy + cam.y / CELL * cs + .5, W / CELL * cs, H / CELL * cs); // what you can see
  X.fillStyle = PAL.cyan; X.fillRect(gx + me.x / CELL * cs - 2, gy + me.y / CELL * cs - 2, 4, 4);
  const pct = Math.min(1, rotFrac / ROT_LIMIT), danger = pct > .75, state = danger ? 'CRITICAL' : pct > .45 ? 'SPREADING' : 'CONTAINED';
  const solid = danger ? Math.floor(t * 4) % 2 === 0 : pct > .45;
  plate(mx, my + mh + 3, mw, 17, solid ? PAL.rot : 'rgba(104,30,31,.55)', null, 6);
  txt(state, mx + mw / 2, my + mh + 16, 12, solid ? '#000000' : PAL.red, DISP, 'center', 1, !solid);
  txt('ROT ' + Math.round(pct * 100) + '%', mx, my + mh + 34, 11, danger ? PAL.rot : PAL.red, DISP, 'left');
  txt(dif().name, mx + mw, my + mh + 34, 11, dif().col, DISP, 'right');
  if (danger) { X.strokeStyle = `rgba(255,62,52,${.3 + .3 * Math.sin(t * 8)})`; X.lineWidth = 6; X.strokeRect(3, 3, W - 6, H - 6); }
  const boss = bossAlive();
  let oy = my + mh + 58; const ox = mx;
  const obj = (head, line, c) => {
    txt(head, ox, oy, 13, PAL.red, DISP, 'left');
    plate(ox, oy + 6, 12, 12, null, c, 3); txt('!', ox + 6, oy + 16, 10, c);
    for (const l of wrapText(line, 34).slice(0, 2)) { txt(l, ox + 18, oy + 16, 11, c, DISP, 'left'); oy += 14; }
    oy += 14;
  };
  if (boss) obj('BOSS · ' + (BOSSES[boss.kind] || BOSSES[0]).name, bossStatus(boss)[0].toLowerCase(), PAL.cyan);
  else obj('WAVE ' + world.wave, world.breakT ? 'wave clear · next wave incoming' : 'purge the bugs · ' + (world.bugs.filter(b => !b.dead).length + world.queue.length) + ' left', PAL.gold);
  if (world.autoskip && !boss && !world.breakT) obj('WAVE SKIP', 'next wave starts when spawning ends', PAL.gold);
  if (online()) {
    txt('ROOM ' + roomCode + ' · ' + (1 + others.size) + ' DEV' + (others.size ? 'S' : '') + (isHost ? ' · HOST' : ''), ox, oy, 11, PAL.red, DISP, 'left');
    if (!isHost && myPing) txt(Math.round(myPing) + 'ms', ox + mw, oy, 10, pingCol(myPing), MONO, 'right');
    const list = [{ n: nick, s: me.score, col, d: me.down, me: 1 }, ...[...others.values()].map(o => ({ n: o.n, s: o.s, col: o.col, d: o.d, ping: o.ping }))].sort((a, b) => b.s - a.s);
    list.slice(0, 8).forEach((p, i) => {
      const y = oy + 16 + i * 15;
      txt((i + 1) + '. ' + p.n + (p.d ? ' (down)' : ''), ox, y, 11, p.col, DISP, 'left', p.me ? 1 : .85);
      txt(fmt(p.s), ox + mw, y, 11, PAL.white, DISP, 'right', .85);
      if (isHost && p.ping) txt(Math.round(p.ping) + 'ms', ox - 6, y, 9, pingCol(p.ping), MONO, 'right', .8);
    });
  } else txt('BEST ' + fmt(best) + ' · ESC PAUSE', ox, oy, 10, PAL.label, DISP, 'left', .8);
  // ---- top-centre: boss bar ----
  let topY = 26;
  if (boss) {
    [bossSeen, bossGhost, bossHold] = ghostOf(boss.hp / boss.mhp, bossSeen, bossGhost, bossHold);
    const B = BOSSES[boss.kind] || BOSSES[0], bw = 520, x = W / 2 - bw / 2;
    txt(B.name, W / 2, 28, 15, PAL.rot);
    plate(x - 14, 38, 10, 10, null, PAL.rot, 3); plate(x + bw + 8, 38, 10, 10, null, PAL.rot, 3);
    bar(x, 37, bw, 12, boss.hp / boss.mhp, boss.hp < boss.mhp * .4 && Math.floor(t * 6) % 2 ? PAL.red : PAL.rot, 10, bossGhost);
    const st = bossStatus(boss); txt(st[0], W / 2, 66, 12, st[1]);
    topY = 92;
  }
  const sandyBy = !(dil > 0) && [...others.values()].find(o => !o.d && CW[o.ov] && CW[o.ov].dil);
  if (sandyBy) txt('TIME DILATION · ' + sandyBy.n, W / 2, topY, 12, PAL.cyan);
  // ---- bottom-left: quick slots (skill, dash, kernel implant). Fill = what's left, from the bottom ----
  const skMax = skillCdBase() * Math.pow(.8, me.up.skill) * (1 - cwMod('skill'));
  const slots = [
    { key: 'E', glyph: skillName().split(' ').map(w => w[0]).join('').slice(0, 2), name: skillName(), ready: me.skillCd <= 0, fill: me.skillCd > 0 ? 1 - me.skillCd / skMax : 0, num: me.skillCd > 0 ? Math.ceil(me.skillCd) : '', col },
    { key: 'SHIFT', glyph: '»', name: 'DASH', ready: me.dashCd <= 0, fill: me.dashCd > 0 ? 1 - me.dashCd / .8 : 0, num: '', col: PAL.cyan }];
  if (dk) slots.push({ key: 'F', glyph: 'QH', name: os.name, ready: me.ram >= 1, on: me.scan, fill: me.ram / ramMax(), fillCol: PAL.cyan, num: Math.floor(me.ram), col: TIER[os.tier] });
  else if (isSandy(os)) { // the charge drains on the icon itself while it runs, refills while it doesn't, locks red when run dry
    const lock = me.scLock;
    slots.push({ key: 'C', glyph: 'SV', name: os.name, ready: !lock && me.sc >= .5, on: me.osT > 0, fill: lock ? 1 - me.osCd / sandyCd() : me.sc / sandyMax(),
      fillCol: lock ? PAL.rot : me.osT > 0 ? PAL.hot : PAL.cyan, num: lock ? Math.ceil(me.osCd) : me.sc.toFixed(1), col: TIER[os.tier], lock });
  } else if (os) {
    const on = me.osT > 0, dur = os.dur * (1 + cwMod('osdur')), cd = os.cd * (1 - cwMod('oscd'));
    slots.push({ key: 'C', glyph: 'OS', name: os.name, ready: on || me.osCd <= 0, on, fill: on ? me.osT / dur : me.osCd > 0 ? 1 - me.osCd / cd : 0, fillCol: on ? PAL.hot : null,
      num: on ? me.osT.toFixed(1) : me.osCd > 0 ? Math.ceil(me.osCd) : '', col: TIER[os.tier] });
  }
  slots.forEach((s, i) => {
    const x = x0 + i * 62, y = H - 20 - 66, f = clamp(s.fill, 0, 1);
    plate(x, y, 50, 50, 'rgba(14,14,23,.72)', s.lock ? PAL.rot : s.on ? PAL.hot : s.ready ? PAL.cyan : 'rgba(255,97,89,.45)', 8);
    if (f > 0) { X.fillStyle = hexA(s.fillCol || PAL.red, s.fillCol ? .28 : .3); X.fillRect(x + 1, y + 1 + 48 * (1 - f), 48, 48 * f); if (s.fillCol) { X.fillStyle = s.fillCol; X.fillRect(x + 1, y + 1 + 48 * (1 - f), 48, 2); } }
    X.fillStyle = s.col; X.fillRect(x, y, 3, 50); // tier / class bar
    txt(s.glyph, x + 26, y + 32, 20, s.lock ? PAL.rot : s.on ? PAL.hot : s.ready ? PAL.cyan : PAL.label);
    if (s.num !== '') txt(String(s.num), x + 46, y + 46, 11, PAL.white, DISP, 'right');
    if (!touchMode) keycap(x + 1, y + 54, s.key, s.ready || s.on ? PAL.cyan : PAL.label, 9);
    txt(s.name, x, y - 6, 9, s.ready ? PAL.red : PAL.label, DISP, 'left', .9);
  });
  if (me.scan) return; // the scanner's prompts take the bottom-right
  // ---- bottom-right: the super as charge modules (10 cells, one per 10%) ----
  const ready = me.sup >= 100, act = me.superT > 0, rx = W - 27, cw2 = 15, gap = 4, row = 10 * (cw2 + gap) - gap;
  txt(supName(), rx, H - 70, 13, act || ready ? PAL.gold : PAL.red, DISP, 'right');
  cells(rx - row - 4, H - 58, 10, act ? 10 * me.superT / me.superMax : me.sup / 10, act || ready ? PAL.gold : PAL.cyan, cw2, 26, gap, 4);
  if (dk && me.supUses === 1 && !act) txt('RE-RUN ↓' + supRam() + ' RAM · ' + (touchMode ? 'TAP SUPER' : 'Q'), rx, H - 88, 10, me.ram >= supRam() ? PAL.ice : PAL.label, DISP, 'right');
  txt(act ? 'ACTIVE · ' + me.superT.toFixed(1) + 's' : ready ? 'READY · ' + (touchMode ? 'TAP' : 'Q') : 'SUPER', rx, H - 16, 10, act || ready ? PAL.gold : PAL.label, DISP, 'right');
  if (me.t < 9 && world.wave === 1 && !touchMode) txt('WASD move · mouse aim · click shoot · Shift dash · E skill · Q super' + (dk ? ' · hold F scan' : os ? ' · C ' + os.name : ''), W / 2, H - 24, 12, PAL.dim, MONO, 'center', clamp(9 - me.t, 0, 1));
}

function bossStatus(b) { // one line under the boss bar telling you what to do right now
  const ai = bossDef(b).ai, stn = b.stn > 0, n = type => partsOf(b, type).length;
  if (ai === 'monolith') return b.aux > 0 ? ['CORE EXPOSED · ' + Math.ceil(b.aux) + 's · HIT IT', PAL.gold] : ['SHIELDED · BREAK THE ' + n('pillar') + ' PILLARS', PAL.ice];
  if (ai === 'kernel') return ['STAY OFF THE DEPRECATED TILES', '#C583FF'];
  if (ai === 'spaghetti') return stn ? ['STUNNED · 2x DAMAGE', PAL.gold] : ['CUT NOODLE ARMS ' + (b.aux | 0) + '/3 · DASH IF GRABBED', BUG.arm.col];
  if (ai === 'bsod') return b.aux > 0 ? ['REBOOTING ' + Math.floor(b.aux) + '% · HIT THE QR CODE!', PAL.gold] : stn ? ['REBOOT FAILED · 2x DAMAGE', PAL.gold] : ['ONLY THE QR CODE TAKES DAMAGE', '#78ADFF'];
  if (ai === 'loop') return ['ONLY THE HEAD TAKES DAMAGE', '#1DED83'];
  return stn ? ['LAUNCH ABORTED · ARMOR DOWN · 2x DAMAGE', PAL.gold] : ['LAUNCH IN T-' + Math.ceil(b.aux) + ' · BREAK ' + n('pod') + ' CI PODS', PAL.red];
}
const bossAlive = () => world.bugs.find(b => b.type === 'boss' && !b.dead);
function drawUpgrades(t) { // item cards: rarity bar by level, keycap, cyan frame on hover
  if (!me.offer || world.phase !== 'play' || paused) return;
  const cw = 240, chh = 104, gap = 14, x0 = W / 2 - (cw * 3 + gap * 2) / 2, y = H - 200;
  txt('UPGRADE' + (me.picks > 1 ? ' ×' + me.picks : ''), W / 2, y - 12, 15, PAL.gold);
  me.offer.forEach((k, i) => {
    const x = x0 + i * (cw + gap), lvl = me.up[k], syn = synFrom(k), tier = TIER[['uncommon', 'rare', 'epic', 'legendary', 'legendary', 'legendary'][lvl] || 'legendary'];
    const over = mouse.seen > 0 && !touchMode && mouse.x > x && mouse.x < x + cw && mouse.y > y && mouse.y < y + chh;
    plate(x, y, cw, chh, 'rgba(14,14,23,.92)', over ? PAL.hot : PAL.red, 10);
    X.fillStyle = tier; X.fillRect(x, y, 4, chh);
    if (!touchMode) keycap(x + 12, y + 10, String(i + 1));
    txt(UPG[k][0], x + (touchMode ? 14 : 38), y + 23, 16, over ? PAL.cyan : PAL.white, DISP, 'left');
    txt(lvl ? 'LV ' + lvl + ' → ' + (lvl + 1) : 'NEW', x + cw - 12, y + 23, 10, tier, DISP, 'right');
    X.fillStyle = 'rgba(67,22,24,1)'; X.fillRect(x + 12, y + 34, cw - 24, 1);
    const ds = k === 'battery' ? '+' + Math.round(SUPER_GAIN[lvl + 1] * 100) + '% super charge'
      : k === 'homing' ? 'lock-on chance ' + Math.round(smartAcc() * 100) + '% → ' + Math.round(smartAcc(Math.min(4, smartLv() + 1)) * 100) + '%'
      : k === 'zone' ? 'lock zone ' + (90 + 45 * lvl) + ' → ' + (135 + 45 * lvl) + 'px' : UPG[k][1];
    txt(ds, x + 14, y + 56, 14, PAL.white, DISP, 'left');
    txt('max ' + upgCap(me.wp, k), x + 14, y + 88, 11, PAL.dim, DISP, 'left');
    if (syn) txt('+ SYNERGY · ' + SYN[syn].name, x + cw - 12, y + 88, 11, PAL.purple, DISP, 'right');
    uiButtons.push({ x, y, w: cw, h: chh, fn: () => pickUpgrade(i) });
  });
  if (me.rerolls > 0) { // GIT STASH perk
    txt((touchMode ? 'TAP HERE' : 'R') + ' · REROLL (' + me.rerolls + ' left)', W / 2, y + chh + 22, 13, PAL.cyan);
    uiButtons.push({ x: W / 2 - 120, y: y + chh + 6, w: 240, h: 24, fn: rerollUpgrades });
  }
}
// ---------- quickhack icons (original line glyphs) ----------
const QH_P = {};
function qhIcon(k, x, y, s, col) { // s = half size
  const p = QH_P[k] ??= new Path2D(QH_ICON[k] || QH_ICON.ping);
  X.save(); X.translate(x - s, y - s); X.scale(s / 12, s / 12); X.strokeStyle = col; X.lineWidth = 1.8; X.lineJoin = 'miter'; X.stroke(p); X.restore();
}
// one quickhack in the upload queue: a small chamfered tile with its icon; f = upload progress (bar under the tile) for the one uploading
function qTile(k, x, y, s, f) {
  const col = QH[k].bw ? PAL.rot : PAL.ice;
  plate(x, y, s, s, f == null ? 'rgba(14,14,23,.85)' : 'rgba(23,44,46,.9)', hexA(col, f == null ? .6 : 1), Math.max(3, s / 5));
  qhIcon(k, x + s / 2, y + s / 2, s * .32, col);
  if (f != null) { X.fillStyle = hexA(col, .25); X.fillRect(x, y + s + 2, s, 3); X.fillStyle = col; X.fillRect(x, y + s + 2, s * f, 3); }
}
const threat = b => b.type === 'boss' ? 5 : Math.min(5, 1 + [150, 300, 600, 1000].filter(v => BUG[b.type].pts >= v).length);
const bugName = b => (b.type === 'boss' ? (BOSSES[b.kind] || BOSSES[0]).name : BUG[b.type].name);
// ---------- scanner overlay (hold F with a netdeck) ----------
function drawScan(t) {
  const k = clamp((T - scanIn) / .15, 0, 1), b = qhTarget(), hl = hackList(), dkD = osDef(), ice = PAL.ice;
  X.fillStyle = `rgba(6,14,20,${.38 * k})`; X.fillRect(0, 0, W, H); // the world goes dark green-teal
  X.fillStyle = `rgba(46,156,100,${.13 * k})`; X.fillRect(0, 0, W, H);
  X.strokeStyle = `rgba(76,163,154,${.07 * k})`; X.lineWidth = 1; X.beginPath();
  for (let x = 0; x < W; x += 64) { X.moveTo(x + .5, 0); X.lineTo(x + .5, H); }
  for (let y = 0; y < H; y += 64) { X.moveTo(0, y + .5); X.lineTo(W, y + .5); }
  X.stroke();
  dataCols(12, 140, 2, 30, PAL.red, .1 * k); dataCols(W - 152, 140, 2, 30, PAL.red, .1 * k);
  X.strokeStyle = hexA(PAL.red, .6 * k); X.lineWidth = 2; // corner brackets of the visor
  for (const [x, y, dx, dy] of [[14, 14, 1, 1], [W - 14, 14, -1, 1], [14, H - 14, 1, -1], [W - 14, H - 14, -1, -1]]) { X.beginPath(); X.moveTo(x + dx * 24, y); X.lineTo(x, y); X.lineTo(x, y + dy * 24); X.stroke(); }
  // ---- top centre: netdeck RAM ----
  const rm = ramMax(), cw = 11, cg = 4, rowW = rm * (cw + cg) - cg;
  txt('NETDECK RAM: ' + Math.floor(me.ram) + '/' + rm, W / 2, 50, 14, PAL.red, DISP, 'center', k);
  cells(W / 2 - rowW / 2, 58, rm, me.ram, ice, cw, 26, cg, 4);
  // ---- target: brackets, reticle grid, converging chevrons, readouts (on the world, through the camera) ----
  if (b) {
    X.save(); X.translate(-cam.x, -cam.y);
    const r = b.r + 10, age = T - scanIn;
    X.fillStyle = 'rgba(255,97,89,.12)'; X.fillRect(b.x - r, b.y - r, r * 2, r * 2);
    X.strokeStyle = PAL.red; X.lineWidth = 2; X.shadowColor = hexA(PAL.red, .6); X.shadowBlur = 8 * scale;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { X.beginPath(); X.moveTo(b.x + sx * r, b.y + sy * (r - 9)); X.lineTo(b.x + sx * r, b.y + sy * r); X.lineTo(b.x + sx * (r - 9), b.y + sy * r); X.stroke(); }
    X.shadowBlur = 0;
    const sq = []; for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) if (i || j) sq.push([i * 72, j * 72]);
    sq.sort((p, q) => Math.hypot(q[0], q[1]) - Math.hypot(p[0], p[1])).forEach(([dx, dy], i) => { // pop in from the outside in, 10ms apart
      if (age < .04 + i * .01) return;
      X.strokeStyle = hexA(PAL.red, .55); X.lineWidth = 1; X.strokeRect(b.x + dx - 4.5, b.y + dy - 4.5, 9, 9);
    });
    const cv = 40 * (1 - k);
    X.font = '600 14px ' + DISP; X.textAlign = 'center'; X.fillStyle = hexA(PAL.red, .8);
    for (let i = 0; i < 5; i++) { X.fillText('›', b.x - 170 - cv, b.y - 26 + i * 13); X.fillText('‹', b.x + 170 + cv, b.y - 26 + i * 13); }
    txt('1x', b.x - 194 - cv, b.y + 5, 11, PAL.red, DISP, 'right');
    txt((Math.hypot(b.x - me.x, b.y - me.y) / 10).toFixed(1), b.x + 194 + cv, b.y + 5, 11, PAL.red, DISP, 'left');
    X.fillStyle = ice; X.beginPath(); const hx = b.x - tw(bugName(b), 15) / 2 - 16, hy = b.y - r - 34; // target header
    X.moveTo(hx, hy - 7); X.lineTo(hx + 7, hy); X.lineTo(hx, hy + 7); X.lineTo(hx - 7, hy); X.closePath(); X.strokeStyle = ice; X.lineWidth = 1.5; X.stroke();
    txt(bugName(b), b.x + 4, b.y - r - 29, 15, ice);
    X.restore();
  }
  // ---- left: the quickhack list, rows stepped like a stair; the selected one pushed out ----
  const lx = 64, ly = 214, rw = 290, rh = 38, step = [0, 12, 20, 24, 20, 12, 0];
  txt(dkD.name + ' // V4.0.4', lx + 8, ly - 44, 9, PAL.red, DISP, 'left', .7);
  txt('QUICKHACKS LOADED:', lx + 8, ly - 24, 15, ice, DISP, 'left');
  X.fillStyle = hexA(PAL.red, .5); X.fillRect(lx + 8, ly - 16, 250, 1);
  hl.forEach((h, i) => {
    const Q = QH[h], sel = i === qhSel, x = lx + step[i % 7] + (sel ? 18 : 0) - 40 * (1 - k), y = ly + i * (rh + 8);
    const tq = qOn(qhTgt), upl = tq.some(q => q.k === h && q.on), qn = tq.filter(q => q.k === h && !q.on).length, low = me.ram < Q.ram, a = sel ? 1 : .78;
    if (mouse.seen > 0 && !touchMode && T - mouse.seen < .05 && mouse.x > x && mouse.x < x + rw && mouse.y > y && mouse.y < y + rh && !sel) { qhSel = i; cue('qh_hover'); }
    X.fillStyle = sel ? 'rgba(82,221,223,.14)' : 'rgba(14,14,23,.6)'; para(x, y, rw, rh, 6); X.fill();
    X.strokeStyle = hexA(ice, sel ? 1 : .5); X.lineWidth = sel ? 2 : 1; para(x, y, rw, rh, 6); X.stroke();
    txt(Q.name, x + 16, y + 17, 15, low ? PAL.label : Q.bw ? PAL.rot : ice, DISP, 'left', a);
    const tag = upl ? 'UPLOADING' : low ? 'RAM LOW' : 'READY', tc = upl ? PAL.gold : low ? PAL.red : ice, tW = tw(tag, 8) + 8;
    X.strokeStyle = hexA(tc, .6); X.lineWidth = 1; X.strokeRect(x + 16.5, y + 22.5, tW, 11); txt(tag, x + 20, y + 31, 8, tc, DISP, 'left', a);
    for (let j = 0; j < qn; j++) qTile(h, x + 22 + tW + j * 16, y + 21, 13); // one icon per queued copy
    txt('↓' + Q.ram, x + rw - 52, y + 25, 17, low ? PAL.red : ice, DISP, 'right', a);
    X.fillStyle = hexA(low ? PAL.red : ice, a); X.fillRect(x + rw - 49, y + 12, 3, 13); X.fillRect(x + rw - 45, y + 15, 2, 10); // RAM glyph
    plate(x + rw - 38, y + 4, 30, 30, 'rgba(14,14,23,.7)', hexA(ice, .6), 5); qhIcon(h, x + rw - 23, y + 19, 10, ice);
    uiButtons.push({ x, y, w: rw, h: rh, fn: () => qhUpload(i) });
  });
  const sQ = QH[hl[qhSel]];
  if (sQ) {
    let dy = ly + hl.length * (rh + 8) + 16;
    for (const l of wrapText(sQ.desc, 46)) { txt(l, lx + 8, dy, 12, PAL.white, DISP, 'left', .9); dy += 16; }
    txt('UPLOAD ' + uploadTime(hl[qhSel]).toFixed(1) + 's · RAM ' + sQ.ram + ' · SUPER −' + sQ.ram * 4 + '%', lx + 8, dy + 4, 10, PAL.gold, DISP, 'left');
    const QL = qOn(qhTgt), qx0 = lx + 8 + tw('TARGET QUEUE', 10) + 12; // this enemy's queue as icon slots: filled = queued, dashed = free
    txt('TARGET QUEUE', lx + 8, dy + 26, 10, ice, DISP, 'left', .8);
    for (let i = 0; i < qDepth(); i++) {
      const q = QL[i], qx = qx0 + i * 30;
      if (q) qTile(q.k, qx, dy + 10, 24, q.on ? q.t / q.max : null);
      else { X.strokeStyle = hexA(ice, .35); X.lineWidth = 1; X.setLineDash([3, 3]); X.strokeRect(qx + .5, dy + 10.5, 23, 23); X.setLineDash([]); }
    }
  }
  // ---- right: scan data panel ----
  const pw = 300, px = W - 40 - pw, py = 236, ph = 352;
  plate(px, py + 26, pw, ph, 'rgba(49,24,30,.7)', hexA(PAL.red, .7), 12);
  plate(px, py, 120, 26, 'rgba(104,30,31,.6)', PAL.red, 0); txt('DATA', px + 14, py + 18, 13, PAL.red, DISP, 'left');
  plate(px + 124, py, 130, 26, 'rgba(14,14,23,.6)', hexA(PAL.red, .4), 0); txt('HACKING', px + 138, py + 18, 13, hexA(PAL.red, .7), DISP, 'left');
  keycap(px + 214, py + 5, 'F', ice, 8);
  if (b) {
    let y = py + 54; const L = (s, yy) => txt(s, px + 18, yy, 10, PAL.red, DISP, 'left', .9);
    if (me.scanP < 1) {
      L('SCANNING…', y); X.fillStyle = hexA(ice, .2); X.fillRect(px + 18, y + 8, pw - 36, 4); X.fillStyle = ice; X.fillRect(px + 18, y + 8, (pw - 36) * me.scanP, 4);
    } else {
      const I = BUG_INFO[b.type] || ['UNKNOWN PROCESS', ''];
      L('SCAN RESULTS', y); txt(bugName(b), px + 18, y + 24, 21, PAL.gold, DISP, 'left'); y += 46;
      L('CLASSIFICATION', y); txt(I[0], px + 18, y + 18, 14, ice, DISP, 'left'); y += 36;
      L('THREAT LEVEL', y); for (let i = 0, n = threat(b); i < 5; i++) { // filled / hollow diamonds
        const sx = px + 26 + i * 20, sy = y + 13; X.beginPath(); X.moveTo(sx, sy - 6); X.lineTo(sx + 6, sy); X.lineTo(sx, sy + 6); X.lineTo(sx - 6, sy); X.closePath();
        if (i < n) { X.fillStyle = n >= 4 ? PAL.rot : ice; X.fill(); } else { X.strokeStyle = hexA(ice, .5); X.lineWidth = 1; X.stroke(); }
      }
      y += 36;
      L('INTEGRITY', y); bar(px + 18, y + 8, 180, 8, b.hp / b.mhp, PAL.red, 0, 0, 3);
      txt(Math.ceil(b.hp) + ' / ' + Math.ceil(b.mhp), px + pw - 18, y + 16, 11, PAL.white, DISP, 'right'); y += 34;
      L('BEHAVIOR', y); y += 4; for (const l of wrapText(I[1], 40).slice(0, 2)) { y += 15; txt(l, px + 18, y, 12, PAL.white, DISP, 'left', .9); } y += 22;
      const st = [b.frz > 0 && 'LOCKED', b.blind > 0 && 'BLIND', me.dots.some(d => d.id === b.id && !d.worm) && 'BURNING', me.dots.some(d => d.id === b.id && d.worm) && 'INFECTED', me.marks.get(b.id) > T && 'MARKED +30%'].filter(Boolean);
      L('STATUS', y); txt(st.length ? st.join(' · ') : 'NOMINAL', px + 18, y + 17, 12, st.length ? PAL.gold : PAL.green, DISP, 'left'); y += 34;
      const boss = b.type === 'boss' || isPart(b), weak = boss ? ['smash', 'throttle', 'worm'] : ['mutex', 'nullptr', 'smash'], res = boss ? ['nullptr'] : [];
      L('WEAK TO:', y);
      if (res.length) txt('RESISTANT TO:', px + 190, y, 10, PAL.red, DISP, 'left', .9);
      weak.forEach((h, i) => { const tx = px + 30 + i * 40, ty = y + 26; X.strokeStyle = PAL.green; X.lineWidth = 1.5; X.beginPath(); X.moveTo(tx, ty - 14); X.lineTo(tx + 15, ty + 12); X.lineTo(tx - 15, ty + 12); X.closePath(); X.stroke(); qhIcon(h, tx, ty + 3, 5.5, PAL.green); });
      res.forEach((h, i) => { const tx = px + 206 + i * 40, ty = y + 26; X.strokeStyle = PAL.rot; X.lineWidth = 1.5; X.beginPath(); X.moveTo(tx, ty - 14); X.lineTo(tx + 15, ty + 12); X.lineTo(tx - 15, ty + 12); X.closePath(); X.stroke(); qhIcon(h, tx, ty + 3, 5.5, PAL.rot); });
    }
  } else txt('NO TARGET IN RANGE', px + 18, py + 60, 13, PAL.red, DISP, 'left');
  txt('ROTSEC', px + pw - 16, py + 26 + ph - 14, 15, hexA(PAL.red, .6), DISP, 'right', 1, false);
  // ---- bottom-right prompts, escape action last ----
  let fx = W - 30;
  for (const [key, label] of [['F', 'RELEASE'], ['← →', 'CHANGE TARGET'], ['WHEEL', 'SELECT'], ['CLICK', 'UPLOAD']]) {
    const lw = tw(label, 13); txt(label, fx, H - 28, 13, PAL.red, DISP, 'right'); fx -= lw + 8;
    const kw = Math.max(16, tw(key, 9) + 8); keycap(fx - kw, H - 40, key, ice, 9); fx -= kw + 22;
  }
}
// ---------- cyberware effects in the world ----------
function drawCyberFx(t) {
  if (me.down || world.phase !== 'play') return;
  const z = me.sa;
  if (z && z.r > 0 && !me.scan) { // SMARTCURVE lock zone: bracketed box around the aim point, lock ticks on bugs inside
    const w = z.r, h = z.r * .72;
    X.strokeStyle = hexA(PAL.cyan, .45); X.lineWidth = 1.5;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { X.beginPath(); X.moveTo(z.x + sx * w, z.y + sy * (h - 14)); X.lineTo(z.x + sx * w, z.y + sy * h); X.lineTo(z.x + sx * (w - 18), z.y + sy * h); X.stroke(); }
    X.fillStyle = hexA(PAL.cyan, .5); X.fillRect(z.x - w, z.y - 1, 6, 2); X.fillRect(z.x + w - 6, z.y - 1, 6, 2);
    txt('SMART · ' + Math.round(smartAcc() * 100) + '%', z.x - w, z.y - h - 6, 9, PAL.cyan, DISP, 'left', .6);
    X.strokeStyle = PAL.gold; X.lineWidth = 1.5;
    for (const b of world.bugs) if (targetable(b) && Math.hypot(b.x - z.x, b.y - z.y) < z.r + b.r) {
      const r = b.r + 6; X.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { X.moveTo(b.x + sx * r, b.y + sy * (r - 5)); X.lineTo(b.x + sx * r, b.y + sy * r); X.lineTo(b.x + sx * (r - 5), b.y + sy * r); }
      X.stroke();
    }
  }
  for (const b of world.bugs) if (me.marks.get(b.id) > T && !b.dead) { // PING SWEEP marks
    X.fillStyle = PAL.red; X.beginPath(); X.moveTo(b.x, b.y - b.r - 8); X.lineTo(b.x + 5, b.y - b.r - 15); X.lineTo(b.x - 5, b.y - b.r - 15); X.closePath(); X.fill();
  }
  if (me.wakes.length > 1) { // STATIC WAKE
    X.strokeStyle = PAL.hot; X.lineWidth = 2; X.shadowColor = PAL.hot; X.shadowBlur = 10 * scale; X.beginPath();
    me.wakes.forEach((w, i) => { const p = me.wakes[i - 1], j = rand(-3, 3); if (!p || w.t - p.t > .06 || Math.hypot(w.x - p.x, w.y - p.y) > 80) X.moveTo(w.x, w.y); else X.lineTo(w.x + j, w.y - j); });
    X.globalAlpha = .7; X.stroke(); X.globalAlpha = 1; X.shadowBlur = 0;
  }
  for (const a of me.arcs) { // ARC PROJECTOR / quickhack streams / worm jumps
    X.strokeStyle = a.col || PAL.hot; X.lineWidth = 2; X.globalAlpha = 1 - (T - a.t) / .25; X.shadowColor = a.col || PAL.hot; X.shadowBlur = 10 * scale; X.beginPath();
    for (let i = 0; i + 1 < a.pts.length; i++) {
      const [x1, y1] = a.pts[i], [x2, y2] = a.pts[i + 1]; X.moveTo(x1, y1);
      for (let s = 1; s <= 6; s++) { const f = s / 6; X.lineTo(x1 + (x2 - x1) * f + (s < 6 ? rand(-9, 9) : 0), y1 + (y2 - y1) * f + (s < 6 ? rand(-9, 9) : 0)); }
    }
    X.stroke(); X.globalAlpha = 1; X.shadowBlur = 0;
  }
  const byTgt = new Map(); // the upload queue over each target, as icon tiles: the uploading one first (with its progress bar)
  for (const q of me.qq) { if (!byTgt.has(q.id)) byTgt.set(q.id, []); byTgt.get(q.id).push(q); }
  for (const [id, L] of byTgt) {
    const b = world.bugs.find(x => x.id === id && !x.dead); if (!b) continue;
    const s = 16, x0 = b.x - (L.length * (s + 4) - 4) / 2, y = b.y - b.r - 36;
    L.forEach((q, i) => qTile(q.k, x0 + i * (s + 4), y, s, q.on ? q.t / q.max : null));
  }
}
function drawTouch(t) {
  if (!touchMode || world.phase !== 'play' || paused) return;
  const base = stickL || { ox: 150, oy: H - 150, x: 150, y: H - 150 };
  X.globalAlpha = stickL ? .5 : .2; X.strokeStyle = PAL.cyan; X.lineWidth = 2;
  X.beginPath(); X.arc(base.ox, base.oy, 70, 0, 7); X.stroke(); // cp-ok: thumbstick ring is an input glyph
  const dx = base.x - base.ox, dy = base.y - base.oy, d = Math.hypot(dx, dy), m = Math.min(70, d) / (d || 1);
  X.fillStyle = PCOL[myColor]; X.beginPath(); X.arc(base.ox + dx * m, base.oy + dy * m, 30, 0, 7); X.fill(); // cp-ok: input glyph
  if (stickR) { X.globalAlpha = .4; X.beginPath(); X.arc(stickR.ox, stickR.oy, 60, 0, 7); X.stroke(); X.beginPath(); X.arc(stickR.x, stickR.y, 22, 0, 7); X.fill(); } // cp-ok: input glyph
  else txt('drag here to aim + fire', W * .62, H - 80, 12, PAL.dim, MONO, 'center', .5);
  X.globalAlpha = 1;
  const os = osDef();
  const cy = !os ? 0 : deck() ? me.ram / ramMax() : isSandy(os) ? (me.scLock ? 1 - me.osCd / sandyCd() : me.sc / sandyMax()) : me.osT > 0 ? 1 : 1 - me.osCd / (os.cd * (1 - cwMod('oscd')));
  const fill = { super: me.sup / 100, skill: clamp(1 - me.skillCd / skillCdBase(), 0, 1), dash: clamp(1 - me.dashCd / .8, 0, 1), cyber: clamp(cy, 0, 1) };
  for (const k in TOUCH_BTN) {
    if (k === 'cyber' && !os) continue;
    const b = TOUCH_BTN[k], c = k === 'super' ? PAL.gold : k === 'cyber' && me.scLock ? PAL.rot : PAL.cyan, ready = k === 'cyber' && os ? (deck() ? me.ram >= 1 : isSandy(os) ? !me.scLock && me.sc >= .5 : fill[k] >= 1) : fill[k] >= 1;
    X.fillStyle = ready ? 'rgba(94,246,255,.12)' : 'rgba(14,14,23,.5)'; X.beginPath(); X.arc(b.x, b.y, b.r, 0, 7); X.fill(); // cp-ok: touch button is an input glyph
    X.strokeStyle = c; X.lineWidth = 3; X.beginPath(); X.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + 6.283 * fill[k]); X.stroke(); // cp-ok: cooldown ring
    txt(k === 'cyber' && deck() ? (me.scan ? 'CLOSE' : 'SCAN') : b.label, b.x, b.y + 5, 13, ready ? PAL.cyan : PAL.red);
  }
}

// ---------- screens ----------
// ---------- the wordmark: CODEROT rots. Every couple of seconds letters swap or corrupt, then snap back ----------
const LOGO = 'CODEROT';
function logoText(t) { // every 2.4s, for ~0.5s: 1-3 letters rot into glyphs (new ones every 70ms), sometimes two letters trade places
  if (!SET.glitch) return LOGO;
  const n = Math.floor(t / 2.4), ph = t - n * 2.4; if (ph > .5) return LOGO;
  const s = LOGO.split(''), step = Math.floor(ph / .07), h = i => (((n + 1) * 7919 + i * 104729 + step * 7907) % 9973) / 9973;
  if (n % 3 === 1) { const i = n % 6; [s[i], s[i + 1]] = [s[i + 1], s[i]]; }
  s[(n * 3 + step) % 7] = GL[Math.floor(h(1) * GL.length)];
  for (let j = 0; j < 7; j++) if (h(j + 2) < .22) s[j] = GL[Math.floor(h(j + 11) * GL.length)];
  return s.join('');
}
function logo(t, y) { // red ink, hostile-red ROT, letters that won't stay put, one short RGB split every 4s
  const gOn = SET.glitch && (t * 1000) % 4000 < 120, gx = gOn ? 6 : 0, s = logoText(t);
  X.font = '700 128px ' + DISP; X.textAlign = 'center';
  const ws = LOGO.split('').map(c => X.measureText(c).width), tot = ws.reduce((a, b) => a + b, 0), x0 = W / 2 - tot / 2;
  const wc = ws.slice(0, 4).reduce((a, b) => a + b, 0);
  const each = fn => { let x = x0; for (let i = 0; i < 7; i++) { fn(s[i], x + ws[i] / 2, i); x += ws[i]; } };
  if (gOn) {
    X.globalCompositeOperation = 'lighter'; X.globalAlpha = .7;
    X.fillStyle = PAL.cyan; each((c, cx) => X.fillText(c, cx - gx, y)); X.fillStyle = '#FF2A4F'; each((c, cx) => X.fillText(c, cx + gx, y + 2));
    X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  }
  X.shadowBlur = 24 * scale;
  each((c, cx, i) => { const hot = i > 3 || c !== LOGO[i]; X.shadowColor = hexA(hot ? PAL.rot : PAL.red, .6); X.fillStyle = hot ? PAL.rot : PAL.red; X.fillText(c, cx, y); });
  X.shadowBlur = 0; X.textAlign = 'left';
  X.fillStyle = 'rgba(255,97,89,.5)'; X.fillRect(x0, y + 18, wc - 12, 1);
  txt('ROTSEC SYSTEMS', x0, y + 32, 9, PAL.red, DISP, 'left', .55);
  txt('PROTOCOL 0451-CR7 · BUILD 4.0.4', x0 + wc - 12, y + 32, 9, PAL.red, DISP, 'right', .55);
}
function scoreList() {
  return [{ n: nick, s: me.score, col: PCOL[myColor], lv: me.lv, wp: me.wp, me: 1 }, ...[...others.values()].map(o => ({ n: o.n, s: o.s, col: o.col, lv: o.lv, wp: o.wp }))]
    .sort((a, b) => b.s - a.s).slice(0, 8);
}
const DATA = Array.from({ length: 120 }, (_, i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1); // fixed noise for data columns
function dataCols(x, y, cols, rows, col, a) { // decorative number columns (greebles)
  X.globalAlpha = a; X.font = '10px ' + MONO; X.fillStyle = col; X.textAlign = 'left';
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) { const v = DATA[(c * 31 + r * 7) % DATA.length]; if (v > .35) X.fillText(v.toFixed(4), x + c * 70, y + r * 14); }
  X.globalAlpha = 1;
}
function drawOver(t) { // theme failure: near-black red, data columns, left-aligned title + list, run report on the right
  const g = X.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(25,4,11,.94)'); g.addColorStop(1, 'rgba(0,0,0,.94)');
  X.fillStyle = g; X.fillRect(0, 0, W, H);
  dataCols(W / 2, 90, 6, 40, PAL.red, .1);
  X.fillStyle = 'rgba(255,97,89,.25)'; X.fillRect(27, 26, 150, 10); txt('CONNECTION LOST', 30, 34, 8, '#000000', DISP, 'left', 1, false);
  txt('CORE CRITICAL ERROR AT LINE 0451 · ' + codeLabel, W - 27, 34, 8, PAL.red, DISP, 'right', .5);
  // the bug that got you
  X.save(); X.translate(118, 214); X.strokeStyle = PAL.red; X.lineWidth = 2;
  for (let i = 0; i < 6; i++) { const a = (i < 3 ? 1 : -1) * Math.PI / 2 + (i % 3 - 1) * .55; X.beginPath(); X.moveTo(Math.cos(a) * 14, Math.sin(a) * 14); X.lineTo(Math.cos(a) * 32, Math.sin(a) * 32); X.stroke(); }
  X.shadowColor = hexA(PAL.red, .6); X.shadowBlur = 16 * scale; X.beginPath(); X.arc(0, 0, 22, 0, 7); X.stroke(); X.shadowBlur = 0;
  txt('✕', 0, 8, 22, PAL.red); X.restore();
  txt('SYSTEM ROTTED', 160, 232, 56, PAL.red, DISP, 'left');
  txt('> crashed on wave ' + world.wave + ' · ' + dif().name.toLowerCase() + (world.autoskip ? ' · wave skip' : ''), 162, 258, 12, PAL.label, MONO, 'left');
  if (world.muts.length) txt('> mutators: ' + world.muts.map(k => MUTS[k].name.toLowerCase()).join(' + ') + ' · points x' + mutScore().toFixed(2), 162, 276, 12, PAL.label, MONO, 'left');
  if (overT > .8) {
    button(90, 318, 330, 36, isHost || !online() ? 'PLAY AGAIN' : 'VOTE RESTART', PAL.red, restart, true);
    button(90, 358, 330, 36, 'EXIT TO MAIN MENU', PAL.red, () => toMenu());
  }
  // run report
  const px = W - 520, py = 150, pw = 440, list = scoreList(), ph = 92 + list.length * 28 + (newUnlocks.length ? 22 : 0) + (adminMode ? 0 : 22 + (runDrops.length ? 22 : 0));
  plate(px, py, pw, ph, 'rgba(14,14,23,.8)', 'rgba(255,97,89,.5)', 10);
  txt('RUN REPORT', px + 16, py + 26, 16, PAL.red, DISP, 'left'); X.fillStyle = 'rgba(255,97,89,.5)'; X.fillRect(px + 16, py + 34, pw - 32, 1);
  if (!adminMode) { txt('+' + fmt(runBytes) + ' ¤', px + pw - 16, py + 26, 18, PAL.gold, DISP, 'right'); }
  list.forEach((p, i) => {
    const y = py + 62 + i * 28;
    if (i === 0 && list.length > 1 && p.s > list[1].s) txt('MVP', px + 16, y, 11, PAL.gold, DISP, 'left');
    txt(p.n + (p.me ? ' (you)' : ''), px + 52, y, 16, p.col, DISP, 'left');
    txt('LV ' + (p.lv || 1) + ' · ' + WEAPONS[p.wp || 'pulse'].name, px + 230, y, 11, PAL.label, DISP, 'left');
    txt(fmt(p.s), px + pw - 16, y, 16, PAL.white, DISP, 'right');
  });
  const fy = py + 62 + list.length * 28 + 10;
  txt(newBest ? 'NEW PERSONAL BEST' : 'YOUR BEST ' + fmt(best), px + 16, fy, 13, newBest ? PAL.gold : PAL.label, DISP, 'left');
  if (!adminMode) txt(fmt(bytes) + ' ¤ total', px + pw - 16, fy, 12, PAL.gold, DISP, 'right');
  let uy = fy;
  if (!adminMode) { // XP + level progress, then anything a boss dropped
    const L = lvInfo(); uy += 22;
    txt('+' + fmt(runXp) + ' XP · LEVEL ' + L.lv + (L.need ? ' · ' + Math.floor(L.into / L.need * 100) + '% to ' + (L.lv + 1) : ' · MAX'), px + 16, uy, 12, PAL.gold, DISP, 'left');
    if (attrPts() + perkPts() > 0) txt('UNSPENT POINTS', px + pw - 16, uy, 11, PAL.cyan, DISP, 'right');
    if (runDrops.length) { uy += 22; txt('DROPS: ' + runDrops.join(' · '), px + 16, uy, 12, PAL.purple, DISP, 'left'); }
  }
  if (newUnlocks.length) txt('UNLOCKED: ' + newUnlocks.map(s => s.name).join(', '), px + 16, uy + 22, 12, PAL.purple, DISP, 'left');
  if (overT > .8) { const kw = keycap(W - 27 - 150, H - 40, 'ENTER'); txt('Select', W - 27 - 150 + kw + 8, H - 28, 13, PAL.red, DISP, 'left'); }
}
function drawPause() { // theme menu: fader, left list, run status panel, footer prompts
  X.fillStyle = 'rgba(7,8,10,.72)'; X.fillRect(0, 0, W, H);
  txt(online() ? 'ROOM MENU' : 'PAUSED', 90, 168, 40, PAL.red, DISP, 'left');
  X.fillStyle = 'rgba(255,97,89,.5)'; X.fillRect(90, 180, 330, 1);
  if (online()) txt('ROOM ' + roomCode + ' · the room keeps playing', 92, 198, 12, PAL.label, MONO, 'left');
  if (online() && !isHost) txt(myPing ? 'PING TO HOST ' + Math.round(myPing) + 'ms' + (myPing > 180 ? ' · laggy' : '') : 'MEASURING PING…', 92, 214, 12, myPing ? pingCol(myPing) : PAL.dim, MONO, 'left');
  let y = 232;
  const item = (label, fn, hot) => { button(90, y, 330, 34, label, PAL.red, fn, hot); y += 38; };
  item('RESUME', () => { paused = false; cue('close'); }, true);
  item('SETTINGS', openSettings);
  if (online()) item(copiedT > T ? 'LINK COPIED' : 'COPY INVITE', copyInvite);
  if (isHost) item('WAVE SKIP: ' + (world.autoskip ? 'ON · x' + AUTO_SKIP_SCORE : 'OFF'), () => setAutoSkip(!world.autoskip));
  item(online() ? 'LEAVE ROOM' : 'QUIT TO MAIN MENU', () => toMenu());
  // run status
  const px = W - 500, py = 140, pw = 420;
  const cw = Object.values(me.cw).map(id => CW[id]).filter(Boolean), ups = Object.keys(UPG).filter(k => me.up[k]);
  const ph = 128 + Math.ceil(ups.length / 2) * 18 + cw.length * 18;
  plate(px, py, pw, ph, 'rgba(14,14,23,.85)', 'rgba(255,97,89,.5)', 10);
  txt('RUN STATUS', px + 16, py + 26, 16, PAL.red, DISP, 'left'); X.fillStyle = 'rgba(255,97,89,.5)'; X.fillRect(px + 16, py + 34, pw - 32, 1);
  [['LEVEL', me.lv + ' · ' + WEAPONS[me.wp].name + (me.mk > 1 ? ' MK.' + me.mk : '')], ['WAVE', String(world.wave)], ['SCORE', fmt(me.score)], ['EARNED', fmt(runBytes) + ' ¤ · ' + fmt(runXp) + ' XP']].forEach(([k, v], i) => {
    txt(k, px + 16, py + 56 + i * 18, 11, PAL.teal, DISP, 'left'); txt(v, px + 110, py + 56 + i * 18, 13, PAL.white, DISP, 'left');
  });
  let ly = py + 56 + 4 * 18 + 6;
  ups.forEach((k, i) => txt(UPG[k][0] + ' ' + me.up[k], px + 16 + (i % 2) * 200, ly + (i >> 1) * 18, 11, PAL.gold, DISP, 'left'));
  ly += Math.ceil(ups.length / 2) * 18 + 4;
  cw.forEach((D, i) => { X.fillStyle = TIER[D.tier]; X.fillRect(px + 16, ly + i * 18 - 9, 3, 11); txt(D.name, px + 24, ly + i * 18, 11, PAL.cyan, DISP, 'left'); });
  const kw = keycap(W - 27 - 120, H - 40, 'ESC'); txt('Resume', W - 27 - 120 + kw + 8, H - 28, 13, PAL.red, DISP, 'left');
}
function drawBanner() { // toast-style: wipes in (180ms), holds, fades. Green toast for wins, red warning plate for bosses.
  const b = banner; b.T0 ??= T; const age = T - b.T0, wipe = clamp(age / .18, 0, 1), a = Math.min(1, b.t * 3);
  const warn = /^BOSS INCOMING/.test(b.sub), win = /^(WAVE CLEAR|BOSS DEFEATED)$/.test(b.big), sub = warn ? b.sub.replace(/^BOSS INCOMING · /, '') : b.sub || '';
  const fit = (str, size, max) => Math.min(size, size * max / Math.max(1, tw(str, size)));
  const w = Math.min(W - 80, Math.max(420, tw(b.big, 40) + 80, sub ? tw(sub, 14) + 60 : 0)), x = W / 2 - w / 2, y = 200;
  const h = warn ? 128 : win ? 86 : sub ? 76 : 60;
  X.save(); X.globalAlpha = a; X.beginPath(); X.rect(x - 2, y - 4, (w + 4) * wipe, h + 8); X.clip();
  if (warn) {
    plate(x, y, w, 30, PAL.rot, null, 10); txt('▲ BOSS INCOMING ▲', W / 2, y + 22, 18, '#000000', DISP, 'center', a, false);
    plate(x, y + 34, w, 92, 'rgba(14,14,23,.9)', PAL.rot, 10);
    txt(b.big, W / 2, y + 76, fit(b.big, 36, w - 40), PAL.rot, DISP, 'center', a);
    txt(sub, W / 2, y + 106, fit(sub, 14, w - 30), PAL.gold, DISP, 'center', a);
  } else if (win) {
    plate(x, y, w, 50, 'rgba(59,210,122,.78)', null, 14); txt(b.big, W / 2, y + 36, fit(b.big, 32, w - 40), '#072A14', DISP, 'center', a, false);
    if (sub) txt(sub, W / 2, y + 72, fit(sub, 14, w - 30), PAL.green, DISP, 'center', a);
  } else {
    plate(x, y, w, h, 'rgba(14,14,23,.88)', 'rgba(255,97,89,.6)', 12);
    X.fillStyle = PAL.gold; X.fillRect(x, y, 4, h);
    txt(b.big, W / 2, y + (sub ? 44 : 44), fit(b.big, 40, w - 40), PAL.red, DISP, 'center', a);
    if (sub) txt(sub, W / 2, y + 64, fit(sub, 14, w - 30), PAL.gold, DISP, 'center', a);
  }
  X.restore();
}
function drawEdgePips(t) { // off-screen DATA STASHES (gold) and the boss (red): a chevron on the edge of the view, pointing at it
  const pip = (x, y, col, label) => {
    if (inView(x, y, -20)) return;
    const cx = W / 2, cy = H / 2, dx = x - cam.x - cx, dy = y - cam.y - cy, k = Math.min((cx - 30) / Math.abs(dx || 1e-6), (cy - 30) / Math.abs(dy || 1e-6));
    const px = cx + dx * k, py = cy + dy * k, a = Math.atan2(dy, dx);
    X.save(); X.translate(px, py); X.rotate(a); X.fillStyle = col; X.globalAlpha = .7 + .3 * Math.sin(t * 5);
    X.beginPath(); X.moveTo(9, 0); X.lineTo(-5, -7); X.lineTo(-5, 7); X.closePath(); X.fill(); X.restore(); X.globalAlpha = 1;
    txt(label + ' ' + Math.round(Math.hypot(x - me.x, y - me.y) / 10) + 'm', px - Math.cos(a) * 26, py - Math.sin(a) * 18 + 4, 9, col, DISP, 'center', .8);
  };
  for (const w of world.pows) if (w.type === 'stash' && !w.taken) pip(w.x, w.y, PAL.gold, 'STASH');
  const b = bossAlive(); if (b) pip(b.x, b.y, PAL.rot, 'BOSS');
  const left = world.queue.length ? [] : world.bugs.filter(o => !o.dead && !isPart(o) && o.type !== 'boss');
  if (left.length && left.length <= BAL.map.pips) for (const o of left) pip(o.x, o.y, PAL.red, 'BUG'); // the wave's last stragglers, wherever they are on the map
}
// bloom: the world's bright ink (shots, optics, arcs, pickups) thresholded, blurred at quarter size and added back. HUD stays crisp.
const BLM = document.createElement('canvas'), BX = BLM.getContext('2d'), CAN_FILTER = typeof BX.filter === 'string';
function bloom() {
  const w = C.width >> 2, h = C.height >> 2; if (!SET.bloom || !CAN_FILTER || !w || !h) return;
  if (BLM.width !== w || BLM.height !== h) { BLM.width = w; BLM.height = h; }
  BX.globalCompositeOperation = 'copy'; BX.filter = 'contrast(3) brightness(.85) blur(3px)'; BX.drawImage(C, 0, 0, w, h); BX.filter = 'none';
  X.save(); X.setTransform(1, 0, 0, 1, 0, 0); X.globalCompositeOperation = 'lighter'; X.globalAlpha = .55; X.drawImage(BLM, 0, 0, C.width, C.height); X.restore();
}
function draw(t) {
  uiButtons = [];
  if (!C.width || !C.height) return; // minimized / hidden: drawImage on a 0-size canvas throws and would kill the loop
  X.setTransform(1, 0, 0, 1, 0, 0); X.fillStyle = '#060E14'; X.fillRect(0, 0, C.width, C.height);
  const sk = SET.shake ? shake : 0, sx = rand(-1, 1) * sk, sy = rand(-1, 1) * sk;
  X.setTransform(scale, 0, 0, scale, ox + sx * scale, oy + sy * scale);
  X.save(); X.beginPath(); X.rect(0, 0, W, H); X.clip();
  X.save(); X.translate(-cam.x, -cam.y); drawWorld(t); X.restore();
  bloom();
  X.textBaseline = 'alphabetic';
  txt('// ' + codeLabel, W - 14, H - 8, 9, PAL.teal, MONO, 'right', .5, false);
  if (mode === 'game' && world.run && world.phase === 'play') drawEdgePips(t);
  if (mode === 'game') drawSmudges(t);
  const wk = mode === 'game' ? worldK() : 1;
  if (wk < 1 && (dil > 0 || [...others.values()].some(o => !o.d && o.tk < 1))) { // time dilation (not the scanner): cold blue wash + halftone vignette
    const k = dil > 0 ? Math.min(1, dil * 4, (T - dilT0) * 5 + .25) : .7;
    X.fillStyle = `rgba(37,112,212,${.12 * k})`; X.fillRect(0, 0, W, H);
    X.globalAlpha = k * (.8 + .1 * Math.sin(t * 4)); X.drawImage(DOTS, 0, 0); X.globalAlpha = 1;
  }
  if (mode === 'game' && me.bwT && T - me.bwT < .6) { // BLACKWALL: the screen tears red for a moment
    const k = 1 - (T - me.bwT) / .6; X.fillStyle = `rgba(104,30,31,${.45 * k})`; X.fillRect(0, 0, W, H);
    for (let i = 0; i < 7; i++) { X.fillStyle = i % 2 ? `rgba(255,62,52,${.35 * k})` : `rgba(0,0,0,${.5 * k})`; X.fillRect(rand(-40, W * .4), rand(0, H), rand(W * .3, W), rand(2, 14)); }
  }
  if (mode === 'game' && me.osT > 0 && me.cw.os === 'berserk') { const g = X.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, W * .6); g.addColorStop(0, 'rgba(255,62,52,0)'); g.addColorStop(1, 'rgba(255,62,52,.18)'); X.fillStyle = g; X.fillRect(0, 0, W, H); }
  if (mode === 'game' && world.phase === 'play' && me.hp === 1 && me.mh > 1 && !me.down) { // low HP: heartbeat vignette
    const beat = Math.max(0, Math.sin(T * 6.4)) ** 6, g = X.createRadialGradient(W / 2, H / 2, H * .4, W / 2, H / 2, W * .7);
    g.addColorStop(0, 'rgba(104,30,31,0)'); g.addColorStop(1, `rgba(104,30,31,${.35 + .25 * beat})`); X.fillStyle = g; X.fillRect(0, 0, W, H);
  }
  if (mode === 'game' && mouse.seen > 0 && !touchMode && world.phase === 'play' && !paused) { // reticle (the OS cursor is hidden)
    X.strokeStyle = PAL.cyan; X.lineWidth = 2; X.shadowColor = hexA(PAL.cyan, .5); X.shadowBlur = 6 * scale; X.beginPath();
    for (const [a, b, c, d] of [[-16, 0, -6, 0], [6, 0, 16, 0], [0, -16, 0, -6], [0, 6, 0, 16]]) { X.moveTo(mouse.x + a, mouse.y + b); X.lineTo(mouse.x + c, mouse.y + d); }
    X.stroke(); X.shadowBlur = 0; X.fillStyle = PAL.cyan; X.fillRect(mouse.x - 1, mouse.y - 1, 2, 2);
  }
  if (flash > 0 && SET.flash) { X.fillStyle = `rgba(${flashCol},${Math.min(1, flash) * .3})`; X.fillRect(0, 0, W, H); }
  const rebooting = mode === 'game' && world.bugs.find(b => b.type === 'boss' && !b.dead && bossDef(b).ai === 'bsod' && b.aux > 0);
  if (rebooting) { X.fillStyle = `rgba(37,112,212,${.12 + .06 * Math.sin(t * 6)})`; X.fillRect(0, 0, W, H); } // the whole screen goes a bit blue
  X.drawImage(VIG, 0, 0);
  if (mode === 'menu') {
    const g = X.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(55,23,29,.55)'); g.addColorStop(.5, 'rgba(11,15,23,.45)'); g.addColorStop(1, 'rgba(6,14,20,.75)');
    X.fillStyle = g; X.fillRect(0, 0, W, H);
    logo(t, 118); txt('// the codebase is rotting. patch it before it ships.', W / 2, 182, 15, PAL.label, MONO);
  } else if (world.phase === 'wait') txt('CONNECTING TO ROOM ' + roomCode + '…', W / 2, H / 2, 26, PAL.red, DISP, 'center', .6 + .4 * Math.sin(t * 5));
  else {
    if (!paused && world.phase !== 'over') { uiA = me.scan ? .5 : 1; X.globalAlpha = uiA; drawHUD(t); uiA = 1; X.globalAlpha = 1; if (me.scan) drawScan(t); }
    drawTouch(t); drawUpgrades(t);
    if (banner) drawBanner();
    if (world.phase === 'over') drawOver(t);
    else if (paused) drawPause();
  }
  X.restore();
  C.classList.toggle('play', mode === 'game' && world.phase === 'play' && !paused);
  // post fx in device pixels: RGB split + glitch slices
  X.setTransform(1, 0, 0, 1, 0, 0);
  if (!SET.glitch) return;
  if (chroma > 0) {
    X.globalCompositeOperation = 'screen'; X.globalAlpha = Math.min(.5, chroma * .4);
    const o = 8 * chroma * scale; X.drawImage(C, o, 0); X.drawImage(C, -o, 0);
    X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  }
  if (glitch > 0) for (let i = 0; i < 1 + glitch * 6; i++) {
    const h = rand(4, 40) * scale, y = rand(0, C.height - h);
    X.drawImage(C, 0, y, C.width, h, rand(-30, 30) * glitch * scale, y, C.width, h);
  }
}
