import { bandAt, clamp, frequencyPosition, location, powerDb } from './analysis.js';
const height = (f) => 0.6 + frequencyPosition(f) * 6;
const radius = (p) => 0.018 + clamp((powerDb(p) + 30) / 60, 0, 1) * 0.085;
function bins(channel, limit = 100) {
  const s = channel.spectrum;
  if (!s?.valid) return [];
  const result = [],
    step = Math.max(1, Math.ceil(s.frequency_hz.length / limit));
  for (let k = 0; k < s.frequency_hz.length; k += step) {
    let best = k;
    for (let j = k + 1; j < Math.min(k + step, s.frequency_hz.length); j++)
      if (s.power_density[j] > s.power_density[best]) best = j;
    result.push({ f: s.frequency_hz[best], p: s.power_density[best] });
  }
  return result;
}

// A perspective camera and depth-sorted measured points keep the same grammar
// available on browsers that provide neither WebGPU nor WebGL 2.
export class SoftwareField {
  constructor(container, onSelect) {
    this.container = container;
    this.onSelect = onSelect;
    this.visible = true;
    this.points = [];
    this.labels = [];
    this.lines = [];
    this.hits = [];
    this.dirty = true;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute(
      'aria-label',
      'Interactive software 3D spectral field. Drag to rotate, right-drag to pan, scroll or pinch to zoom.',
    );
    container.prepend(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) throw new Error('Canvas rendering is unavailable.');
    this.pointers = new Map();
    this.reset();
    this.canvas.oncontextmenu = (e) => e.preventDefault();
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      this.down = { x: e.clientX, y: e.clientY, button: e.button };
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const last = this.pointers.get(e.pointerId);
      if (!last) return;
      const old = [...this.pointers.values()];
      this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.pointers.size === 2) {
        const next = [...this.pointers.values()],
          distance = (a) => Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
        this.distance = clamp((this.distance * distance(old)) / Math.max(1, distance(next)), 7, 40);
      } else if (this.down?.button === 2 || e.shiftKey) {
        this.panX += e.clientX - last[0];
        this.panY += e.clientY - last[1];
      } else {
        this.yaw += (e.clientX - last[0]) * 0.008;
        this.pitch = clamp(this.pitch + (e.clientY - last[1]) * 0.007, -1.45, 1.45);
      }
      this.dirty = true;
    });
    this.canvas.addEventListener('pointerup', (e) => {
      this.pointers.delete(e.pointerId);
      if (
        this.down &&
        Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) < 5 &&
        this.down.button === 0
      ) {
        const rect = this.canvas.getBoundingClientRect(),
          x = e.clientX - rect.left,
          y = e.clientY - rect.top;
        let best = null,
          distance = 12;
        for (const h of this.hits) {
          const d = Math.hypot(h.x - x, h.y - y);
          if (d < distance) {
            distance = d;
            best = h;
          }
        }
        if (best) this.onSelect(best.item);
      }
      this.down = null;
    });
    this.canvas.addEventListener('pointercancel', (e) => this.pointers.delete(e.pointerId));
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = clamp(this.distance * Math.exp(e.deltaY * 0.001), 7, 40);
        this.dirty = true;
      },
      { passive: false },
    );
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    const loop = () => {
      if (this.dirty && this.visible && !document.hidden) {
        this.draw();
        this.dirty = false;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  reset() {
    this.yaw = -0.55;
    this.pitch = 0.45;
    this.distance = 17;
    this.panX = 0;
    this.panY = 0;
    this.dirty = true;
  }
  resize() {
    this.w = this.container.clientWidth;
    this.h = this.container.clientHeight;
    const d = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = this.w * d;
    this.canvas.height = this.h * d;
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
    this.dirty = true;
  }
  project(x, y, z) {
    y -= 3.1;
    const rx = Math.cos(this.yaw) * x - Math.sin(this.yaw) * z,
      rz = Math.sin(this.yaw) * x + Math.cos(this.yaw) * z,
      ry = Math.cos(this.pitch) * y - Math.sin(this.pitch) * rz,
      depth = this.distance + Math.sin(this.pitch) * y + Math.cos(this.pitch) * rz;
    const scale = (this.h * 1.3) / Math.max(1, depth);
    return {
      x: this.w / 2 + this.panX + rx * scale,
      y: this.h * 0.52 + this.panY - ry * scale,
      depth,
      scale,
    };
  }
  update(frame, { selected, mode = 'field', history = [], baseline = null } = {}) {
    this.points = [];
    this.labels = [];
    this.lines = [];
    const add = (x, y, z, b, color, item) =>
      this.points.push({ x, y, z, r: radius(b.p), color, item });
    for (const f of [0.5, 4, 8, 13, 30, 45]) {
      this.lines.push([[-5, height(f), -4.3], [5, height(f), -4.3], '#28404c']);
      this.labels.push({ text: `${f} Hz`, point: [-5.3, height(f), -4.3], color: '#a0bac7' });
    }
    if (mode === 'field') {
      for (const c of frame.channels) {
        const pos = location(c.name);
        this.lines.push([[pos.x, 0.25, pos.z], [pos.x, 6.6, pos.z], '#142b37']);
        this.labels.push({
          text: c.name,
          point: [pos.x, 0.1, pos.z],
          color: c.name === selected ? '#deffe9' : '#7195a2',
        });
        for (const b of bins(c))
          add(
            pos.x,
            height(b.f),
            pos.z,
            b,
            c.name === selected ? '#eafff2' : bandAt(b.f)?.color || '#778c97',
            { channel: c.name, frequency: b.f, power: b.p },
          );
      }
      if (baseline)
        for (const c of baseline.channels) {
          const pos = location(c.name);
          for (const b of bins(c, 60))
            add(pos.x + 0.13, height(b.f), pos.z + 0.13, b, '#536873', {
              channel: c.name,
              frequency: b.f,
              power: b.p,
              baseline: true,
            });
        }
      for (const [text, point] of [
        ['LEFT', [-4.8, -0.5, 0]],
        ['RIGHT', [4.8, -0.5, 0]],
        ['FRONT', [0, -0.5, -4]],
        ['POSTERIOR', [0, -0.5, 4]],
      ])
        this.labels.push({ text, point, color: '#7396a6' });
    } else {
      for (const h of history) {
        const c = h.channels.find((c) => c.name === selected),
          age = frame.end_s - h.end_s;
        if (!c || age < 0 || age > 20) continue;
        for (const b of bins(c, 80))
          add(
            5 - age / 2,
            height(b.f),
            clamp(powerDb(b.p), -30, 30) / 15,
            b,
            bandAt(b.f)?.color || '#778c97',
            { channel: c.name, frequency: b.f, power: b.p, time: h.end_s },
          );
      }
      this.labels.push(
        { text: '20 s history → now', point: [0, 0.1, 2.8], color: '#91afbd' },
        { text: '−30 dB', point: [-5, 0.1, -2], color: '#91afbd' },
        { text: '+30 dB', point: [-5, 0.1, 2], color: '#91afbd' },
      );
    }
    this.dirty = true;
  }
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.fillStyle = '#0a141c';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.lineWidth = 0.7;
    for (const [a, b, color] of this.lines) {
      const x = this.project(...a),
        y = this.project(...b);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x.x, x.y);
      ctx.lineTo(y.x, y.y);
      ctx.stroke();
    }
    const projected = this.points
      .map((p) => ({ ...this.project(p.x, p.y, p.z), r: p.r, color: p.color, item: p.item }))
      .sort((a, b) => b.depth - a.depth);
    this.hits = [];
    for (const p of projected) {
      if (p.depth < 1 || p.x < 0 || p.y < 0 || p.x > this.w || p.y > this.h) continue;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.item.baseline ? 0.6 : 0.9;
      ctx.beginPath();
      ctx.arc(p.x, p.y, clamp(p.r * p.scale, 0.45, 12), 0, Math.PI * 2);
      ctx.fill();
      this.hits.push(p);
    }
    ctx.globalAlpha = 1;
    ctx.font = '10px ui-monospace,monospace';
    ctx.textAlign = 'center';
    for (const l of this.labels) {
      const p = this.project(...l.point);
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, p.x, p.y);
    }
  }
  setVisible(value) {
    this.visible = value;
    this.container.classList.toggle('field-hidden', !value);
    this.dirty = true;
  }
}
