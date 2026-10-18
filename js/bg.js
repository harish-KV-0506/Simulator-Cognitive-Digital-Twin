/* Animated background: perspective data-grid, drifting twin network, travelling data packets */
(function () {
'use strict';
const cv = document.getElementById('bg'); if (!cv) return;
const ctx = cv.getContext('2d'), reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
let W = 0, H = 0, DPR = 1, nodes = [], packets = [], t = 0, last = 0, scrollY = 0, intensity = 1, target = 1, running = true;
const mouse = { x: -9999, y: -9999 };

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.75); W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const n = Math.round(Math.min(95, Math.max(34, W * H / 17000))); nodes = [];
  for (let i = 0; i < n; i++) nodes.push({ x: Math.random() * W, y: Math.random() * H * 0.72, vx: (Math.random() - .5) * .22, vy: (Math.random() - .5) * .16, r: 1.2 + Math.random() * 1.8, hue: Math.random() < .62 ? 0 : 1, ph: Math.random() * 6.28 });
  if (reduce) frame(0, true);
}
function col(h, a) { return h === 0 ? 'rgba(79,227,240,' + a + ')' : 'rgba(139,124,255,' + a + ')'; }

function frame(now, once) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; if (!once) t += dt;
  intensity += (target - intensity) * Math.min(1, dt * 2.2); if (target > 1) target = Math.max(1, target - dt * 0.35);
  ctx.clearRect(0, 0, W, H);
  /* base */
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#050816'); g.addColorStop(1, '#070b1c'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const gx = W * (0.2 + 0.1 * Math.sin(t * 0.07)), gy = H * (0.25 + 0.05 * Math.cos(t * 0.09));
  let rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.55); rg.addColorStop(0, 'rgba(94,76,255,.20)'); rg.addColorStop(1, 'rgba(94,76,255,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
  const hx = W * (0.82 + 0.06 * Math.cos(t * 0.06)), hy = H * (0.55 + 0.05 * Math.sin(t * 0.08));
  rg = ctx.createRadialGradient(hx, hy, 0, hx, hy, Math.max(W, H) * 0.5); rg.addColorStop(0, 'rgba(34,211,238,.13)'); rg.addColorStop(1, 'rgba(34,211,238,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

  /* perspective floor grid */
  const hz = H * 0.64 - Math.min(scrollY * 0.05, 40), vx = W / 2 + (mouse.x > -999 ? (mouse.x - W / 2) * 0.05 : 0);
  ctx.lineWidth = 1; const rows = 16, speed = 0.12 * intensity;
  for (let k = 0; k < rows; k++) { const z = ((k + t * speed) % rows) / rows, y = hz + Math.pow(z, 2.2) * (H - hz); ctx.strokeStyle = 'rgba(79,227,240,' + (0.02 + z * 0.13).toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (let k = -14; k <= 14; k++) { const xb = vx + k * W * 0.075 * 2.4; ctx.strokeStyle = 'rgba(139,124,255,' + (0.05 + 0.1 * (1 - Math.abs(k) / 15)).toFixed(3) + ')'; ctx.beginPath(); ctx.moveTo(vx + k * 8, hz); ctx.lineTo(xb, H); ctx.stroke(); }
  const fade = ctx.createLinearGradient(0, hz - 30, 0, hz + 90); fade.addColorStop(0, 'rgba(5,8,22,0)'); fade.addColorStop(0.3, 'rgba(5,8,22,.8)'); fade.addColorStop(1, 'rgba(5,8,22,0)'); ctx.fillStyle = fade; ctx.fillRect(0, hz - 30, W, 120);

  /* network */
  for (const n of nodes) {
    if (!once) { n.x += n.vx * intensity; n.y += n.vy * intensity; if (n.x < -20) n.x = W + 20; if (n.x > W + 20) n.x = -20; if (n.y < 0 || n.y > H * 0.75) n.vy *= -1; }
    const dx = mouse.x - n.x, dy = mouse.y - n.y, d = Math.hypot(dx, dy); n.near = d < 170 ? 1 - d / 170 : 0;
    if (!once && n.near) { n.x += dx * 0.0016 * n.near * 10; n.y += dy * 0.0016 * n.near * 10; }
  }
  const maxD = 150;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y); if (d > maxD) continue;
    const al = (1 - d / maxD) * (0.2 + 0.4 * Math.max(a.near, b.near)); ctx.strokeStyle = col(a.hue, al.toFixed(3)); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    if (!once && packets.length < 46 * intensity && Math.random() < 0.0009 * intensity) packets.push({ a, b, p: 0, sp: 0.5 + Math.random() * 0.8, hue: a.hue });
  }
  for (const n of nodes) { const tw = 0.55 + 0.45 * Math.sin(t * 1.4 + n.ph); ctx.fillStyle = col(n.hue, (0.35 + 0.5 * tw + n.near * 0.5).toFixed(3)); ctx.beginPath(); ctx.arc(n.x, n.y, n.r + n.near * 2, 0, 6.2832); ctx.fill();
    if (n.near > 0.1) { ctx.fillStyle = col(n.hue, (n.near * 0.12).toFixed(3)); ctx.beginPath(); ctx.arc(n.x, n.y, 16 + n.near * 14, 0, 6.2832); ctx.fill(); } }
  for (let i = packets.length - 1; i >= 0; i--) { const k = packets[i]; k.p += dt * k.sp * intensity; if (k.p >= 1) { packets.splice(i, 1); continue; }
    const x = k.a.x + (k.b.x - k.a.x) * k.p, y = k.a.y + (k.b.y - k.a.y) * k.p, gl = ctx.createRadialGradient(x, y, 0, x, y, 12); gl.addColorStop(0, col(k.hue, .9)); gl.addColorStop(1, col(k.hue, 0)); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, 12, 0, 6.2832); ctx.fill(); }
  /* scan sweep */
  const sy = ((t * 38) % (H + 200)) - 100, sg = ctx.createLinearGradient(0, sy - 60, 0, sy + 60); sg.addColorStop(0, 'rgba(79,227,240,0)'); sg.addColorStop(.5, 'rgba(79,227,240,.035)'); sg.addColorStop(1, 'rgba(79,227,240,0)'); ctx.fillStyle = sg; ctx.fillRect(0, sy - 60, W, 120);
}
function loop(now) { if (running && !document.hidden) frame(now / 1000); requestAnimationFrame(loop); }
window.addEventListener('resize', resize);
window.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });
resize(); if (!reduce) requestAnimationFrame(loop);
window.CDT = window.CDT || {};
window.CDT.bg = { pulse: function (v) { target = Math.max(target, v || 2.6); }, setIntensity: function (v) { target = v; } };
})();
