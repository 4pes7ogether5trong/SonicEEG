import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import { BANDS } from './signal.js';
import {
  scalpGrid,
  fieldWeights,
  spectralField,
  timePosition,
  sidePosition,
  sideTicks,
  fieldTime,
  normalize,
} from './field-math.js';
import { POSITIONS, parseDerivation } from './montage.js';
import { reliefGeometry } from './waveform.js';

const vertex =
  'attribute float intensity; attribute float coverage; attribute float affected; varying float vI; varying float vC; varying float vA; varying vec3 vColor; varying vec3 vLocal; void main(){vI=intensity;vC=coverage;vA=affected;vColor=color;vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
const fragment =
  'precision highp float; uniform float opacity; uniform float cut; varying float vI; varying float vC; varying float vA; varying vec3 vColor; varying vec3 vLocal; void main(){if(vLocal.x>cut||vC<.08)discard;float contour=smoothstep(.07,.14,abs(fract(vI*9.)-.5));float shade=.58+.42*max(0.,dot(normalize(vLocal),normalize(vec3(-.4,1.,.7))));float hatch=vA>.3?(.55+.45*step(.4,fract((gl_FragCoord.x+gl_FragCoord.y)/9.))):1.;vec3 col=vColor*(.14+.86*vI)*shade*(.6+.4*contour)*hatch;gl_FragColor=vec4(col,opacity);}';
const dotVertex =
  'attribute float size; attribute float ring; varying vec3 vColor; varying float vRing; uniform float pixelRatio; void main(){vColor=color;vRing=ring;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*pixelRatio;}';
const dotFragment =
  'precision highp float; varying vec3 vColor; varying float vRing; void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;if(vRing<0.&&r<.32)discard;vec3 c=vRing>0.&&r>.32?vec3(1.):vColor;gl_FragColor=vec4(c,1.);}';
const palette = BANDS.map((b) => new THREE.Color(b.color));
const decrease = new THREE.Color('#409fff'),
  increase = new THREE.Color('#ff963e');
const fieldColor = (s) => (s.heat == null ? palette[s.band] : s.heat < 0 ? decrease : increase);

export class FluidField {
  constructor(container, onSelect, onStatus) {
    this.container = container;
    this.onSelect = onSelect;
    this.grid = scalpGrid(24, 40);
    this.meshes = [];
    this.glyphs = [];
    this.reliefs = [];
    this.weights = new Map();
    this.options = {
      mode: 'live',
      band: -1,
      scale: 80,
      lens: 0.5,
      cut: 20,
      focus: 0,
      selected: '',
      peaks: false,
    };
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute(
      'aria-label',
      'EEG scalp field. Drag to rotate, scroll to zoom. Surface markers show displayed channels; white rings mark sharp candidates.',
    );
    container.prepend(this.canvas);
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    } catch {
      this.canvas.remove();
      this.canvas = document.createElement('canvas');
      container.prepend(this.canvas);
      this.software = this.canvas.getContext('2d');
      this.yaw = 0.4;
      this.pitch = 0.6;
      this.zoom = 1;
      this.softwareControls();
      onStatus('Software field');
    }
    if (this.renderer) {
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.setClearColor('#060c14');
      this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      this.scene = new THREE.Scene();
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));
      const light = new THREE.DirectionalLight(0xffffff, 2.4);
      light.position.set(-3, 5, 4);
      this.scene.add(light);
      this.camera = new THREE.PerspectiveCamera(48, 1, 0.015, 300);
      this.controls = new OrbitControls(this.camera, this.canvas);
      this.controls.enableDamping = true;
      this.controls.minDistance = 0.15;
      this.controls.maxDistance = 60;
      this.fly = new FlyControls(this.camera, this.canvas);
      this.fly.movementSpeed = 2;
      this.fly.rollSpeed = 0.35;
      this.fly.dragToLook = true;
      this.fly.enabled = false;
      this.reference = new THREE.Group();
      this.scene.add(this.reference);
      this.raycaster = new THREE.Raycaster();
      this.canvas.addEventListener('pointerdown', (e) => {
        this.down = [e.clientX, e.clientY];
      });
      this.canvas.addEventListener('pointerup', (e) => {
        if (!this.down || Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 4)
          return;
        const r = this.canvas.getBoundingClientRect();
        this.raycaster.params.Points.threshold = 0.08;
        this.raycaster.setFromCamera(
          new THREE.Vector2(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            (-(e.clientY - r.top) / r.height) * 2 + 1,
          ),
          this.camera,
        );
        const surfaceHit = this.raycaster.intersectObjects(
          this.reliefs.filter((m) => m.visible),
        )[0];
        if (surfaceHit) {
          const channel = surfaceHit.object.userData.ranges.find(
            (r) => surfaceHit.faceIndex < r.end,
          );
          if (channel) this.onSelect(channel.name);
          return;
        }
        const hit = this.raycaster.intersectObjects(
          this.glyphs.filter((g) => g.visible).map((g) => g.userData.points),
        )[0];
        if (hit) this.onSelect(hit.object.userData.names[hit.index]);
      });
      this.reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      let last = performance.now();
      this.renderer.setAnimationLoop((now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (document.hidden || this.visible === false) return;
        this.settle(dt);
        this.fly.enabled ? this.fly.update(dt) : this.controls.update();
        this.renderer.render(this.scene, this.camera);
      });
      onStatus('Frequency field');
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
      this.sizeLabels();
    } else {
      const d = Math.min(devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(w * d);
      this.canvas.height = Math.round(h * d);
      this.drawSoftware();
    }
  }
  home() {
    if (this.camera) {
      this.camera.position.set(3, 2.8, 4.6);
      this.controls.target.set(0, 0.35, 0);
      this.camera.lookAt(this.controls.target);
    } else {
      this.yaw = 0.4;
      this.pitch = 0.6;
      this.zoom = 1;
      this.drawSoftware();
    }
  }
  side() {
    if (this.camera) {
      this.camera.position.set(0, 3.2, 10.8);
      this.controls.target.set(0, 0, 0);
      this.camera.lookAt(this.controls.target);
    } else {
      this.yaw = 0;
      this.pitch = 0.35;
      this.zoom = 1;
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
      this.sizeLabels();
    }
  }
  weightsFor(frame, grid = this.grid) {
    const key = grid.vertices.length + ':' + frame.channels.map((c) => c.name).join('|');
    if (!this.weights.has(key)) {
      if (this.weights.size > 32) this.weights.clear();
      this.weights.set(
        key,
        fieldWeights(
          grid.vertices,
          frame.channels.map((c) => c.name),
        ),
      );
    }
    return this.weights.get(key);
  }
  settle(dt) {
    const blend = 1 - Math.exp(-dt / 0.05);
    for (const mesh of this.meshes) {
      const target = mesh.userData.target;
      if (!mesh.visible || !target) continue;
      let error = 0;
      for (const name of ['position', 'intensity']) {
        const attr = mesh.geometry.attributes[name],
          data = attr.array;
        for (let i = 0; i < data.length; i++) {
          const delta = target[name][i] - data[i];
          data[i] += delta * blend;
          error = Math.max(error, Math.abs(delta));
        }
        attr.needsUpdate = true;
      }
      if (error < 0.0001) mesh.userData.target = null;
    }
  }
  placement(frame) {
    const o = this.options,
      start = o.rangeStart || 0,
      total = Math.max(0.001, (o.total || 1) - start),
      interval = o.relief && frame.waveform ? frame.waveform : frame,
      mid = (interval.start + interval.end) / 2 - start,
      focus = o.focus - start;
    const u = timePosition(total - mid, total, total - focus, o.lens);
    return {
      u,
      offset: o.mode === 'side' ? sidePosition(mid, total, focus, o.lens) : 0,
      scale: o.mode === 'side' ? (o.recent ? 0.53 : 0.32) : 1,
      radial: o.mode === 'history' ? 1 + u * 2 : 1,
    };
  }
  reliefData(frame, place) {
    return (frame.waveform?.channels || []).flatMap((c) => {
      if (this.options.selected && c.name !== this.options.selected) return [];
      const geometry = reliefGeometry(c, { ...this.options, radial: place.radial });
      if (!geometry) return [];
      const strongest = c.bands.indexOf(Math.max(...c.bands));
      const color = this.options.monochrome
        ? new THREE.Color('#dbe5ef')
        : palette[this.options.band >= 0 ? this.options.band : Math.max(0, strongest)];
      return [{ ...geometry, color, name: c.name, derived: c.status === 'derived' }];
    });
  }
  updateRelief(i, frame, place) {
    let mesh = this.reliefs[i];
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          roughness: 0.7,
          metalness: 0.1,
          side: THREE.DoubleSide,
          transparent: true,
        }),
      );
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.reliefs.push(mesh);
    }
    const key = [
      this.options.scale,
      this.options.cut,
      this.options.selected,
      this.options.monochrome,
      this.options.band,
      place.radial,
    ].join('|');
    if (mesh.userData.window !== frame.waveform || mesh.userData.key !== key) {
      const positions = [],
        colors = [],
        indices = [],
        ranges = [];
      for (const part of this.reliefData(frame, place)) {
        const offset = positions.length / 3;
        for (const p of part.positions) {
          positions.push(...p);
          const dim = part.derived ? 0.6 : 1;
          colors.push(part.color.r * dim, part.color.g * dim, part.color.b * dim);
        }
        for (const j of part.indices) indices.push(j + offset);
        ranges.push({ name: part.name, end: indices.length / 3 });
      }
      mesh.geometry.dispose();
      mesh.geometry = new THREE.BufferGeometry();
      mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      mesh.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      mesh.geometry.setIndex(indices);
      mesh.geometry.computeVertexNormals();
      mesh.userData = { window: frame.waveform, key, ranges };
    }
    mesh.position.set(place.offset, 0, 0);
    mesh.scale.setScalar(place.scale);
    mesh.material.opacity = this.options.mode === 'history' ? 0.7 : 1;
    mesh.material.depthWrite = this.options.mode !== 'history';
    mesh.visible = Boolean(frame.waveform);
  }
  getMesh(i) {
    if (this.meshes[i]) return this.meshes[i];
    const g = new THREE.BufferGeometry(),
      n = this.grid.vertices.length;
    for (const [attr, size] of [
      ['position', 3],
      ['color', 3],
      ['intensity', 1],
      ['coverage', 1],
      ['affected', 1],
    ])
      g.setAttribute(attr, new THREE.BufferAttribute(new Float32Array(n * size), size));
    g.setIndex(this.grid.indices);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      vertexColors: true,
      uniforms: { opacity: { value: 1 }, cut: { value: 20 } },
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: true,
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }
  glyphData(frame) {
    const points = [],
      names = [];
    for (const c of frame.channels) {
      if (this.options.selected && c.name !== this.options.selected) continue;
      const d = parseDerivation(c.name);
      if (!d) continue;
      const a = POSITIONS[d.a],
        b = d.bipolar ? POSITIONS[d.b] : a;
      const p = normalize(a.map((v, i) => (v + b[i]) / 2));
      const base = [p[0], p[1] * 0.88, p[2] * 1.12];
      const surface = spectralField(
        fieldWeights(
          [base],
          frame.channels.map((c) => c.name),
        )[0],
        frame.channels,
        this.options,
      );
      const s = spectralField([{ weight: 1, signed: 0 }], [c], this.options);
      const available = c.valid && s.coverage > 0;
      const radial = this.placement(frame).radial;
      const position = base.map((v) => v * (1 + (surface.displacement + 0.012) / radial));
      const color = available
        ? (this.options.monochrome ? new THREE.Color('#dbe5ef') : fieldColor(s))
            .clone()
            .multiplyScalar(0.35 + 0.65 * s.amp)
        : new THREE.Color('#637080');
      const event =
        available &&
        c.status !== 'derived' &&
        (this.options.mode === 'live'
          ? c.transients?.events?.some((e) => e.time >= frame.end - 0.65)
          : c.sharpCount > 0);
      points.push({
        position,
        color,
        size: (available ? 5 + 3 * s.amp : 5) * (this.options.mode === 'live' ? 1 : 0.6),
        ring: !available ? -1 : event ? 1 : 0,
      });
      names.push(c.name);
    }
    return { points, names };
  }
  updateGlyph(i, frame, placement) {
    let group = this.glyphs[i];
    if (!group) {
      group = new THREE.Group();
      const dots = new THREE.Points(
        new THREE.BufferGeometry(),
        new THREE.ShaderMaterial({
          vertexShader: dotVertex,
          fragmentShader: dotFragment,
          vertexColors: true,
          uniforms: { pixelRatio: { value: Math.min(devicePixelRatio, 2) } },
        }),
      );
      group.add(dots);
      group.userData = { points: dots };
      this.scene.add(group);
      this.glyphs.push(group);
    }
    const data = this.glyphData(frame),
      dots = group.userData.points;
    const pos = [],
      colors = [],
      sizes = [],
      rings = [];
    for (const p of data.points) {
      pos.push(...p.position);
      colors.push(p.color.r, p.color.g, p.color.b);
      sizes.push(p.size);
      rings.push(p.ring);
    }
    dots.geometry.dispose();
    dots.geometry = new THREE.BufferGeometry();
    for (const [k, v, n] of [
      ['position', pos, 3],
      ['color', colors, 3],
      ['size', sizes, 1],
      ['ring', rings, 1],
    ])
      dots.geometry.setAttribute(k, new THREE.Float32BufferAttribute(v, n));
    dots.userData.names = data.names;
    group.position.set(placement.offset, 0, 0);
    group.scale.setScalar(placement.scale * placement.radial);
    group.visible = true;
  }
  update(frames, options = {}) {
    this.options = { ...this.options, ...options };
    this.frames = frames || [];
    if (this.software) {
      this.drawSoftware();
      return;
    }
    const o = this.options,
      shown = o.mode === 'live' ? this.frames.slice(-1) : this.frames;
    shown.forEach((frame, i) => {
      const mesh = this.getMesh(i),
        attrs = mesh.geometry.attributes,
        place = this.placement(frame),
        weights = o.relief ? null : this.weightsFor(frame);
      const context = [frame.segment, frame.source, o.band, o.selected, o.scale, o.map].join('|');
      const prior =
        !o.relief &&
        o.mode === 'live' &&
        !this.reduceMotion &&
        mesh.userData.context === context &&
        frame.end - mesh.userData.end > 0 &&
        frame.end - mesh.userData.end < 2
          ? { position: attrs.position.array.slice(), intensity: attrs.intensity.array.slice() }
          : null;
      mesh.visible = true;
      mesh.position.set(place.offset, 0, 0);
      mesh.scale.setScalar(place.scale);
      for (let j = 0; j < this.grid.vertices.length; j++) {
        const v = this.grid.vertices[j],
          s = o.relief ? {} : spectralField(weights[j], frame.channels, o);
        const radial = o.relief ? place.radial - 0.2 : place.radial + s.displacement;
        attrs.position.setXYZ(j, v[0] * radial, v[1] * radial, v[2] * radial);
        const color = o.relief
          ? new THREE.Color('#53677b')
          : o.monochrome
            ? new THREE.Color('#dbe5ef')
            : fieldColor(s);
        attrs.color.setXYZ(j, color.r, color.g, color.b);
        attrs.intensity.setX(j, o.relief ? 0.5 : s.amp);
        attrs.coverage.setX(j, o.relief ? 1 : s.coverage);
        attrs.affected.setX(j, o.relief ? 0 : s.affected);
      }
      Object.values(attrs).forEach((a) => (a.needsUpdate = true));
      mesh.userData.target = prior
        ? { position: attrs.position.array.slice(), intensity: attrs.intensity.array.slice() }
        : null;
      if (prior) for (const name of ['position', 'intensity']) attrs[name].array.set(prior[name]);
      mesh.userData.context = o.mode === 'live' ? context : null;
      mesh.userData.end = frame.end;
      mesh.material.uniforms.opacity.value = o.mode === 'history' ? 0.22 : 0.98;
      mesh.material.depthWrite = o.mode !== 'history';
      mesh.material.uniforms.cut.value = o.cut;
      if (o.relief) {
        this.updateRelief(i, frame, place);
        if (this.glyphs[i]) this.glyphs[i].visible = false;
      } else {
        this.updateGlyph(i, frame, place);
        if (this.reliefs[i]) this.reliefs[i].visible = false;
      }
    });
    for (let i = shown.length; i < this.meshes.length; i++) this.meshes[i].visible = false;
    for (let i = shown.length; i < this.glyphs.length; i++) this.glyphs[i].visible = false;
    for (let i = shown.length; i < this.reliefs.length; i++) this.reliefs[i].visible = false;
    this.makeReference();
  }
  label(text, position, color = '#cbdcea', scale = 0.65) {
    const canvas = document.createElement('canvas'),
      ctx = canvas.getContext('2d');
    ctx.font = '32px sans-serif';
    canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
    canvas.height = 44;
    ctx.font = '32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, 34);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: new THREE.CanvasTexture(canvas),
        depthTest: false,
        sizeAttenuation: false,
      }),
    );
    sprite.position.set(...position);
    sprite.userData.aspect = canvas.width / canvas.height;
    this.reference.add(sprite);
    this.sizeLabels();
  }
  sizeLabels() {
    if (!this.camera || !this.reference) return;
    const height =
      (22 * 2 * Math.tan((this.camera.fov * Math.PI) / 360)) /
      Math.max(1, this.container.clientHeight);
    for (const o of this.reference.children)
      if (o.isSprite) o.scale.set(height * o.userData.aspect, height, 1);
  }
  referenceLine(points, color = '#667f91') {
    const g = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
    this.reference.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false })));
  }
  makeReference() {
    const o = this.options,
      key =
        o.mode === 'side'
          ? [o.mode, o.total, o.focus, o.lens, o.rangeStart, o.recent].join('|')
          : o.mode;
    if (this.referenceKey === key) return;
    this.referenceKey = key;
    for (const child of [...this.reference.children]) {
      child.geometry?.dispose();
      child.material.map?.dispose();
      child.material.dispose();
      this.reference.remove(child);
    }
    if (o.mode === 'side') {
      const start = o.rangeStart || 0,
        span = Math.max(0.001, o.total - start);
      const ticks = sideTicks(span, o.focus - start, o.lens);
      this.referenceLine([
        [-4, -0.65, 0],
        [4, -0.65, 0],
      ]);
      for (const [i, t] of ticks.entries()) {
        this.referenceLine([
          [t.x, -0.6, 0],
          [t.x, -0.72, 0],
        ]);
        if (i === 0 || i === 4)
          this.label(
            (o.recent ? '' : i === 0 ? 'Start ' : 'Present ') + fieldTime(t.time + start),
            [t.x, -0.95, 0],
          );
      }
      const x = sidePosition(o.focus - start, span, o.focus - start, o.lens);
      this.referenceLine(
        [
          [x, -0.56, 0],
          [x, -0.77, 0],
        ],
        '#ffffff',
      );
    } else {
      for (const [label, p] of [
        ['L', [-1.65, 0.1, 0]],
        ['R', [1.65, 0.1, 0]],
        ['Front', [0, 0.1, -1.65]],
        ['Back', [0, 0.1, 1.65]],
      ])
        this.label(label, p);
    }
  }
  softwareControls() {
    let down = null;
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
    this.canvas.addEventListener('pointerup', () => {
      down = null;
    });
    this.canvas.addEventListener('pointercancel', () => {
      down = null;
    });
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = Math.max(0.2, Math.min(6, this.zoom * Math.exp(-e.deltaY * 0.001)));
        this.drawSoftware();
      },
      { passive: false },
    );
  }
  drawSoftware() {
    if (!this.software || !this.frames) return;
    const ctx = this.software,
      w = this.canvas.width,
      h = this.canvas.height,
      o = this.options;
    ctx.fillStyle = '#060c14';
    ctx.fillRect(0, 0, w, h);
    const grid = scalpGrid(16, 28),
      shown = o.mode === 'live' ? this.frames.slice(-1) : this.frames,
      tris = [],
      glyphs = [];
    const project = (v) => {
      const [x, y, z] = v,
        xx = x * Math.cos(this.yaw) + z * Math.sin(this.yaw),
        zz = -x * Math.sin(this.yaw) + z * Math.cos(this.yaw);
      const yy = y * Math.cos(this.pitch) - zz * Math.sin(this.pitch),
        depth = y * Math.sin(this.pitch) + zz * Math.cos(this.pitch);
      const k = Math.min(w / (o.mode === 'side' ? 10 : 6), h / 4) * this.zoom;
      return [w / 2 + xx * k, h * 0.48 - yy * k, depth];
    };
    for (const f of shown) {
      const place = this.placement(f),
        weights = o.relief ? null : this.weightsFor(f, grid);
      const values = o.relief
        ? grid.vertices.map(() => ({}))
        : weights.map((v) => spectralField(v, f.channels, o));
      const pts = grid.vertices.map((v, i) =>
        project(
          v.map(
            (x, j) =>
              x *
                (o.relief ? place.radial - 0.2 : place.radial + values[i].displacement) *
                place.scale +
              (j === 0 ? place.offset : 0),
          ),
        ),
      );
      for (let i = 0; i < grid.indices.length; i += 3) {
        const ids = grid.indices.slice(i, i + 3),
          s = values[ids[0]];
        if (
          (!o.relief && s.coverage < 0.08) ||
          ids.some((j) => grid.vertices[j][0] * (o.relief ? place.radial - 0.2 : 1) > o.cut)
        )
          continue;
        tris.push({
          p: ids.map((j) => pts[j]),
          amp: o.relief ? 0.3 : ids.reduce((a, j) => a + values[j].amp, 0) / 3,
          color: o.relief
            ? new THREE.Color('#53677b')
            : o.monochrome
              ? new THREE.Color('#dbe5ef')
              : fieldColor(s),
          z: ids.reduce((a, j) => a + pts[j][2], 0),
          affected: s.affected,
        });
      }
      if (o.relief) {
        for (const part of this.reliefData(f, place)) {
          const projected = part.positions.map((v) =>
            project(v.map((x, j) => x * place.scale + (j === 0 ? place.offset : 0))),
          );
          for (let i = 0; i < part.indices.length; i += 3) {
            const ids = part.indices.slice(i, i + 3),
              [a, b, c] = ids.map((j) => part.positions[j]);
            const u = b.map((x, j) => x - a[j]),
              v = c.map((x, j) => x - a[j]);
            const n = normalize([
              u[1] * v[2] - u[2] * v[1],
              u[2] * v[0] - u[0] * v[2],
              u[0] * v[1] - u[1] * v[0],
            ]);
            const shade = 0.3 + 0.7 * Math.abs(-0.424 * n[0] + 0.707 * n[1] + 0.566 * n[2]);
            tris.push({
              p: ids.map((j) => projected[j]),
              z: ids.reduce((s, j) => s + projected[j][2], 0),
              amp: shade * (part.derived ? 0.6 : 1),
              color: part.color,
              relief: true,
            });
          }
        }
        continue;
      }
      const data = this.glyphData(f);
      const transform = (v) =>
        project(v.map((x, j) => x * place.radial * place.scale + (j === 0 ? place.offset : 0)));
      data.points.forEach((p) => glyphs.push({ ...p, position: transform(p.position) }));
    }
    tris
      .sort((a, b) => a.z - b.z)
      .forEach((t) => {
        ctx.globalAlpha = o.mode === 'history' ? (t.relief ? 0.7 : 0.18) : 1;
        ctx.fillStyle = t.color
          .clone()
          .multiplyScalar(0.06 + 0.8 * t.amp)
          .getStyle();
        ctx.beginPath();
        t.p.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.closePath();
        ctx.fill();
        if (!t.relief) {
          ctx.globalAlpha = o.mode === 'history' ? 0.15 : 0.3;
          ctx.strokeStyle = '#08131d';
          ctx.stroke();
        }
      });
    ctx.globalAlpha = 1;
    const d = Math.min(devicePixelRatio || 1, 2);
    glyphs
      .sort((a, b) => a.position[2] - b.position[2])
      .forEach((p) => {
        ctx.strokeStyle = '#' + p.color.getHexString();
        ctx.lineWidth = 1.5 * d;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.arc(...p.position.slice(0, 2), (p.size * d) / 2, 0, Math.PI * 2);
        if (p.ring >= 0) ctx.fill();
        ctx.strokeStyle = p.ring > 0 ? '#ffffff' : ctx.fillStyle;
        ctx.stroke();
      });
    ctx.font = 13 * d + 'px sans-serif';
    ctx.textAlign = 'center';
    const line = (a, b, color) => {
      const p = project(a),
        q = project(b);
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
      ctx.stroke();
    };
    const label = (text, p) => {
      const q = project(p);
      ctx.fillStyle = '#dce8f1';
      ctx.fillText(text, q[0], q[1]);
    };
    if (o.mode === 'side') {
      const start = o.rangeStart || 0,
        span = Math.max(0.001, o.total - start);
      line([-4, -0.65, 0], [4, -0.65, 0], '#829aaa');
      sideTicks(span, o.focus - start, o.lens).forEach((t, i) => {
        line([t.x, -0.6, 0], [t.x, -0.72, 0], '#829aaa');
        if (i === 0 || i === 4)
          label((o.recent ? '' : i === 0 ? 'Start ' : 'Present ') + fieldTime(t.time + start), [
            t.x,
            -0.95,
            0,
          ]);
      });
      const x = sidePosition(o.focus - start, span, o.focus - start, o.lens);
      line([x, -0.56, 0], [x, -0.77, 0], '#ffffff');
    } else
      for (const [text, p] of [
        ['L', [-1.65, 0.1, 0]],
        ['R', [1.65, 0.1, 0]],
        ['Front', [0, 0.1, -1.65]],
        ['Back', [0, 0.1, 1.65]],
      ])
        label(text, p);
  }
}
