import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import { BANDS } from './signal.js';
import {
  scalpGrid,
  fieldWeights,
  sampleField,
  timePosition,
} from './field-math.js';
import { POSITIONS, parseDerivation } from './montage.js';
const vertex = `attribute float intensity; attribute float coverage; attribute float affected; varying float vIntensity; varying float vCoverage; varying float vAffected; varying vec3 vLocal; void main(){vIntensity=intensity;vCoverage=coverage;vAffected=affected;vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragment = `precision highp float; uniform vec3 tint; uniform float opacity; uniform float cut; varying float vIntensity; varying float vCoverage; varying float vAffected; varying vec3 vLocal; void main(){if(vLocal.x>cut||vCoverage<.08)discard;float hatch=vAffected>.3?(.55+.45*step(.45,fract((gl_FragCoord.x+gl_FragCoord.y)/10.))):1.;vec3 col=tint*(.12+.88*vIntensity);gl_FragColor=vec4(col,opacity*vCoverage*(.12+.88*vIntensity)*hatch);}`;
export class FluidField {
  constructor(container, onSelect, onStatus) {
    this.container = container;
    this.onSelect = onSelect;
    this.grid = scalpGrid();
    this.meshes = [];
    this.weights = new Map();
    this.options = {
      mode: 'live',
      band: -1,
      scale: 80,
      lens: 0.5,
      cut: 2,
      focus: 0,
      selected: '',
      peaks: false,
    };
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute(
      'aria-label',
      'Interactive EEG measurement surface. Drag to rotate, scroll to zoom. Use view buttons and channel selection for keyboard access.',
    );
    container.prepend(this.canvas);
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
      });
    } catch {
      this.canvas.remove();
      this.canvas = document.createElement('canvas');
      container.prepend(this.canvas);
      this.software = this.canvas.getContext('2d');
      this.yaw = 0.4;
      this.pitch = 0.6;
      this.softwareControls();
      onStatus('Software surface');
    }
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.setClearColor('#060c14');
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(48, 1, 0.015, 300);
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.minDistance = 0.15;
      this.controls.maxDistance = 60;
      this.controls.target.set(0, 0.25, 0);
      this.fly = new FlyControls(this.camera, this.canvas);
      this.fly.movementSpeed = 2;
      this.fly.rollSpeed = 0.35;
      this.fly.dragToLook = true;
      this.fly.enabled = false;
      this.markers = new THREE.Group();
      this.scene.add(this.markers);
      this.raycaster = new THREE.Raycaster();
      this.orientation = new THREE.Group();
      this.scene.add(this.orientation);
      for (const [label, p] of [
        ['L', [-1.5, 0.15, 0]],
        ['R', [1.5, 0.15, 0]],
        ['Front', [0, 0.15, -1.5]],
        ['Back', [0, 0.15, 1.5]],
      ]) {
        const c = document.createElement('canvas');
        c.width = 192;
        c.height = 64;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#bbcfdf';
        ctx.font = '32px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(label, 96, 43);
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: new THREE.CanvasTexture(c),
            transparent: true,
            depthTest: false,
            opacity: 0.85,
          }),
        );
        sprite.position.set(...p);
        sprite.scale.set(0.65, 0.22, 1);
        this.orientation.add(sprite);
      }
      this.canvas.addEventListener('pointerdown', (e) => {
        this.down = [e.clientX, e.clientY];
      });
      this.canvas.addEventListener('pointerup', (e) => {
        if (
          !this.down ||
          Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4
        )
          return;
        const r = this.canvas.getBoundingClientRect();
        this.raycaster.setFromCamera(
          new THREE.Vector2(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            (-(e.clientY - r.top) / r.height) * 2 + 1,
          ),
          this.camera,
        );
        const hit = this.raycaster.intersectObjects(this.markers.children)[0];
        if (hit) this.onSelect(hit.object.userData.name);
      });
      this.reduceMotion = matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      let last = performance.now();
      this.renderer.setAnimationLoop((now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (document.hidden || this.visible === false) return;
        this.settle(dt);
        this.fly.enabled ? this.fly.update(dt) : this.controls.update();
        this.renderer.render(this.scene, this.camera);
      });
      onStatus('WebGL surface');
    }
    new ResizeObserver(() => this.resize()).observe(container);
    this.home();
    this.resize();
  }
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    if (this.renderer) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    } else {
      this.canvas.width = w;
      this.canvas.height = h;
      this.drawSoftware();
    }
  }
  home() {
    if (this.camera) {
      this.camera.position.set(4, 3.3, 5.6);
      this.controls.target.set(0, 0.35, 0);
      this.camera.lookAt(this.controls.target);
    } else {
      this.yaw = 0.4;
      this.pitch = 0.6;
      this.drawSoftware();
    }
  }
  enter(enabled) {
    if (this.fly) {
      this.fly.enabled = enabled;
      this.controls.enabled = !enabled;
    }
  }
  lens(fov) {
    if (this.camera) {
      this.camera.fov = Number(fov);
      this.camera.updateProjectionMatrix();
    }
  }
  settle(dt) {
    for (const mesh of this.meshes) {
      const target = mesh.userData.target;
      if (!mesh.visible || !target) continue;
      let error = 0;
      const blend = 1 - Math.exp(-dt / 0.05);
      for (const attr of ['position', 'intensity']) {
        const a = mesh.geometry.attributes[attr].array,
          t = target[attr];
        for (let i = 0; i < a.length; i++) {
          const d = t[i] - a[i];
          a[i] += d * blend;
          error = Math.max(error, Math.abs(d));
        }
        mesh.geometry.attributes[attr].needsUpdate = true;
      }
      if (error < 0.0001) mesh.userData.target = null;
    }
  }
  getMesh(i) {
    if (this.meshes[i]) return this.meshes[i];
    const g = new THREE.BufferGeometry(),
      n = this.grid.vertices.length;
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(n * 3), 3),
    );
    for (const attr of ['intensity', 'coverage', 'affected'])
      g.setAttribute(attr, new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setIndex(this.grid.indices);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        tint: { value: new THREE.Color() },
        opacity: { value: 1 },
        cut: { value: 2 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }
  update(frames, options = {}) {
    this.options = { ...this.options, ...options };
    this.frames = frames || [];
    if (this.software) {
      this.drawSoftware();
      return;
    }
    const {
        mode,
        band,
        scale,
        lens,
        focus,
        cut,
        selected,
        peaks,
        threshold = -1,
      } = this.options,
      total = this.options.total || frames.at(-1)?.end || 1;
    const shown = mode === 'live' ? frames.slice(-1) : frames.slice(-18);
    let index = 0;
    for (const frame of shown) {
      const key = frame.channels.map((c) => c.name).join('|');
      let weights = this.weights.get(key);
      if (!weights) {
        weights = fieldWeights(
          this.grid.vertices,
          frame.channels.map((c) => c.name),
        );
        if (this.weights.size > 32) this.weights.clear();
        this.weights.set(key, weights);
      }
      const age = total - (frame.start + frame.end) / 2,
        u = timePosition(age, total, total - focus, lens);
      for (let b = 0; b < 5; b++) {
        if (band >= 0 && b !== band) continue;
        const mesh = this.getMesh(index++),
          attrs = mesh.geometry.attributes;
        const context = [
            frame.segment,
            frame.source,
            band,
            selected,
            scale,
            peaks,
            threshold,
          ].join('|'),
          smooth =
            mode === 'live' &&
            !this.reduceMotion &&
            mesh.userData.context === context &&
            Math.abs(frame.end - (mesh.userData.end ?? 0)) < 2;
        const prior = smooth
          ? {
              position: attrs.position.array.slice(),
              intensity: attrs.intensity.array.slice(),
            }
          : null;
        mesh.visible = true;
        mesh.position.set(mode === 'side' ? -3 + u * 6 : 0, 0, 0);
        mesh.scale.setScalar(mode === 'side' ? 0.6 : 1);
        mesh.renderOrder = -Math.round(u * 100);
        for (let j = 0; j < this.grid.vertices.length; j++) {
          const v = this.grid.vertices[j],
            s = sampleField(
              weights[j],
              frame.channels,
              b,
              scale,
              peaks,
              selected,
              threshold,
            );
          const radial =
            1 + (mode === 'history' ? u * 2 : 0) + b * 0.032 + s.displacement;
          attrs.position.setXYZ(j, v[0] * radial, v[1] * radial, v[2] * radial);
          attrs.intensity.setX(j, s.amp);
          attrs.coverage.setX(j, s.coverage);
          attrs.affected.setX(j, s.affected);
        }
        mesh.userData.target = prior
          ? {
              position: attrs.position.array.slice(),
              intensity: attrs.intensity.array.slice(),
            }
          : null;
        if (prior)
          for (const attr of ['position', 'intensity'])
            attrs[attr].array.set(prior[attr]);
        mesh.userData.context = mode === 'live' ? context : null;
        mesh.userData.end = frame.end;
        Object.values(attrs).forEach((a) => (a.needsUpdate = true));
        mesh.material.uniforms.tint.value.set(BANDS[b].color);
        mesh.material.uniforms.opacity.value = mode === 'live' ? 0.75 : 0.28;
        mesh.material.uniforms.cut.value = cut;
      }
    }
    for (let i = index; i < this.meshes.length; i++)
      this.meshes[i].visible = false;
    this.makeMarkers(frames.at(-1));
    this.markers.visible = mode === 'live';
    this.orientation.visible = mode !== 'side';
  }
  makeMarkers(frame) {
    const key = (frame?.channels || [])
      .map((c) => c.name + ':' + c.status + ':' + c.valid)
      .join();
    if (this.markerKey === key) return;
    this.markerKey = key;
    for (const o of [...this.markers.children]) {
      o.geometry.dispose();
      o.material.dispose();
      this.markers.remove(o);
    }
    for (const c of frame?.channels || []) {
      const d = parseDerivation(c.name);
      if (!d) continue;
      const a = POSITIONS[d.a],
        b = d.bipolar ? POSITIONS[d.b] : a,
        p = a.map((v, i) => ((v + b[i]) / 2) * 1.08);
      const mesh = new THREE.Mesh(
        c.valid
          ? new THREE.SphereGeometry(0.025, 8, 6)
          : new THREE.TorusGeometry(0.038, 0.006, 4, 12),
        new THREE.MeshBasicMaterial({
          color: c.valid
            ? c.status === 'derived'
              ? '#e9b368'
              : '#7cacc2'
            : '#657081',
          transparent: true,
          opacity: 0.7,
        }),
      );
      mesh.position.set(...p);
      mesh.lookAt(0, 0, 0);
      mesh.userData.name = c.name;
      this.markers.add(mesh);
    }
    this.markers.visible = this.options.mode === 'live';
  }
  side() {
    if (this.camera) {
      this.camera.position.set(0.3, 2.7, 10);
      this.controls.target.set(0, 0.15, 0);
      this.camera.lookAt(this.controls.target);
    }
  }
  softwareControls() {
    let down = null;
    this.zoom = 1;
    this.canvas.addEventListener('pointerdown', (e) => {
      down = [e.clientX, e.clientY];
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!down) return;
      this.yaw += (e.clientX - down[0]) * 0.008;
      this.pitch += (e.clientY - down[1]) * 0.008;
      down = [e.clientX, e.clientY];
      this.drawSoftware();
    });
    this.canvas.addEventListener('pointerup', () => (down = null));
    this.canvas.addEventListener('pointercancel', () => (down = null));
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(
          0.2,
          Math.min(6, this.zoom * Math.exp(-e.deltaY * 0.001)),
        );
        this.drawSoftware();
      },
      { passive: false },
    );
  }
  drawSoftware() {
    if (!this.software || !this.frames) return;
    const ctx = this.software,
      w = this.canvas.width,
      h = this.canvas.height;
    ctx.fillStyle = '#060c14';
    ctx.fillRect(0, 0, w, h);
    const grid = scalpGrid(10, 18),
      { mode, band, selected, scale, peaks, threshold = -1 } = this.options,
      shown = mode === 'live' ? this.frames.slice(-1) : this.frames,
      total = this.options.total || 1,
      tris = [];
    const project = (v, offset = 0) => {
      const x = v[0] + offset,
        y = v[1],
        z = v[2],
        xx = x * Math.cos(this.yaw) + z * Math.sin(this.yaw),
        zz = -x * Math.sin(this.yaw) + z * Math.cos(this.yaw),
        yy = y * Math.cos(this.pitch) - zz * Math.sin(this.pitch),
        depth = y * Math.sin(this.pitch) + zz * Math.cos(this.pitch),
        k = Math.min(w, h) * 0.18 * this.zoom;
      return [w / 2 + xx * k, h * 0.55 - yy * k, depth];
    };
    for (const f of shown) {
      const weights = fieldWeights(
          grid.vertices,
          f.channels.map((c) => c.name),
        ),
        age = total - (f.start + f.end) / 2,
        u = timePosition(
          age,
          total,
          total - this.options.focus,
          this.options.lens,
        );
      const b =
        band >= 0
          ? band
          : f.channels
              .filter((c) => c.valid)
              .reduce(
                (best, c) => {
                  const k = c.bands.indexOf(Math.max(...c.bands));
                  return c.bands[k] > best.p ? { b: k, p: c.bands[k] } : best;
                },
                { b: 2, p: 0 },
              ).b;
      const values = weights.map((v) =>
          sampleField(v, f.channels, b, scale, peaks, selected, threshold),
        ),
        pts = grid.vertices.map((v, i) =>
          project(
            v.map(
              (x) =>
                x *
                (1 +
                  (mode === 'history' ? u * 2 : 0) +
                  values[i].displacement) *
                (mode === 'side' ? 0.6 : 1),
            ),
            mode === 'side' ? -3 + 6 * u : 0,
          ),
        );
      for (let i = 0; i < grid.indices.length; i += 3) {
        const ids = grid.indices.slice(i, i + 3),
          a =
            ids.reduce((s, j) => s + values[j].amp * values[j].coverage, 0) / 3;
        if (a < 0.01 || ids.some((j) => grid.vertices[j][0] > this.options.cut))
          continue;
        tris.push({
          p: ids.map((j) => pts[j]),
          a: a * (mode === 'live' ? 0.85 : 0.25),
          color: BANDS[b].color,
          z: ids.reduce((s, j) => s + pts[j][2], 0),
        });
      }
    }
    tris
      .sort((a, b) => a.z - b.z)
      .forEach((t) => {
        ctx.globalAlpha = t.a;
        ctx.fillStyle = t.color;
        ctx.beginPath();
        t.p.forEach((p, i) =>
          i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]),
        );
        ctx.closePath();
        ctx.fill();
      });
    ctx.globalAlpha = 1;
  }
}
