export const $ = (id) => document.getElementById(id);
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '∞');
export const rgb = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;
export function row(k, v, cls = '') { return `<div class="row"><span>${k}</span><span class="${cls}">${v}</span></div>`; }

// Orbit-camera drag/wheel controller. cam = {yaw,pitch,dist}; limits {min,max}.
export function attachOrbit(target, cam, limits, onChange) {
  let down = null;
  const C = () => (typeof cam === 'function' ? cam() : cam), L = () => (typeof limits === 'function' ? limits() : limits);
  target.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, moved: 0 };
    target._dragMoved = 0;
    try { target.setPointerCapture(e.pointerId); } catch (_) {}
  });
  target.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    down.x = e.clientX; down.y = e.clientY;
    down.moved += Math.abs(dx) + Math.abs(dy);
    target._dragMoved = down.moved;
    const c = C(); c.yaw += dx * 0.006;
    c.pitch = clamp(c.pitch + dy * 0.006, -1.45, 1.45);
    onChange && onChange();
  });
  const up = () => { down = null; };
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
  target.addEventListener('wheel', (e) => {
    e.preventDefault();
    const c = C(), l = L(); c.dist = clamp(c.dist * Math.exp(e.deltaY * 0.001), l.min, l.max);
    onChange && onChange();
  }, { passive: false });
}
