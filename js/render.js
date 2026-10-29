'use strict';
// All drawing. The arena is a fixed 1280x720 logical canvas, letterboxed to the window.

const mkLayer = (w, h, f) => { const o = document.createElement('canvas'); o.width = w; o.height = h; f(o.getContext('2d')); return o; };
const BG = mkLayer(W, H, g => {
  g.fillStyle = PAL.bg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(62,240,255,.025)'; g.fillRect(0, 0, CELL * 3.5, H); // line-number gutter
  g.strokeStyle = 'rgba(111,105,201,.09)'; g.lineWidth = 1;
  for (let x = 0; x <= W; x += CELL) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, H); g.stroke(); }
  for (let y = 0; y <= H; y += CELL) { g.beginPath(); g.moveTo(0, y + .5); g.lineTo(W, y + .5); g.stroke(); }
});
const VIG = mkLayer(W, H, g => {
  const gr = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .72);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.7)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(0,0,0,.16)'; for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
});
const RAIN = Array.from({ length: 26 }, () => ({ x: rand(0, W), y: rand(-H, H), sp: rand(60, 160), len: 6 + (Math.random() * 10 | 0) }));

function txt(s, x, y, size, col, font = DISP, align = 'center', alpha = 1) {
  X.globalAlpha = alpha; X.font = size + 'px ' + font; X.textAlign = align; X.fillStyle = col; X.fillText(s, x, y); X.globalAlpha = 1;
}
function button(x, y, w, h, label, col, fn, hot) {
  X.fillStyle = hot ? col : 'rgba(12,10,32,.9)'; X.fillRect(x, y, w, h);
  X.strokeStyle = col; X.lineWidth = 2; X.strokeRect(x + 1, y + 1, w - 2, h - 2);
  txt(label, x + w / 2, y + h / 2 + 6, 16, hot ? '#020108' : col);
  uiButtons.push({ x, y, w, h, fn });
}
function meter(x, y, w, frac, fill, glow) {
  X.fillStyle = 'rgba(255,255,255,.1)'; X.fillRect(x, y, w, 8);
  X.fillStyle = fill; X.fillRect(x, y, w * clamp(frac, 0, 1), 8);
  if (glow) { X.shadowColor = glow; X.shadowBlur = 18; X.strokeStyle = glow; X.lineWidth = 2; X.strokeRect(x - 3, y - 3, w + 6, 14); X.shadowBlur = 0; }
}

// ---------- arena ----------
function drawGrid(t) {
  X.drawImage(BG, 0, 0);
  X.font = '18px ' + MONO; X.textAlign = 'center'; X.textBaseline = 'middle';
  for (const d of RAIN) for (let i = 0; i < d.len; i++) {
    X.fillStyle = i === 0 ? 'rgba(200,196,255,.22)' : `rgba(111,105,201,${.12 * (1 - i / d.len)})`;
    X.fillText(BITS[(i * 7 + (d.y / 18 | 0)) % BITS.length], d.x, d.y - i * 18);
  }
  X.font = '20px ' + MONO;
  const tick = Math.floor(t * 8);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const k = r * COLS + c, v = rot[k], x = c * CELL, y = r * CELL;
    if (v > .04) {
      X.fillStyle = `rgba(138,31,92,${v * .55})`; X.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      if (v > .9) { X.fillStyle = `rgba(255,122,47,${.1 + .08 * Math.sin(t * 5 + k)})`; X.fillRect(x + 1, y + 1, CELL - 2, CELL - 2); }
    }
    let ch = CH[k];
    if (v > .55 && (k * 7 + tick) % 5 < 2) ch = GL[(k + tick) % GL.length];
    if (ch === ' ') continue;
    X.fillStyle = v > .3 ? `rgba(255,${150 - v * 70 | 0},${90 - v * 40 | 0},${.45 + v * .5})` : c < 3 ? 'rgba(62,240,255,.25)' : 'rgba(140,132,235,.42)';
    X.fillText(ch, x + CELL / 2 + (v > .7 ? rand(-1.5, 1.5) : 0), y + CELL / 2 + 1);
  }
  for (const d of world.dep) { // LEGACY KERNEL: deprecated tiles, warning then burning
    const x = (d.k % COLS) * CELL, y = (d.k / COLS | 0) * CELL, burn = d.t <= 4;
    if (burn) {
      X.fillStyle = `rgba(255,${60 + 40 * Math.sin(t * 12 + d.k) | 0},40,${.55 + .15 * Math.sin(t * 9 + d.k)})`; X.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
      X.fillStyle = 'rgba(255,210,63,.9)'; X.font = '16px ' + MONO; X.fillText(GL[(d.k + (t * 10 | 0)) % GL.length], x + CELL / 2, y + CELL / 2);
    } else if (Math.floor(t * 6) % 2) {
      X.strokeStyle = PAL.red; X.lineWidth = 2; X.strokeRect(x + 3, y + 3, CELL - 6, CELL - 6);
      X.fillStyle = PAL.red; X.font = '9px ' + MONO; X.fillText('DEPR', x + CELL / 2, y + CELL / 2);
    }
  }
  txt('// ' + codeLabel, W - 14, H - 54, 12, PAL.dim, MONO, 'right', .5);
}

// ---------- enemies ----------
function eyes(r, a, col = '#fff', angry) {
  X.fillStyle = col;
  for (const s of [-1, 1]) {
    const ex = Math.cos(a) * r * .28 - Math.sin(a) * r * .26 * s, ey = Math.sin(a) * r * .28 + Math.cos(a) * r * .26 * s;
    X.beginPath(); X.arc(ex, ey, r * .15, 0, 7); X.fill();
    if (angry) { X.strokeStyle = col; X.lineWidth = 2; X.beginPath(); X.moveTo(ex - r * .2, ey - r * .25 * s); X.lineTo(ex + r * .2, ey - r * .1 * s); X.stroke(); }
  }
}
function drawLoot(x, y, col, label, tip, t) {
  X.save(); X.translate(x, y + Math.sin(t * 4 + x) * 4); X.rotate(t * 2);
  X.shadowColor = col; X.shadowBlur = 22; X.strokeStyle = col; X.lineWidth = 3; X.strokeRect(-12, -12, 24, 24);
  X.fillStyle = col; X.fillRect(-5, -5, 10, 10); X.restore();
  txt(label, x, y + 30, 10, col); if (tip) txt(tip, x, y + 42, 9, col, MONO, 'center', .7);
}
function drawBug(b, t) {
  const D = BUG[b.type], r = b.r, a = Math.atan2(b.vy, b.vx), flash = b.hit > 0;
  if (b.type === 'trojan' && !b.rev) return drawLoot(b.x, b.y, PAL.gold, 'FREE RAM?', 'totally safe', t);
  if (b.type === 'boss') return drawBoss(b, t);
  if (D.part) return drawPart(b, t);
  if (b.type === 'lock' || b.type === 'cache' || b.type === 'zombie') return drawElite(b, t);
  X.save(); X.translate(b.x, b.y);
  if (b.type === 'adware') { // a popup window with a face
    X.rotate(Math.sin(t * 3 + b.ph) * .15);
    X.shadowColor = D.col; X.shadowBlur = 18; X.fillStyle = flash ? '#fff' : '#2a0b2a'; X.fillRect(-r, -r * .8, r * 2, r * 1.6);
    X.shadowBlur = 0; X.fillStyle = D.col; X.fillRect(-r, -r * .8, r * 2, 7);
    X.strokeStyle = D.col; X.lineWidth = 2; X.strokeRect(-r, -r * .8, r * 2, r * 1.6);
    X.fillStyle = '#fff'; X.fillRect(r - 6, -r * .8 + 1, 5, 5);
    txt('AD', 0, r * .55, 9, D.col);
    X.translate(0, -2); eyes(r * .9, 0, '#fff', true);
  } else if (b.type === 'leak') { // wobbling puddle
    X.globalAlpha = .85; X.fillStyle = flash ? '#fff' : D.col; X.shadowColor = D.col; X.shadowBlur = 20;
    X.beginPath();
    for (let i = 0; i <= 16; i++) { const aa = i / 16 * 6.283, rr = r * (1 + .12 * Math.sin(aa * 3 + t * 4 + b.ph)); X.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
    X.fill(); X.shadowBlur = 0; X.globalAlpha = 1;
    X.fillStyle = 'rgba(2,20,40,.6)'; X.beginPath(); X.arc(0, 0, r * .55, 0, 7); X.fill();
    eyes(r, a);
  } else {
    X.strokeStyle = D.col; X.lineWidth = b.type === 'seg' ? 3 : 2; X.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const la = a + Math.PI / 2 * (i < 3 ? 1 : -1) + (i % 3 - 1) * .55, wig = Math.sin(t * 18 + i + b.ph) * .25;
      X.beginPath(); X.moveTo(Math.cos(la) * r * .6, Math.sin(la) * r * .6); X.lineTo(Math.cos(la + wig) * r * 1.45, Math.sin(la + wig) * r * 1.45); X.stroke();
    }
    const pulse = 1 + Math.sin(t * 8 + b.ph) * .06;
    X.shadowColor = D.col; X.shadowBlur = 18; X.fillStyle = flash ? '#fff' : D.col;
    X.beginPath(); X.arc(0, 0, r * pulse, 0, 7); X.fill(); X.shadowBlur = 0;
    X.fillStyle = '#1a0614'; X.beginPath(); X.arc(0, 0, r * .62, 0, 7); X.fill();
    if (b.type === 'fork' || b.type === 'forklet') { txt('&', 0, r * .3, r, D.col, MONO); }
    if (b.type === 'trojan') { X.fillStyle = D.col; for (const s of [-1, 1]) { X.beginPath(); X.moveTo(s * r * .4, -r * .7); X.lineTo(s * r * .9, -r * 1.5); X.lineTo(s * r * .1, -r * .9); X.fill(); } }
    eyes(r, a, '#fff', b.type === 'trojan');
  }
  X.restore();
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
    poly(6, r); X.fillStyle = hit ? '#fff' : '#2a1606'; X.fill(); X.lineWidth = 3; X.strokeStyle = col; X.stroke(); X.shadowBlur = 0;
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
      X.fillStyle = `rgba(122,168,255,${.15 + .15 * Math.sin(t * 20)})`; X.fillRect(cx - CELL / 2, cy - CELL / 2, CELL, CELL); X.globalAlpha = 1;
    }
    const ay = t * 2.1 + b.ph, ax = t * 1.4, s = r * .85;
    const P = CUBE.map(([x, y, z]) => {
      const x1 = x * Math.cos(ay) - z * Math.sin(ay), z1 = x * Math.sin(ay) + z * Math.cos(ay), y1 = y * Math.cos(ax) - z1 * Math.sin(ax), z2 = y * Math.sin(ax) + z1 * Math.cos(ax);
      const k = 3 / (3.4 + z2); return [x1 * s * k, y1 * s * k];
    });
    X.save(); X.translate(b.x, b.y); X.globalCompositeOperation = 'lighter'; X.globalAlpha = phasing ? .25 + .25 * Math.random() : 1;
    const jit = phasing || Math.random() < .08 ? 5 : 2;
    for (const [c, dx] of [['#ff3b5c', -jit], ['#3ef0ff', jit], [hit ? '#fff' : D.col, 0]]) {
      X.strokeStyle = c; X.lineWidth = dx ? 1.5 : 2.5; X.beginPath();
      for (const [i, j] of CUBE_E) { X.moveTo(P[i][0] + dx, P[i][1]); X.lineTo(P[j][0] + dx, P[j][1]); } X.stroke();
    }
    X.fillStyle = '#fff'; X.shadowColor = D.col; X.shadowBlur = 16; X.fillRect(-4, -4, 8, 8); X.shadowBlur = 0;
    X.restore(); X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  } else if (b.aux > 0) { // ZOMBIE grave: tombstone, a hand clawing out as the timer runs down
    const k = 1 - clamp(b.aux / 4, 0, 1);
    X.save(); X.translate(b.x, b.y);
    X.fillStyle = '#16221a'; X.strokeStyle = D.col; X.lineWidth = 2;
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
    X.shadowColor = D.col; X.shadowBlur = 20; X.fillStyle = hit ? '#fff' : '#0f1d12'; X.fillRect(-w / 2, -h / 2, w, h); X.shadowBlur = 0;
    X.fillStyle = '#4b6b47'; X.fillRect(-w / 2, -h / 2, w, 7);
    X.strokeStyle = D.col; X.lineWidth = 2; X.beginPath(); // ragged frame with a bite out of one corner
    X.moveTo(-w / 2, -h / 2); X.lineTo(w / 2 - 12, -h / 2); X.lineTo(w / 2 - 6, -h / 2 + 7); X.lineTo(w / 2, -h / 2 + 4); X.lineTo(w / 2, h / 2); X.lineTo(-w / 2, h / 2); X.closePath(); X.stroke();
    X.strokeStyle = 'rgba(159,216,154,.5)'; X.lineWidth = 1; X.beginPath(); X.moveTo(-w * .2, -h / 2 + 7); X.lineTo(-w * .05, 0); X.lineTo(-w * .15, h * .2); X.stroke();
    for (const sd of [-1, 1]) { X.fillStyle = D.col; X.shadowColor = D.col; X.shadowBlur = 10; X.fillRect(sd * w * .2 - 6, -2 + (sd > 0 ? 3 : 0), 12, 4); }
    X.shadowBlur = 0; X.fillStyle = D.col; for (let i = 0; i < 6; i++) X.fillRect(-w * .25 + i * w * .1, h * .22 + (i % 2) * 3, w * .06, 4);
    for (let i = 0; i < 4; i++) { const dx = -w / 2 + 8 + i * (w - 16) / 3, len = 6 + 10 * ((t * .8 + i * .37 + b.ph) % 1); X.fillRect(dx, h / 2, 3, len); }
    X.restore();
    if (feeding) for (let i = 0; i < 3; i++) { const f = (t * .9 + i / 3) % 1; txt('+', b.x - 16 + i * 16, b.y - r - 4 - f * 24, 14, '#5dffa8', DISP, 'center', 1 - f); }
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
    X.strokeStyle = `rgba(143,227,255,${.35 + .2 * Math.sin(t * 4)})`; X.lineWidth = 3; X.shadowColor = PAL.ice; X.shadowBlur = 16;
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
  X.fillStyle = hit ? '#fff' : '#14040e'; X.beginPath(); X.arc(0, 0, r * .62, 0, 7); X.fill();
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
  X.shadowColor = rage && Math.sin(t * 10) > 0 ? PAL.red : '#c08bff'; X.shadowBlur = 26;
  X.fillStyle = hit ? '#fff' : '#d8d0b8'; X.fillRect(-w / 2, -h / 2, w, h); X.shadowBlur = 0;
  X.fillStyle = '#bdb49a'; X.fillRect(-w * .25, h / 2, w * .5, 14); X.fillRect(-w * .38, h / 2 + 14, w * .76, 7);
  X.fillStyle = '#0a1a0a'; X.fillRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 26);
  X.font = '10px ' + MONO; X.textAlign = 'left'; X.textBaseline = 'alphabetic'; X.fillStyle = '#5dffa8';
  ['> kernel panic', '> legacy=true', '> sys_call 0x1F'].forEach((s, i) => X.fillText(s.slice(0, Math.max(0, Math.floor(t * 8) % 26 - i * 4)), -w / 2 + 16, -h / 2 + 26 + i * 13));
  const ea = aimAt(b, t);
  for (const s of [-1, 1]) { X.fillStyle = '#5dffa8'; X.fillRect(s * 22 - 7 + Math.cos(ea) * 4, 12 + Math.sin(ea) * 3, 14, 10); }
  X.fillStyle = 'rgba(0,0,0,.25)'; for (let y = -h / 2 + 10; y < h / 2 - 16; y += 3) X.fillRect(-w / 2 + 10, y, w - 20, 1);
  X.fillStyle = '#c08bff'; X.beginPath(); X.arc(w / 2 - 16, h / 2 - 9, 3, 0, 7); X.fill();
  X.restore();
}
// BLUE SCREEN: a crash window; the QR code is a separate part
function drawBsod(b, t) {
  const w = 300, h = 160, x = b.x - w / 2, y = b.y - h / 2, rb = b.aux > 0;
  X.shadowColor = '#3d7bff'; X.shadowBlur = 24; X.fillStyle = b.hit > 0 ? '#3d6bdf' : '#0d2a8a'; X.fillRect(x, y, w, h); X.shadowBlur = 0;
  X.strokeStyle = b.stn > 0 ? PAL.gold : '#3d7bff'; X.lineWidth = 3; X.strokeRect(x, y, w, h);
  txt(':(', x + 20, y + 62, 46, '#fff', 'sans-serif', 'left');
  txt('Your arena ran into a problem', x + 20, y + 96, 12, '#fff', 'sans-serif', 'left');
  txt(rb ? Math.floor(b.aux) + '% rebooting' : b.stn > 0 ? 'REBOOT FAILED' : 'collecting error info', x + 20, y + 118, 12, rb ? PAL.gold : '#b5d4f4', 'sans-serif', 'left');
  if (rb) { X.fillStyle = 'rgba(255,255,255,.2)'; X.fillRect(x + 20, y + 132, 140, 8); X.fillStyle = PAL.gold; X.fillRect(x + 20, y + 132, 140 * b.aux / 100, 8); }
}
// INFINITE LOOP: chrome code-serpent. Neon trail, { } vertebrae with a light pulse, skull head, ∞ halo
function drawLoop(b, t) {
  const body = partsOf(b, 'body').sort((p, q) => p.id - q.id), pts = [b, ...body];
  X.lineCap = 'round'; X.lineJoin = 'round';
  [['rgba(93,255,168,.1)', 34], ['rgba(62,240,255,.16)', 20], ['rgba(255,255,255,.22)', 4]].forEach(([c, lw]) => {
    X.strokeStyle = c; X.lineWidth = lw; X.beginPath(); pts.forEach((p, i) => i ? X.lineTo(p.x, p.y) : X.moveTo(p.x, p.y)); X.stroke();
  });
  for (let i = body.length - 1; i >= 0; i--) {
    const p = body[i], q = pts[i], ang = Math.atan2(q.y - p.y, q.x - p.x), wave = Math.sin(t * 8 - i * .5), sz = 13 - i * .18;
    X.save(); X.translate(p.x, p.y); X.rotate(ang);
    X.fillStyle = p.hit > 0 ? '#fff' : '#0e1a1f'; X.strokeStyle = wave > .6 ? '#fff' : '#5dffa8'; X.lineWidth = 1.5;
    X.shadowColor = '#5dffa8'; X.shadowBlur = wave > .6 ? 18 : 6;
    X.beginPath(); X.moveTo(sz, 0); X.lineTo(0, -sz); X.lineTo(-sz, 0); X.lineTo(0, sz); X.closePath(); X.fill(); X.stroke(); X.shadowBlur = 0;
    X.strokeStyle = 'rgba(62,240,255,.6)'; X.lineWidth = 1; X.beginPath(); X.moveTo(0, -sz); X.lineTo(-5, -sz - 8); X.moveTo(0, sz); X.lineTo(-5, sz + 8); X.stroke();
    X.restore();
    txt(i % 2 ? '{' : '}', p.x, p.y + 1, Math.max(9, sz), wave > .6 ? '#fff' : '#3ef0ff', MONO);
  }
  const ha = Math.atan2(b.vy, b.vx), jaw = .35 + .25 * Math.sin(t * 6);
  X.save(); X.translate(b.x, b.y); X.rotate(ha);
  X.shadowColor = '#5dffa8'; X.shadowBlur = 24; X.fillStyle = b.hit > 0 ? '#fff' : '#c9d6dc';
  X.beginPath(); X.moveTo(28, 0); X.lineTo(9, -17); X.lineTo(-15, -13); X.lineTo(-20, 0); X.lineTo(-15, 13); X.lineTo(9, 17); X.closePath(); X.fill(); X.shadowBlur = 0;
  X.fillStyle = '#5dffa8';
  for (const s of [-1, 1]) { X.save(); X.rotate(s * jaw); X.beginPath(); X.moveTo(19, s * 7); X.lineTo(44, s * 15); X.lineTo(21, s * 15); X.closePath(); X.fill(); X.restore(); }
  X.fillStyle = '#0b0a1f'; X.fillRect(-9, -7, 20, 14);
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
  X.fillStyle = hit ? '#fff' : '#1b1820';
  X.beginPath(); X.moveTo(0, -118); X.bezierCurveTo(34, -96, 40, -40, 38, 62); X.lineTo(-38, 62); X.bezierCurveTo(-40, -40, -34, -96, 0, -118); X.fill(); X.shadowBlur = 0;
  X.strokeStyle = '#4a4152'; X.lineWidth = 1.5; for (const yy of [-70, -30, 10, 40]) { X.beginPath(); X.moveTo(-36, yy); X.lineTo(36, yy); X.stroke(); }
  X.fillStyle = PAL.gold; for (let i = -4; i < 4; i++) { X.beginPath(); X.moveTo(i * 10, 46); X.lineTo(i * 10 + 6, 46); X.lineTo(i * 10 + 12, 56); X.lineTo(i * 10 + 6, 56); X.fill(); }
  for (const sd of [-1, 1]) { X.fillStyle = '#2a2430'; X.beginPath(); X.moveTo(sd * 36, 10); X.lineTo(sd * 70, 70); X.lineTo(sd * 36, 58); X.fill(); X.strokeStyle = PAL.red; X.lineWidth = 1.5; X.stroke(); }
  const v = .5 + .5 * Math.sin(t * (crit ? 14 : 5));
  X.strokeStyle = `rgba(255,59,92,${.4 + .6 * v})`; X.lineWidth = 2; for (const sd of [-1, 1]) { X.beginPath(); X.moveTo(sd * 14, -60); X.lineTo(sd * 22, -20); X.lineTo(sd * 16, 20); X.stroke(); }
  X.fillStyle = PAL.red; X.shadowColor = PAL.red; X.shadowBlur = 26; X.beginPath(); X.ellipse(0, -84, 12, 7 + 3 * v, 0, 0, 7); X.fill();
  X.fillStyle = '#fff'; X.beginPath(); X.arc(Math.sin(t) * 4, -84, 3, 0, 7); X.fill(); X.shadowBlur = 0;
  X.restore();
}
function drawDeploy(b, t) {
  const s = b.r / 52, crit = b.aux < 15, cx = b.x, cy = b.y;
  X.save(); X.translate(cx, cy + 10 * s); X.rotate(t * .6);
  for (let i = 0; i < 24; i++) { X.rotate(6.283 / 24); X.fillStyle = i % 2 ? PAL.gold : '#1a1206'; X.beginPath(); X.moveTo(118 * s, -8 * s); X.lineTo(132 * s, 0); X.lineTo(118 * s, 8 * s); X.lineTo(124 * s, 0); X.fill(); }
  X.restore();
  for (let i = 0; i < 4; i++) { const yy = cy + 70 * s + ((t * 60 + i * 30) % 60); X.fillStyle = `rgba(120,110,130,${.3 - (yy - cy - 70 * s) / 220})`; X.beginPath(); X.arc(cx + Math.sin(i * 2 + t) * 22, yy, 12 + i * 2, 0, 7); X.fill(); }
  warhead(cx, cy, s, t, crit, b.hit > 0);
  X.fillStyle = '#0b0a12'; X.fillRect(cx - 26, cy - 14 * s - 9, 52, 20);
  txt('T-' + String(Math.max(0, Math.ceil(b.aux))).padStart(2, '0'), cx, cy - 14 * s + 7, 14, crit && Math.floor(t * 6) % 2 ? '#fff' : PAL.red, MONO);
  if (b.stn > 0) txt('ARMOR DOWN', cx, cy + 80 * s, 12, PAL.gold);
}
// boss parts
function drawPart(p, t) {
  const b = parentOf(p), D = BUG[p.type], hit = p.hit > 0;
  if (p.type === 'body') return; // drawn with the Infinite Loop
  if (p.type === 'pillar') {
    if (b) { X.strokeStyle = `rgba(255,122,47,${.4 + .3 * Math.sin(t * 6 + p.slot)})`; X.lineWidth = 2; X.setLineDash([6, 6]); X.beginPath(); X.moveTo(p.x, p.y); X.lineTo(b.x, b.y); X.stroke(); X.setLineDash([]); }
    X.shadowColor = D.col; X.shadowBlur = 14; X.fillStyle = hit ? '#fff' : '#2a1406'; X.fillRect(p.x - 15, p.y - 20, 30, 40); X.shadowBlur = 0;
    X.strokeStyle = D.col; X.lineWidth = 2; X.strokeRect(p.x - 15, p.y - 20, 30, 40);
    txt('dep', p.x, p.y + 1, 10, D.col, MONO);
    X.fillStyle = 'rgba(0,0,0,.5)'; X.fillRect(p.x - 15, p.y + 24, 30, 4); X.fillStyle = D.col; X.fillRect(p.x - 15, p.y + 24, 30 * clamp(p.hp / p.mhp, 0, 1), 4);
  } else if (p.type === 'qr') {
    const s = 64, x = p.x - s / 2, y = p.y - s / 2, hot = Math.floor(t * 4) % 2;
    X.fillStyle = hit ? PAL.gold : '#fff'; X.fillRect(x, y, s, s); X.fillStyle = '#0d2a8a';
    for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if ((i * 3 + j * 5 + i * j) % 3 === 0) X.fillRect(x + 4 + i * 8.4, y + 4 + j * 8.4, 7, 7);
    X.strokeStyle = hot ? PAL.gold : PAL.red; X.lineWidth = 3; X.strokeRect(x - 5, y - 5, s + 10, s + 10);
    txt('WEAK POINT', p.x, y + s + 18, 10, PAL.gold);
  } else if (p.type === 'arm') {
    if (b) {
      X.lineCap = 'round'; X.strokeStyle = D.col; X.lineWidth = 7; X.shadowColor = PAL.gold; X.shadowBlur = 12; X.beginPath(); X.moveTo(b.x, b.y);
      for (let s = 1; s <= 16; s++) { const f = s / 16; X.lineTo(b.x + (p.x - b.x) * f + Math.sin(s + t * 6 + p.slot) * 8 * (1 - f * .5), b.y + (p.y - b.y) * f + Math.cos(s + t * 5) * 6 * (1 - f * .5)); }
      X.stroke(); X.shadowBlur = 0;
    }
    X.fillStyle = hit ? '#fff' : '#ffe066'; X.beginPath(); X.arc(p.x, p.y, 11, 0, 7); X.fill();
    X.strokeStyle = '#8a2a1a'; X.lineWidth = 2; X.beginPath(); X.arc(p.x, p.y, 6, t * 4, t * 4 + 4); X.stroke();
  } else if (p.type === 'pod') {
    if (b) { X.strokeStyle = '#3a3340'; X.lineWidth = 5; X.beginPath(); X.moveTo(b.x + (p.x - b.x) * .35, b.y + (p.y - b.y) * .35); X.lineTo(p.x, p.y); X.stroke(); }
    const tgt = nearest(p, livePlayers());
    if (tgt) { const a = Math.atan2(tgt.y - p.y, tgt.x - p.x); X.strokeStyle = 'rgba(255,59,92,.4)'; X.lineWidth = 1; X.beginPath(); X.moveTo(p.x, p.y); X.lineTo(p.x + Math.cos(a) * 900, p.y + Math.sin(a) * 900); X.stroke(); }
    X.fillStyle = hit ? '#fff' : '#16121c'; X.beginPath(); X.arc(p.x, p.y, 14, 0, 7); X.fill();
    X.strokeStyle = PAL.red; X.lineWidth = 2.5; X.shadowColor = PAL.red; X.shadowBlur = 10; X.stroke(); X.shadowBlur = 0;
    txt('CI', p.x, p.y + 1, 9, PAL.red, MONO);
    X.fillStyle = 'rgba(0,0,0,.5)'; X.fillRect(p.x - 14, p.y + 18, 28, 3); X.fillStyle = PAL.red; X.fillRect(p.x - 14, p.y + 18, 28 * clamp(p.hp / p.mhp, 0, 1), 3);
  } else if (p.type === 'holo') {
    const s = (b ? b.r : 46) / 52;
    warhead(p.x + rand(-2, 2), p.y, s, t, false, false, .2 + .15 * Math.random());
    txt('T-' + String(Math.max(0, Math.ceil(b ? b.aux : 60))).padStart(2, '0'), p.x, p.y - 14 * s + 7, 14, 'rgba(255,59,92,.5)', MONO);
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
      d.tiles.push({ x, y, vx: (x - b.x) * rand(2, 4) + rand(-60, 60), vy: (y - b.y) * rand(2, 4) - rand(150, 380), rot: 0, vr: rand(-6, 6), c: pick(['#0d2a8a', '#1d4ad0', '#3d7bff', '#0d2a8a', '#b5d4f4']) });
    }
  }
  if (ai === 'loop') d.segs = [{ x: b.x, y: b.y }, ...partsOf(b, 'body').sort((p, q) => p.id - q.id).map(p => ({ x: p.x, y: p.y, dead: false }))];
  if (ai === 'deploy') { d.ry = b.y; d.vy = 0; }
  return d;
}
function finish(d, x = d.x, y = d.y) { // the kill moment every boss death builds to
  d.done = true; d.ft = d.t; hitstop = .18; flash = 1.1; flashCol = '255,240,200'; chroma = 1.2; glitch = .7; shake = 40; boom(1.6, .5);
  discCells(d.x, d.y, 260, k => cleanCell(k, 1)); // the blast scrubs the rot around it
  for (let i = 0; i < 3; i++) ring(x, y, 10 + i * 30, 700 + i * 320, 1, i % 2 ? PAL.white : d.col, 8 - i * 2);
  arp([523, 659, 784, 1047, 1319, 1568], .08, 'triangle', .08);
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
      if (!d.n && t > .35) { d.n = 1; sfx(900, .55, 'sine', .08, 30); }
      if (!d.done && t > .95) { finish(d); burst(d.x, d.y, '#5dffa8', 40, true, 600); burst(d.x, d.y, '#c08bff', 30, true, 500); }
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
      if (!d.done && Math.floor(t * 12) !== Math.floor((t - dt) * 12)) sfx(1200 + t * 1500, .04, 'square', .03);
      if (!d.done && t > .8) { finish(d); burst(d.x, d.y, '#3d7bff', 50, false, 700); }
      if (d.done) for (const p of d.tiles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.rot += p.vr * dt; }
    } else if (d.ai === 'loop') { // the body detonates tail-first, racing up to the head
      const body = d.segs.length - 1;
      while (d.n < body && t > d.n * .07) {
        const s = d.segs[body - d.n]; s.dead = true;
        burst(s.x, s.y, d.n % 2 ? '#fff' : d.col, 10, true, 300); ring(s.x, s.y, 4, 240, .25, d.n % 3 ? d.col : '#3ef0ff', 3);
        sfx(300 + d.n * 25, .06, 'square', .035); shake = Math.max(shake, 6); d.n++;
      }
      if (!d.done && d.n >= body && t > body * .07 + .15) { finish(d); burst(d.x, d.y, d.col, 60, true, 700); }
    } else if (d.ai === 'deploy') { // it launches anyway... and blows up into fireworks
      if (!d.done) {
        d.vy -= 1500 * dt; d.ry += d.vy * dt;
        for (let i = 0; i < 3; i++) parts.push({ x: d.x + rand(-14, 14), y: d.ry + d.r * 1.3, vx: rand(-80, 80), vy: rand(80, 220), life: .7, max: .7, col: pick(['#8a8494', '#5c5866', PAL.rot, PAL.gold]), big: rand(5, 11) });
        if (!d.n) { d.n = 1; sfx(80, 1, 'sawtooth', .07, 900); }
        if (t > 1) { finish(d, d.x, 90); d.n = 0; }
      } else while (d.n < 6 && after > d.n * .17) {
        const x = clamp(d.x + rand(-380, 380), 80, W - 80), y = rand(70, 300), c = PCOL[(d.n * 3) % PCOL.length];
        burst(x, y, c, 40, false, 420); burst(x, y, '#fff', 10, false, 200); ring(x, y, 4, 380, .5, c, 3); boom(.5, .18); d.n++;
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
          X.fillStyle = '#2a1406'; X.fill(); X.strokeStyle = d.col; X.lineWidth = 3; X.shadowColor = d.col; X.shadowBlur = 16; X.stroke(); X.restore();
        }
        X.translate(d.x, d.y); X.globalAlpha = clamp(1 - after / .9, 0, 1); X.strokeStyle = d.col; X.lineWidth = 8; poly(6, 40 + after * 900); X.stroke();
        X.strokeStyle = '#fff'; X.lineWidth = 3; poly(6, 20 + after * 700); X.stroke();
      }
    } else if (d.ai === 'kernel') {
      const w = d.r * 2.5, h = d.r * 1.9, sw = w - 20, sh = h - 26; X.translate(d.x, d.y);
      if (d.t < .7) { // the case fades while the picture collapses
        X.globalAlpha = clamp(1 - (d.t - .35) / .35, 0, 1); X.fillStyle = '#d8d0b8'; X.fillRect(-w / 2, -h / 2, w, h); X.fillStyle = '#bdb49a'; X.fillRect(-w * .25, h / 2, w * .5, 14);
        X.globalAlpha = 1; X.fillStyle = '#0a1a0a'; X.fillRect(-sw / 2, -h / 2 + 10, sw, sh);
        const k = clamp((d.t - .35) / .35, 0, 1), hh = Math.max(3, sh * (1 - k) ** 2);
        X.fillStyle = k ? '#e8fff0' : '#5dffa8'; X.shadowColor = '#5dffa8'; X.shadowBlur = 30; X.globalAlpha = k ? 1 : .35;
        if (!k) for (let i = 0; i < 40; i++) X.fillRect(-sw / 2 + Math.random() * (sw - 6), -h / 2 + 10 + Math.random() * (sh - 3), rand(2, 10), 2); // static
        else X.fillRect(-sw / 2, -h / 2 + 10 + (sh - hh) / 2, sw, hh);
      } else if (!d.done) { // line shrinks to a dot
        const k = (d.t - .7) / .25, lw = Math.max(4, sw * (1 - k));
        X.fillStyle = '#e8fff0'; X.shadowColor = '#5dffa8'; X.shadowBlur = 30; X.fillRect(-lw / 2, -h / 2 + 10 + sh / 2 - 1.5, lw, 3);
      } else {
        X.globalAlpha = fade; X.fillStyle = '#fff'; X.shadowColor = '#5dffa8'; X.shadowBlur = 40; X.beginPath(); X.arc(0, -h / 2 + 10 + sh / 2, 5 * (1 - after / 2.2) + 1, 0, 7); X.fill(); X.shadowBlur = 0;
        const n = after * 34 | 0;
        ['[  OK  ] Stopped Legacy Kernel.', '[  OK  ] Reached target: Power-Off.'].forEach((s, i) => txt(s.slice(0, Math.max(0, n - i * 30)), -150, 60 + i * 18, 13, '#5dffa8', MONO, 'left', fade));
      }
    } else if (d.ai === 'spaghetti') {
      for (const s of d.splats || []) { // sauce on the code
        X.globalAlpha = .75 * fade; X.fillStyle = '#c2271d'; X.beginPath();
        for (let i = 0; i <= 12; i++) { const a = i / 12 * 6.283, rr = s.r * (.7 + .3 * Math.sin(a * 3 + s.s)); X.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr); }
        X.fill(); X.globalAlpha = .5 * fade; X.fillStyle = '#ff6b3d'; X.beginPath(); X.arc(s.x - s.r * .2, s.y - s.r * .2, s.r * .3, 0, 7); X.fill();
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
        X.shadowColor = '#3d7bff'; X.shadowBlur = 30; X.fillStyle = Math.random() < .15 ? '#3d6bdf' : '#0d2a8a'; X.fillRect(x, y, w, h); X.shadowBlur = 0;
        txt(':|', x + 20, y + 62, 46, '#fff', 'sans-serif', 'left'); txt(pct + '% rebooting', x + 20, y + 118, 12, PAL.gold, 'sans-serif', 'left');
        X.fillStyle = 'rgba(255,255,255,.2)'; X.fillRect(x + 20, y + 132, 260, 8); X.fillStyle = PAL.gold; X.fillRect(x + 20, y + 132, 2.6 * pct, 8);
      } else {
        X.globalAlpha = fade;
        for (const p of d.tiles) { X.save(); X.translate(p.x, p.y); X.rotate(p.rot); X.fillStyle = p.c; X.fillRect(-15, -13, 30, 26); X.strokeStyle = '#3d7bff'; X.lineWidth = 1; X.strokeRect(-15, -13, 30, 26); X.restore(); }
        const k = clamp(after / .25, 0, 1); X.globalAlpha = Math.min(k, fade);
        txt(':)', d.x, d.y + 30, 90 + 30 * (1 - k), '#fff', 'sans-serif'); txt('restart successful', d.x, d.y + 64, 14, '#b5d4f4', 'sans-serif');
      }
    } else if (d.ai === 'loop') {
      X.lineCap = 'round';
      const live = d.segs.filter((s, i) => i === 0 || !s.dead);
      if (!d.done) {
        X.strokeStyle = 'rgba(93,255,168,.25)'; X.lineWidth = 16; X.beginPath(); live.forEach((s, i) => i ? X.lineTo(s.x, s.y) : X.moveTo(s.x, s.y)); X.stroke();
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
      } else txt('DEPLOYED TO /dev/null', W / 2, 470, 26, PAL.red, DISP, 'center', Math.min(1, after * 3) * fade);
    }
    X.restore(); X.globalAlpha = 1; X.shadowBlur = 0;
  }
}
function drawShot(s, t) {
  X.save(); X.translate(s.x, s.y);
  if (s.k === 'ad') {
    X.rotate(t * 6); X.shadowColor = BUG.adware.col; X.shadowBlur = 16;
    X.fillStyle = '#2a0b2a'; X.fillRect(-9, -7, 18, 14); X.fillStyle = BUG.adware.col; X.fillRect(-9, -7, 18, 4);
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
  X.shadowColor = '#ffe066'; X.shadowBlur = 14; X.fillStyle = '#ffe066';
  X.beginPath(); X.ellipse(0, 4, 13, 9, 0, 0, 7); X.fill(); X.beginPath(); X.arc(7, -6, 7, 0, 7); X.fill();
  X.shadowBlur = 0; X.fillStyle = '#ff9f43'; X.beginPath(); X.moveTo(13, -6); X.lineTo(20, -4); X.lineTo(13, -2); X.fill();
  X.fillStyle = '#020108'; X.beginPath(); X.arc(9, -8, 1.6, 0, 7); X.fill();
  X.restore();
}
function drawTurret(x, y, t, col = '#5dffa8') {
  X.save(); X.translate(x, y);
  X.fillStyle = 'rgba(93,255,168,.15)'; X.beginPath(); X.arc(0, 0, 18, 0, 7); X.fill();
  X.strokeStyle = col; X.lineWidth = 2; X.shadowColor = col; X.shadowBlur = 14; X.strokeRect(-9, -9, 18, 18);
  X.rotate(t * 4); X.fillStyle = col; X.fillRect(-2, -16, 4, 12); X.restore();
}
function drawPlayer(p, t) {
  X.globalCompositeOperation = 'lighter'; X.fillStyle = p.col;
  if (p.skin === 'binary') { X.font = '14px ' + MONO; X.textAlign = 'center'; }
  p.trail.forEach((q, i) => {
    const f = i / p.trail.length;
    if (p.skin === 'rainbow') X.fillStyle = `hsl(${(t * 240 + i * 25) % 360},100%,60%)`;
    if (p.skin === 'binary') { X.globalAlpha = f * .7; X.fillText((i + (t * 10 | 0)) % 2 ? '1' : '0', q.x, q.y); return; }
    X.globalAlpha = f * (p.skin === 'rainbow' ? .45 : .22); X.beginPath(); X.arc(q.x, q.y, 11 * f, 0, 7); X.fill();
  });
  X.globalAlpha = 1; X.globalCompositeOperation = 'source-over';
  if (p.skin === 'halo' && !p.down) {
    X.save(); X.translate(p.x, p.y); X.rotate(-t * 2); X.strokeStyle = p.col; X.lineWidth = 2; X.shadowColor = p.col; X.shadowBlur = 12;
    X.setLineDash([3, 7]); X.beginPath(); X.arc(0, 0, 21, 0, 7); X.stroke(); X.setLineDash([]); X.restore();
  }
  for (const tu of p.tu || []) drawTurret(tu[0], tu[1], t);
  if (p.down) {
    X.strokeStyle = 'rgba(255,255,255,.25)'; X.lineWidth = 4; X.beginPath(); X.arc(p.x, p.y, 26, 0, 7); X.stroke();
    if (p.rev) { X.strokeStyle = p.col; X.beginPath(); X.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + p.rev / 2 * 6.283); X.stroke(); }
    txt('✕', p.x, p.y + 1, 22, '#8a86b0');
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
    X.save(); X.translate(p.x, p.y); X.rotate(t); X.strokeStyle = '#7aa8ff'; X.lineWidth = 3; X.shadowColor = '#7aa8ff'; X.shadowBlur = 16;
    X.beginPath(); for (let i = 0; i <= 6; i++) { const a = i * Math.PI / 3; X.lineTo(Math.cos(a) * 32, Math.sin(a) * 32); } X.stroke(); X.restore();
  }
  const blink = p.inv > 0 && Math.floor(t * 20) % 2;
  X.save(); X.translate(p.x, p.y); X.globalAlpha = blink ? .35 : 1;
  if (p.sudo) { X.strokeStyle = PAL.gold; X.lineWidth = 2; X.setLineDash([6, 6]); X.lineDashOffset = -t * 40; X.beginPath(); X.arc(0, 0, 25, 0, 7); X.stroke(); X.setLineDash([]); }
  X.rotate(p.a);
  X.shadowColor = p.col; X.shadowBlur = 26; X.fillStyle = p.col;
  X.beginPath(); for (const [px, py] of SHAPES[p.cls] || SHAPES.debugger) X.lineTo(px, py); X.closePath(); X.fill();
  if (p.skin === 'gold') { // gold rim with a moving glint
    const g = X.createLinearGradient(-20, -14, 24, 14), s = (t * .6) % 1;
    g.addColorStop(0, PAL.gold); g.addColorStop(s, '#fff'); g.addColorStop(Math.min(1, s + .15), PAL.gold); g.addColorStop(1, '#b8860b');
    X.strokeStyle = g; X.lineWidth = 3; X.shadowColor = PAL.gold; X.stroke();
  }
  X.shadowBlur = 0; X.fillStyle = '#fff'; X.beginPath(); X.moveTo(11, 0); X.lineTo(-3, -5); X.lineTo(-3, 5); X.fill();
  X.restore();
  txt(p.name, p.x, p.y - 32, 11, p.col, DISP, 'center', p.isMe ? 1 : .85);
  const n = Math.min(10, p.mh), pw = n * 8;
  for (let i = 0; i < n; i++) { X.fillStyle = i < p.hp ? p.col : 'rgba(255,255,255,.15)'; X.fillRect(p.x - pw / 2 + i * 8, p.y + 24, 6, 4); }
}

function drawWorld(t) {
  drawGrid(t);
  for (const w of world.pows) { if (w.taken || (w.t < 3 && Math.floor(t * 8) % 2)) continue; const P = POW[w.type]; drawLoot(w.x, w.y, P.col, P.label, P.tip, t); }
  for (const b of world.bugs) if (!b.dead) drawBug(b, t);
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
  for (const o of others.values()) drawPlayer({ x: o.x, y: o.y, a: o.a, col: o.col, name: o.n, cls: o.cls, hp: o.hp, mh: o.mh, down: o.d, rev: 0, inv: 0, orbit: o.o,
    duck: o.dk, fw: o.fw, sudo: o.sh > CLASSES[o.cls].shots + 1, trail: o.trail, tu: o.tu, skin: o.sk }, t);
  if (world.run) drawPlayer({ x: me.x, y: me.y, a: me.a, col: PCOL[myColor], name: nick, cls: me.cls, hp: me.hp, mh: me.mh, down: me.down, rev: me.rev, inv: me.inv,
    orbit: me.up.orbit, duck: me.pw.duck > 0, fw: me.pw.firewall > 0, sudo: me.pw.sudo > 0, trail: me.trail, tu: turrets.map(t2 => [t2.x, t2.y]), isMe: true, skin: mySkin }, t);
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
  X.shadowColor = hot; X.shadowBlur = 20; X.fillStyle = '#1c0a24'; X.fillRect(x, y, w, h); X.shadowBlur = 0;
  X.fillStyle = hot; X.fillRect(x, y, w, 24);
  X.strokeStyle = hot; X.lineWidth = 3; X.strokeRect(x, y, w, h);
  txt('⚠ ' + (s.trap ? 'IMPORTANT' : 'ALERT'), x + (s.left ? 34 : 10), y + 17, 11, '#1c0a24', DISP, 'left', a);
  const xb = { x: s.left ? x + 6 : x + w - 22, y: y + 5, w: 16, h: 15 };
  X.globalAlpha = a; X.fillStyle = '#1c0a24'; X.fillRect(xb.x, xb.y, xb.w, xb.h);
  txt('x', xb.x + 8, xb.y + 12, 11, hot, DISP, 'center', a);
  const lines = wrapText(s.text, Math.floor((w - 30) / 10));
  lines.slice(0, 2).forEach((l, i) => txt(l, s.x, y + 54 + i * 20 - (lines.length > 1 ? 4 : 0), 14, PAL.white, DISP, 'center', a));
  const ob = { x: s.x - 55, y: y + h - 34, w: 110, h: 24 };
  X.globalAlpha = a; X.fillStyle = hot; X.fillRect(ob.x, ob.y, ob.w, ob.h);
  txt(s.ok, s.x, ob.y + 17, 11, '#1c0a24', DISP, 'center', a);
  X.globalAlpha = 1;
  if (world.phase !== 'play' || paused || popIn < 1) return;
  const pad = 6; // forgiving hit areas so the X is clickable while drifting
  uiButtons.push({ x: xb.x - pad, y: xb.y - pad, w: xb.w + pad * 2, h: xb.h + pad * 2, fn: () => closePopup(s) });
  uiButtons.push({ ...ob, fn: () => closePopup(s, s.trap ? 'trap' : null) });
  if (!touchMode) uiButtons.push({ x, y, w, h, fn: () => sfx(140, .08, 'square', .04) }); // clicking the body just eats your shot
}
function drawSmudges(t) { // ADWARE gunk: rot splats and fake popups covering the screen
  for (const s of smudges) {
    if (s.popup) { drawPopup(s, t); continue; }
    const a = clamp(s.life / 1.5, 0, 1) * .93;
    X.globalAlpha = a;
    {
      X.fillStyle = '#3a0f2c';
      X.beginPath();
      for (let i = 0; i <= 20; i++) { const aa = i / 20 * 6.283, rr = s.r * (.75 + .25 * Math.sin(aa * 5 + s.seed)); X.lineTo(s.x + Math.cos(aa) * rr, s.y + Math.sin(aa) * rr); }
      X.fill();
      X.fillStyle = '#ff7a2f';
      for (let i = 0; i < 5; i++) { const dx = s.x + Math.sin(s.seed + i * 2.1) * s.r * .6, len = 20 + (i * 13 + s.seed * 7) % 40; X.fillRect(dx - 3, s.y + s.r * .5, 6, len * (1 - s.life / s.max + .3)); }
      X.font = '22px ' + MONO; X.textAlign = 'center';
      for (let i = 0; i < 6; i++) X.fillText(GL[(i + (s.seed | 0) + (t * 4 | 0)) % GL.length], s.x + Math.cos(i + s.seed) * s.r * .4, s.y + Math.sin(i * 1.7 + s.seed) * s.r * .4);
    }
  }
  X.globalAlpha = 1;
}

// ---------- HUD ----------
// Top bar 0–60 with two baselines and three columns; bottom strip holds the skill (left) and super (centre) meters.
const L1 = 27, L2 = 47;
function drawHUD(t) {
  X.fillStyle = 'rgba(7,6,26,.82)'; X.fillRect(0, 0, W, 60);
  X.fillStyle = 'rgba(111,105,201,.3)'; X.fillRect(0, 60, W, 1);
  const col = PCOL[myColor], K = CLASSES[me.cls];
  txt(nick, 20, L1, 13, col, DISP, 'left');
  X.font = '13px ' + DISP; const nw = X.measureText(nick).width;
  txt(fmt(me.score), 20 + nw + 14, L1, 20, PAL.white, DISP, 'left');
  for (let i = 0; i < me.mh; i++) { X.fillStyle = i < me.hp ? col : 'rgba(255,255,255,.15)'; X.fillRect(20 + i * 14, L2 - 8, 10, 8); }
  const bits = [];
  if (me.chain >= 5) bits.push('x' + (1 + Math.floor(me.chain / 5)) + ' COMBO');
  for (const k of ['sudo', 'coffee', 'firewall', 'duck']) if (me.pw[k] > 0) bits.push(POW[k].label + ' ' + Math.ceil(me.pw[k]));
  if (me.stress > 0) bits.push('STRESS ' + Math.ceil(me.stress));
  if (me.down) bits.push('DOWN');
  txt(bits.join('  ·  '), 20 + me.mh * 14 + 10, L2, 11, me.down ? PAL.red : PAL.gold, DISP, 'left');
  txt('WAVE ' + world.wave + '  ·  ' + (isBossWave(world.wave) ? 'BOSS FIGHT' : waveName(world.wave)), W / 2, L1, 13, isBossWave(world.wave) ? PAL.red : PAL.white);
  const pct = Math.min(1, rotFrac / ROT_LIMIT), bw = 260, danger = pct > .75;
  meter(W / 2 - bw / 2 - 30, L2 - 8, bw, pct, danger && Math.floor(t * 6) % 2 ? PAL.red : PAL.rot);
  txt('ROT ' + Math.round(pct * 100) + '%', W / 2 + bw / 2 - 18, L2, 11, danger ? PAL.red : PAL.rot, DISP, 'left');
  if (danger) { X.strokeStyle = `rgba(255,59,92,${.3 + .3 * Math.sin(t * 8)})`; X.lineWidth = 8; X.strokeRect(4, 4, W - 8, H - 8); }
  if (online()) {
    txt('ROOM ' + roomCode, W - 20, L1, 13, PAL.white, DISP, 'right');
    if (!isHost && myPing) { X.font = '13px ' + DISP; txt('PING ' + Math.round(myPing) + 'ms · ', W - 20 - X.measureText('ROOM ' + roomCode).width, L1, 11, pingCol(myPing), DISP, 'right'); }
    txt((1 + others.size) + ' DEV' + (others.size ? 'S' : '') + (isHost ? ' · HOST' : '') + ' · ', W - 20 - diffW(), L2, 11, PAL.dim, DISP, 'right');
    txt(dif().name, W - 20, L2, 11, dif().col, DISP, 'right');
    const list = [{ n: nick, s: me.score, col, d: me.down, me: 1 }, ...[...others.values()].map(o => ({ n: o.n, s: o.s, col: o.col, d: o.d, ping: o.ping }))].sort((a, b) => b.s - a.s);
    list.slice(0, 8).forEach((p, i) => {
      const y = 86 + i * 20 + (bossAlive() ? 56 : 0);
      if (isHost && p.ping) txt(Math.round(p.ping) + 'ms', W - 250, y, 10, pingCol(p.ping), MONO, 'right', .8);
      txt((i + 1) + '. ' + p.n + (p.d ? ' (down)' : ''), W - 110, y, 11, p.col, DISP, 'right', p.me ? 1 : .8);
      txt(fmt(p.s), W - 20, y, 11, PAL.white, DISP, 'right', .8);
    });
  } else {
    txt('BEST ' + fmt(best), W - 20, L1, 13, PAL.dim, DISP, 'right');
    txt('ESC PAUSE · ', W - 20 - diffW(), L2, 11, PAL.dim, DISP, 'right', .6);
    txt(dif().name, W - 20, L2, 11, dif().col, DISP, 'right');
  }
  const boss = bossAlive();
  if (world.autoskip && !boss && !world.breakT) {
    const left = world.queue.length ? 'AUTO-SKIP · SPAWNING' : 'AUTO-SKIP · NEXT WAVE IN ' + Math.max(0, Math.ceil(world.waveT)) + 's';
    txt(left, W / 2, 80, 12, world.waveT < 6 && !world.queue.length && Math.floor(t * 4) % 2 ? PAL.red : PAL.gold, DISP, 'center', .85);
  }
  if (boss) {
    const bw2 = 640, x = W / 2 - bw2 / 2;
    const B = BOSSES[boss.kind] || BOSSES[0];
    txt(B.name, W / 2, 84, 13, B.col);
    meter(x, 92, bw2, boss.hp / boss.mhp, boss.hp < boss.mhp * .4 && Math.floor(t * 6) % 2 ? '#fff' : B.col);
    const st = bossStatus(boss);
    txt(st[0], W / 2, 116, 11, st[1], DISP, 'center', .9);
  }
  // bottom-left: class skill
  const sk = clamp(1 - me.skillCd / (K.cd * Math.pow(.8, me.up.skill)), 0, 1), skReady = me.skillCd <= 0;
  txt((touchMode ? '' : 'E  ') + K.skill + (skReady ? '  READY' : '  ' + Math.ceil(me.skillCd) + 's'), 20, H - 36, 11, skReady ? col : PAL.dim, DISP, 'left');
  meter(20, H - 26, 200, sk, col, skReady && .5 + .5 * Math.sin(t * 8) > .5 ? col : null);
  // bottom-centre: class super
  const ready = me.sup >= 100, mw = 280;
  const g = X.createLinearGradient(W / 2 - mw / 2, 0, W / 2 + mw / 2, 0); g.addColorStop(0, '#ff4fd8'); g.addColorStop(1, PAL.gold);
  meter(W / 2 - mw / 2, H - 26, mw, me.superT > 0 ? me.superT / 6 : me.sup / 100, g, ready && .5 + .5 * Math.sin(t * 10) > .3 ? PAL.gold : null);
  txt(me.superT > 0 ? K.sup + ' ACTIVE' : ready ? K.sup + ' READY · ' + (touchMode ? 'TAP SUPER' : 'PRESS Q') : 'SUPER ' + Math.floor(me.sup) + '%', W / 2, H - 36, 11, ready || me.superT > 0 ? PAL.gold : PAL.dim);
  if (me.t < 9 && world.wave === 1 && !touchMode) txt('WASD move · mouse aim · click shoot · Shift dash · E / right-click skill · Q super', W / 2, H - 64, 12, PAL.dim, MONO, 'center', clamp(9 - me.t, 0, 1));
}
const diffW = () => { X.font = '11px ' + DISP; return X.measureText(dif().name).width; };
function bossStatus(b) { // one line under the boss bar telling you what to do right now
  const ai = bossDef(b).ai, stn = b.stn > 0, n = type => partsOf(b, type).length;
  if (ai === 'monolith') return b.aux > 0 ? ['CORE EXPOSED · ' + Math.ceil(b.aux) + 's · HIT IT', PAL.gold] : ['SHIELDED · BREAK THE ' + n('pillar') + ' PILLARS', PAL.ice];
  if (ai === 'kernel') return ['STAY OFF THE DEPRECATED TILES', '#c08bff'];
  if (ai === 'spaghetti') return stn ? ['STUNNED · 2x DAMAGE', PAL.gold] : ['CUT NOODLE ARMS ' + (b.aux | 0) + '/3 · DASH IF GRABBED', BUG.arm.col];
  if (ai === 'bsod') return b.aux > 0 ? ['REBOOTING ' + Math.floor(b.aux) + '% · HIT THE QR CODE!', PAL.gold] : stn ? ['REBOOT FAILED · 2x DAMAGE', PAL.gold] : ['ONLY THE QR CODE TAKES DAMAGE', '#85b7eb'];
  if (ai === 'loop') return ['ONLY THE HEAD TAKES DAMAGE', '#5dffa8'];
  return stn ? ['LAUNCH ABORTED · ARMOR DOWN · 2x DAMAGE', PAL.gold] : ['LAUNCH IN T-' + Math.ceil(b.aux) + ' · BREAK ' + n('pod') + ' CI PODS', PAL.red];
}
const bossAlive = () => world.bugs.find(b => b.type === 'boss' && !b.dead);
function drawUpgrades(t) {
  if (!me.offer || world.phase !== 'play' || paused) return;
  const cw = 236, chh = 96, gap = 14, x0 = W / 2 - (cw * 3 + gap * 2) / 2, y = H - 176;
  txt('PICK AN UPGRADE' + (me.picks > 1 ? ' (' + me.picks + ')' : ''), W / 2, y - 12, 14, PAL.gold, DISP, 'center', .8 + .2 * Math.sin(t * 6));
  me.offer.forEach((k, i) => {
    const x = x0 + i * (cw + gap), lvl = me.up[k];
    X.fillStyle = 'rgba(12,10,32,.92)'; X.fillRect(x, y, cw, chh);
    X.shadowColor = PAL.gold; X.shadowBlur = 12; X.strokeStyle = PAL.gold; X.lineWidth = 2; X.strokeRect(x + 1, y + 1, cw - 2, chh - 2); X.shadowBlur = 0;
    if (!touchMode) txt(String(i + 1), x + 16, y + 26, 13, PAL.dim, DISP, 'center');
    txt(UPG[k][0], x + (touchMode ? 14 : 32), y + 26, 14, PAL.gold, DISP, 'left');
    txt(k === 'battery' ? '+' + Math.round(SUPER_GAIN[lvl + 1] * 100) + '% super charge' : UPG[k][1], x + 14, y + 56, 13, PAL.white, MONO, 'left');
    txt((lvl ? 'LV ' + lvl + ' → ' + (lvl + 1) : 'NEW') + ' / ' + upgCap(me.cls, k), x + 14, y + 82, 11, PAL.dim, DISP, 'left');
    const syn = synFrom(k);
    if (syn) txt('+ ' + SYN[syn].name, x + cw - 12, y + 82, 10, '#ff4fd8', DISP, 'right', .7 + .3 * Math.sin(t * 6));
    uiButtons.push({ x, y, w: cw, h: chh, fn: () => pickUpgrade(i) });
  });
}
function drawTouch(t) {
  if (!touchMode || world.phase !== 'play' || paused) return;
  const base = stickL || { ox: 150, oy: H - 150, x: 150, y: H - 150 };
  X.globalAlpha = stickL ? .5 : .2; X.strokeStyle = PAL.white; X.lineWidth = 3;
  X.beginPath(); X.arc(base.ox, base.oy, 70, 0, 7); X.stroke();
  const dx = base.x - base.ox, dy = base.y - base.oy, d = Math.hypot(dx, dy), m = Math.min(70, d) / (d || 1);
  X.fillStyle = PCOL[myColor]; X.beginPath(); X.arc(base.ox + dx * m, base.oy + dy * m, 30, 0, 7); X.fill();
  if (stickR) { X.globalAlpha = .4; X.beginPath(); X.arc(stickR.ox, stickR.oy, 60, 0, 7); X.stroke(); X.beginPath(); X.arc(stickR.x, stickR.y, 22, 0, 7); X.fill(); }
  else txt('drag here to aim + fire', W * .62, H - 80, 12, PAL.dim, MONO, 'center', .5);
  X.globalAlpha = 1;
  const fill = { super: me.sup / 100, skill: clamp(1 - me.skillCd / CLASSES[me.cls].cd, 0, 1), dash: clamp(1 - me.dashCd / .8, 0, 1) };
  for (const k in TOUCH_BTN) {
    const b = TOUCH_BTN[k], c = k === 'super' ? (fill.super >= 1 ? PAL.gold : '#ff4fd8') : PCOL[myColor], ready = fill[k] >= 1;
    X.fillStyle = ready ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.05)'; X.beginPath(); X.arc(b.x, b.y, b.r, 0, 7); X.fill();
    X.strokeStyle = c; X.lineWidth = 3; X.beginPath(); X.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + 6.283 * fill[k]); X.stroke();
    txt(b.label, b.x, b.y + 5, 12, ready ? PAL.white : c);
  }
}

// ---------- screens ----------
function logo(t, y) {
  const gx = SET.glitch && Math.random() < .06 ? rand(-14, 14) : 0;
  X.font = '700 136px ' + DISP; X.textAlign = 'center';
  X.globalCompositeOperation = 'lighter';
  X.fillStyle = PCOL[0]; X.fillText('CODEROT', W / 2 - 5 + gx, y);
  X.fillStyle = PCOL[1]; X.fillText('CODEROT', W / 2 + 5 - gx, y + 3);
  X.globalCompositeOperation = 'source-over';
  const wc = X.measureText('CODE').width, wr = X.measureText('ROT').width, x0 = W / 2 - (wc + wr) / 2;
  X.textAlign = 'left'; X.fillStyle = PAL.white; X.fillText('CODE', x0, y);
  X.fillStyle = PAL.rot; X.fillText('ROT', x0 + wc, y);
  for (let i = 0; i < 6; i++) {
    const dx = x0 + wc + 14 + i * (wr - 28) / 5, len = 10 + 26 * (Math.sin(t * 1.3 + i * 2.1) + 1);
    X.fillRect(dx, y + 8, 8, len); X.beginPath(); X.arc(dx + 4, y + 8 + len, 5, 0, 7); X.fill();
  }
}
function scoreList() {
  return [{ n: nick, s: me.score, col: PCOL[myColor], cls: me.cls, me: 1 }, ...[...others.values()].map(o => ({ n: o.n, s: o.s, col: o.col, cls: o.cls }))]
    .sort((a, b) => b.s - a.s).slice(0, 8);
}
function drawOver(t) {
  X.fillStyle = 'rgba(5,3,14,.78)'; X.fillRect(0, 0, W, H);
  const gx = Math.random() < .08 ? rand(-10, 10) : 0;
  X.globalCompositeOperation = 'lighter';
  txt('SYSTEM ROTTED', W / 2 - 4 + gx, 150, 84, PCOL[0]); txt('SYSTEM ROTTED', W / 2 + 4 - gx, 152, 84, PCOL[1]);
  X.globalCompositeOperation = 'source-over';
  txt('SYSTEM ROTTED', W / 2, 150, 84, PAL.rot);
  txt('> crashed on wave ' + world.wave + ' (' + waveName(world.wave).toLowerCase() + ') on ' + dif().name.toLowerCase() + (world.autoskip ? ' + auto-skip' : ''), W / 2, 196, 17, PAL.dim, MONO);
  const list = scoreList();
  list.forEach((p, i) => {
    const y = 262 + i * 34;
    if (i === 0 && list.length > 1 && p.s > list[1].s) txt('MVP', W / 2 - 250, y, 16, PAL.gold, DISP, 'left');
    txt(p.n + (p.me ? ' (you)' : ''), W / 2 - 170, y, 18, p.col, DISP, 'left');
    txt(CLASSES[p.cls].name, W / 2 + 60, y, 12, PAL.dim, DISP, 'left');
    txt(fmt(p.s), W / 2 + 250, y, 18, PAL.white, DISP, 'right');
  });
  txt(newBest ? 'NEW PERSONAL BEST!' : 'YOUR BEST ' + fmt(best), W / 2, 262 + list.length * 34 + 16, 15, newBest ? PAL.gold : PAL.dim, DISP, 'center', newBest ? .5 + .5 * Math.sin(t * 8) : 1);
  if (newUnlocks.length) txt('UNLOCKED: ' + newUnlocks.map(s => s.name).join(', ') + ' · pick it in the menu', W / 2, 262 + list.length * 34 + 42, 14, '#ff4fd8', DISP, 'center', .7 + .3 * Math.sin(t * 6));
  if (world.muts.length) txt('mutators: ' + world.muts.map(k => MUTS[k].name.toLowerCase()).join(' + ') + ' · points x' + mutScore().toFixed(2), W / 2, 220, 13, PAL.dim, MONO);
  if (overT > .8) {
    button(W / 2 - 230, H - 120, 220, 56, isHost || !online() ? 'PLAY AGAIN' : 'VOTE RESTART', PCOL[0], restart, true);
    button(W / 2 + 10, H - 120, 220, 56, 'MENU', PCOL[1], () => toMenu());
  }
}
function drawPause() {
  X.fillStyle = 'rgba(5,3,14,.75)'; X.fillRect(0, 0, W, H);
  txt(online() ? 'MENU' : 'PAUSED', W / 2, H / 2 - 80, 64, PAL.white);
  if (online()) txt('ROOM ' + roomCode + ' · the room keeps playing while you are here', W / 2, H / 2 - 40, 14, PAL.dim, MONO);
  if (online() && !isHost) txt(myPing ? 'PING TO HOST ' + Math.round(myPing) + 'ms' + (myPing > 180 ? ' · laggy connection' : '') : 'MEASURING PING…', W / 2, H / 2 - 18, 12, myPing ? pingCol(myPing) : PAL.dim, MONO);
  button(W / 2 - 230, H / 2 - 10, 220, 56, 'RESUME', PCOL[0], () => { paused = false; }, true);
  button(W / 2 + 10, H / 2 - 10, 220, 56, online() ? 'LEAVE ROOM' : 'QUIT', PCOL[1], () => toMenu());
  button(W / 2 - 230, H / 2 + 60, online() ? 220 : 460, 50, 'SETTINGS', PAL.gold, openSettings);
  if (online()) button(W / 2 + 10, H / 2 + 60, 220, 50, copiedT > T ? 'LINK COPIED' : 'COPY INVITE', PCOL[3], copyInvite);
}
function draw(t) {
  uiButtons = [];
  if (!C.width || !C.height) return; // minimized / hidden: drawImage on a 0-size canvas throws and would kill the loop
  X.setTransform(1, 0, 0, 1, 0, 0); X.fillStyle = '#020108'; X.fillRect(0, 0, C.width, C.height);
  const sk = SET.shake ? shake : 0, sx = rand(-1, 1) * sk, sy = rand(-1, 1) * sk;
  X.setTransform(scale, 0, 0, scale, ox + sx * scale, oy + sy * scale);
  X.save(); X.beginPath(); X.rect(0, 0, W, H); X.clip();
  drawWorld(t);
  X.textBaseline = 'alphabetic';
  if (mode === 'game') drawSmudges(t);
  if (mode === 'game' && mouse.seen > 0 && !touchMode && world.phase === 'play' && !paused) { // crosshair (the OS cursor is hidden)
    X.strokeStyle = PCOL[myColor]; X.lineWidth = 2; X.beginPath(); X.arc(mouse.x, mouse.y, 10, 0, 7);
    for (const [a, b, c, d] of [[-16, 0, -6, 0], [6, 0, 16, 0], [0, -16, 0, -6], [0, 6, 0, 16]]) { X.moveTo(mouse.x + a, mouse.y + b); X.lineTo(mouse.x + c, mouse.y + d); }
    X.stroke();
  }
  if (flash > 0 && SET.flash) { X.fillStyle = `rgba(${flashCol},${Math.min(1, flash) * .3})`; X.fillRect(0, 0, W, H); }
  const rebooting = mode === 'game' && world.bugs.find(b => b.type === 'boss' && !b.dead && bossDef(b).ai === 'bsod' && b.aux > 0);
  if (rebooting) { X.fillStyle = `rgba(61,123,255,${.12 + .06 * Math.sin(t * 6)})`; X.fillRect(0, 0, W, H); } // the whole screen goes a bit blue
  X.drawImage(VIG, 0, 0);
  if (mode === 'menu') { X.fillStyle = 'rgba(7,6,26,.5)'; X.fillRect(0, 0, W, H); logo(t, 120); txt('// the codebase is rotting. patch it before it ships.', W / 2, 196, 17, PAL.dim, MONO); }
  else if (world.phase === 'wait') txt('CONNECTING TO ROOM ' + roomCode + '…', W / 2, H / 2, 24, PAL.white, DISP, 'center', .6 + .4 * Math.sin(t * 5));
  else {
    drawHUD(t); drawTouch(t); drawUpgrades(t);
    if (banner) {
      const a = Math.min(1, banner.t * 2), s = 1 + Math.max(0, banner.t - 2.2) * .8;
      X.save(); X.translate(W / 2, 320); X.scale(s, s);
      X.font = '72px ' + DISP; const bigSize = Math.min(72, 72 * (W - 120) / Math.max(1, X.measureText(banner.big).width)); // long boss names shrink to fit
      X.font = '18px ' + DISP; const subSize = Math.min(18, 18 * (W - 80) / Math.max(1, X.measureText(banner.sub).width));
      txt(banner.big, 0, 0, bigSize, PAL.white, DISP, 'center', a); txt(banner.sub, 0, 44, subSize, PAL.gold, DISP, 'center', a);
      X.restore();
    }
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
