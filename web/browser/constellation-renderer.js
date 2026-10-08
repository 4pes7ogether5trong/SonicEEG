import * as THREE from 'three';
import { cloudContext, cloudEase } from './cloud-motion.js';

const vertex = `attribute float size; attribute float alpha; attribute float ring;
varying vec3 vColor; varying float vAlpha; varying float vRing; uniform float pixelRatio;
void main(){vColor=color;vAlpha=alpha;vRing=ring;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*pixelRatio*2.1;}`;
const fragment = `varying vec3 vColor; varying float vAlpha; varying float vRing;
void main(){vec2 p=gl_PointCoord-.5;float r=length(p);if(r>.5)discard;
float glow=exp(-r*r*38.);float core=1.-smoothstep(.035,.075,r);
float rays=(1.-smoothstep(.006,.025,min(abs(p.x),abs(p.y))))*(1.-smoothstep(.06,.24,r))*.28;
float rim=(1.-smoothstep(.011,.025,abs(r-.155)));
float a=vRing<0.?rim*.7:max(glow*.5+core+rays,vRing>0.?rim*.8:0.);
vec3 col=mix(vColor,vec3(1.),max(core,vRing>0.?rim:0.));gl_FragColor=vec4(col,min(1.,a)*vAlpha);}`;
const lineVertex = `attribute float alpha; varying vec3 vColor; varying float vAlpha;
void main(){vColor=color;vAlpha=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const lineFragment = `varying vec3 vColor; varying float vAlpha;void main(){gl_FragColor=vec4(vColor,vAlpha);}`;

export class ConstellationRenderer {
  constructor(scene, pixelRatio = 1) {
    this.group = new THREE.Group();
    this.points = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        uniforms: { pixelRatio: { value: pixelRatio } },
      }),
    );
    this.lines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        vertexShader: lineVertex,
        fragmentShader: lineFragment,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = this.lines.frustumCulled = false;
    this.group.add(this.lines, this.points);
    this.group.visible = false;
    scene.add(this.group);
    this.states = [];
  }
  hide() {
    this.group.visible = false;
    this.context = null;
  }
  update(data, frames, options, now = performance.now()) {
    const context = cloudContext(frames, options);
    const blend =
      this.group.visible &&
      this.context === context &&
      options.animate &&
      !options.frozen &&
      !options.reducedMotion &&
      options.total > this.end &&
      options.total - this.end < 3 &&
      !frames.at(-1)?.gaps &&
      !frames.at(-1)?.mixed;
    const previous = new Map(this.states.map((s) => [s.key, s]));
    this.states = data.stars.map((s) => {
      const old = blend ? previous.get(s.key) : null;
      const target = { ...s, rgb: new THREE.Color(s.color).toArray() };
      return {
        ...target,
        position: old ? old.position.slice() : s.position.slice(),
        rgb: old ? old.rgb.slice() : target.rgb.slice(),
        size: old?.size ?? s.size,
        alpha: old?.alpha ?? (blend && s.available ? 0 : s.alpha),
        target,
      };
    });
    this.from = this.states.map((s) => ({
      position: s.position.slice(),
      rgb: s.rgb.slice(),
      size: s.size,
      alpha: s.alpha,
    }));
    this.links = data.links;
    for (const [object, count, attrs] of [
      [this.points, this.states.length, { position: 3, color: 3, size: 1, alpha: 1, ring: 1 }],
      [this.lines, this.links.length * 2, { position: 3, color: 3, alpha: 1 }],
    ]) {
      object.geometry.dispose();
      object.geometry = new THREE.BufferGeometry();
      for (const [name, size] of Object.entries(attrs))
        object.geometry.setAttribute(
          name,
          new THREE.Float32BufferAttribute(new Float32Array(count * size), size),
        );
    }
    this.started = blend ? now : now - 360;
    this.context = context;
    this.end = options.total;
    this.group.visible = true;
    this.animate(now);
  }
  animate(now) {
    if (!this.group.visible || !this.from) return;
    const mix = cloudEase(now - this.started),
      a = this.points.geometry.attributes;
    this.states.forEach((s, i) => {
      const from = this.from[i],
        to = s.target;
      for (let j = 0; j < 3; j++) {
        s.position[j] = from.position[j] + (to.position[j] - from.position[j]) * mix;
        s.rgb[j] = from.rgb[j] + (to.rgb[j] - from.rgb[j]) * mix;
      }
      s.alpha = from.alpha + (to.alpha - from.alpha) * mix;
      s.size = from.size + (to.size - from.size) * mix;
      a.position.setXYZ(i, ...s.position);
      a.color.setXYZ(i, ...s.rgb);
      a.alpha.setX(i, s.alpha);
      a.size.setX(i, s.size);
      a.ring.setX(i, s.ring);
    });
    const lines = this.lines.geometry.attributes;
    this.links.forEach((link, i) => {
      const c =
        link.kind === 'spatial' ? new THREE.Color('#91b5d8').toArray() : this.states[link.b].rgb;
      [link.a, link.b].forEach((index, end) => {
        const s = this.states[index],
          vertex = i * 2 + end;
        lines.position.setXYZ(vertex, ...s.position);
        lines.color.setXYZ(vertex, ...c);
        lines.alpha.setX(vertex, link.alpha * Math.min(1, s.alpha / 0.3));
      });
    });
    [...Object.values(a), ...Object.values(lines)].forEach((x) => {
      x.needsUpdate = true;
    });
    if (mix === 1) this.from = null;
  }
}
