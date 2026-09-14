import * as THREE from 'three/webgpu';
import { SoftwareField } from './software3d.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BANDS, bandAt, clamp, frequencyPosition, location, powerDb } from './analysis.js';

const height = (f) => 0.6 + frequencyPosition(f) * 6;
const radius = (p) => 0.018 + clamp((powerDb(p) + 30) / 60, 0, 1) * 0.085;
// Keep the strongest measured bin in each display group; analysis is never binned.
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

export class SpectralField {
  constructor(container, onSelect, onStatus) {
    this.container = container;
    this.onSelect = onSelect;
    this.onStatus = onStatus;
    this.mode = 'field';
    this.labels = [];
    this.items = [];
    this.ready = false;
    this.visible = true;
    this.count = 0;
    this.last = 0;
  }
  async init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0a141c');
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(11, 10, 14);
    this.renderer = new THREE.WebGPURenderer({ antialias: true, alpha: false });
    try {
      await this.renderer.init();
    } catch {
      this.software = new SoftwareField(this.container, this.onSelect);
      this.ready = true;
      this.onStatus('Software renderer');
      return;
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.container.prepend(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Interactive 3D spectral field. Drag to rotate; right-drag to pan; scroll to zoom. Channel selection is also available in the adjacent control.',
    );
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 3.1, 0);
    this.controls.enableDamping = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 35;
    this.controls.maxPolarAngle = Math.PI * 0.95;
    this.geometry = new THREE.SphereGeometry(1, 8, 6);
    this.points = new THREE.InstancedMesh(
      this.geometry,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      50000,
    );
    this.points.count = 0;
    this.points.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.axes = new THREE.Group();
    this.scene.add(this.axes);
    this.object = new THREE.Object3D();
    this.color = new THREE.Color();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      this.down = [e.clientX, e.clientY];
    });
    this.renderer.domElement.addEventListener('pointerup', (e) => {
      if (!this.down || Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 5) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      this.pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hit = this.raycaster.intersectObject(this.points)[0];
      if (hit && this.items[hit.instanceId]) this.onSelect(this.items[hit.instanceId]);
    });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.ready = true;
    this.resize();
    this.onStatus(this.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2');
    await this.renderer.setAnimationLoop((now) => {
      if (!this.visible || document.hidden || now - this.last < 30) return;
      this.last = now;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.positionLabels();
    });
  }
  resize() {
    if (!this.renderer) return;
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  reset() {
    if (this.software) {
      this.software.reset();
      return;
    }
    if (!this.ready) return;
    this.camera.position.set(11, 10, 14);
    this.controls.target.set(0, 3.1, 0);
    this.controls.update();
  }
  line(a, b, color = '#28404c') {
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...a),
      new THREE.Vector3(...b),
    ]);
    this.axes.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color })));
  }
  label(text, point, type = '') {
    const element = document.createElement('span');
    element.className = `axis-label ${type}`;
    element.textContent = text;
    this.container.append(element);
    this.labels.push({ element, point: new THREE.Vector3(...point) });
  }
  makeAxes(channels, mode) {
    this.axes.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    this.axes.clear();
    this.labels.forEach((l) => l.element.remove());
    this.labels = [];
    for (const f of [0.5, 4, 8, 13, 30, 45]) {
      const y = height(f);
      this.line([-5, y, -4.3], [5, y, -4.3]);
      this.label(`${f} Hz`, [-5.3, y, -4.3], 'frequency');
    }
    this.line([-5, 0.6, -4.3], [-5, 6.6, -4.3]);
    if (mode === 'field') {
      for (const c of channels) {
        const p = location(c.name);
        this.line([p.x, 0.25, p.z], [p.x, 6.6, p.z], '#142b37');
        this.label(c.name, [p.x, 0.15, p.z], c.name === this.selected ? 'selected' : '');
      }
      this.label('LEFT', [-4.8, -0.15, 0]);
      this.label('RIGHT', [4.8, -0.15, 0]);
      this.label('FRONT', [0, -0.15, -3.9]);
      this.label('POSTERIOR', [0, -0.15, 3.9]);
    } else {
      this.line([-5, 0.5, 2.5], [5, 0.5, 2.5]);
      this.label('20 s history  →  now', [0, 0.1, 2.8]);
      this.label('−30 dB', [-5, 0.15, -2]);
      this.label('+30 dB', [-5, 0.15, 2]);
      this.label('POWER DEPTH', [-5, 0.15, 0]);
    }
  }
  positionLabels() {
    for (const l of this.labels) {
      const p = l.point.clone().project(this.camera);
      l.element.style.left = `${(p.x * 0.5 + 0.5) * this.container.clientWidth}px`;
      l.element.style.top = `${(-p.y * 0.5 + 0.5) * this.container.clientHeight}px`;
      l.element.hidden = p.z > 1 || p.z < -1;
    }
  }
  add(x, y, z, p, color, item) {
    if (this.count >= 50000) return;
    const s = radius(p);
    this.object.position.set(x, y, z);
    this.object.scale.setScalar(s);
    this.object.updateMatrix();
    this.points.setMatrixAt(this.count, this.object.matrix);
    this.points.setColorAt(this.count, this.color.set(color));
    this.items[this.count] = item;
    this.count++;
  }
  update(frame, { selected, mode = 'field', history = [], baseline = null } = {}) {
    if (this.software) {
      this.software.update(frame, { selected, mode, history, baseline });
      return;
    }
    if (!this.ready) return;
    this.selected = selected;
    const key = mode + frame.channels.map((c) => c.name).join(',') + selected;
    if (key !== this.axisKey) {
      this.axisKey = key;
      this.makeAxes(frame.channels, mode);
    }
    this.count = 0;
    this.items = [];
    if (mode === 'field') {
      for (const c of frame.channels) {
        const pos = location(c.name);
        for (const b of bins(c))
          this.add(
            pos.x,
            height(b.f),
            pos.z,
            b.p,
            c.name === selected ? '#f1fff7' : bandAt(b.f)?.color || '#7b8b96',
            { channel: c.name, frequency: b.f, power: b.p },
          );
      }
      if (baseline)
        for (const c of baseline.channels) {
          const pos = location(c.name);
          for (const b of bins(c, 60))
            this.add(pos.x + 0.13, height(b.f), pos.z + 0.13, b.p, '#536873', {
              channel: c.name,
              frequency: b.f,
              power: b.p,
              baseline: true,
            });
        }
    } else {
      for (const h of history) {
        const c = h.channels.find((c) => c.name === selected);
        if (!c) continue;
        const age = frame.end_s - h.end_s;
        if (age < 0 || age > 20) continue;
        for (const b of bins(c, 80))
          this.add(
            5 - age / 2,
            height(b.f),
            clamp(powerDb(b.p), -30, 30) / 15,
            b.p,
            bandAt(b.f)?.color || '#7b8b96',
            { channel: c.name, frequency: b.f, power: b.p, time: h.end_s },
          );
      }
    }
    this.points.count = this.count;
    this.points.instanceMatrix.needsUpdate = true;
    if (this.points.instanceColor) this.points.instanceColor.needsUpdate = true;
    this.mode = mode;
  }
  setVisible(value) {
    if (this.software) {
      this.software.setVisible(value);
      return;
    }
    this.visible = value;
    this.container.classList.toggle('field-hidden', !value);
  }
}
