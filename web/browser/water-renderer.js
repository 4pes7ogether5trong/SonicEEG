import * as THREE from 'three';
import { BANDS } from './signal.js';
import { scalpGrid, normalize } from './field-math.js';
import {
  WATER_CHANNELS,
  WATER_SAMPLES,
  sampleWave,
  waterChannels,
  waterAt,
  missingWaterSources,
} from './water-math.js';
import { regionalArchitectures } from './fluid-episodes.js';
import { WaveformClock } from './waveform-clock.js';

const vertex = `
uniform sampler2D waves;
uniform vec4 sourceA[32]; uniform vec4 sourceB[32]; uniform vec4 sourceColor[32];
uniform vec3 dropPosition[24]; uniform float dropStrength[24];
uniform float waveSpan[32];
uniform vec3 missingSource[64]; uniform int missingCount;
uniform int channels; uniform int dropCount;
uniform float ruler; uniform float lag; uniform float radial; uniform float mono;
varying vec3 vWorld; varying vec3 vLocal; varying vec3 vColor; varying float vCoverage; varying float vHeight; varying float vMissing;
void main(){
 vec3 p=normalize(vec3(position.x,position.y/.88,position.z/1.12));
 float sum=0.;float weight=0.;float coverage=0.;float power=0.;vec3 col=vec3(.22,.42,.67);
 for(int i=0;i<32;i++){
  if(i>=channels)break;
  for(int pole=0;pole<2;pole++){
   if(pole==1&&sourceA[i].w<.5)continue;
   vec3 center=pole==0?sourceA[i].xyz:sourceB[i].xyz;
   float d=acos(clamp(dot(p,center),-1.,1.));
   if(d>=1.05)continue;
   float k=pow(1.-pow(d/1.05,2.),3.)*sourceB[i].w;
   float sampleTime=waveSpan[i]-lag-d/1.05*1.45;
   float t=clamp(sampleTime/waveSpan[i],0.,1.);
   float sampleIndex=t*${WATER_SAMPLES - 1}.;float lo=floor(sampleIndex);
   float a=texture2D(waves,vec2((lo+.5)/${WATER_SAMPLES}.,(float(i)+.5)/32.)).r;
   float b=texture2D(waves,vec2((min(${WATER_SAMPLES - 1}.,lo+1.)+.5)/${WATER_SAMPLES}.,(float(i)+.5)/32.)).r;
   float v=sampleTime<0.||sampleTime>waveSpan[i]?0.:mix(a,b,fract(sampleIndex));
   sum+=k*v*(pole==0?1.:-1.);weight+=k;coverage=max(coverage,k);
   if(k*sourceColor[i].w>power){power=k*sourceColor[i].w;col=sourceColor[i].xyz;}
  }
 }
 float missing=0.;
 for(int i=0;i<64;i++){
  if(i>=missingCount)break;
  float d=acos(clamp(dot(p,missingSource[i]),-1.,1.));
  if(d<1.05)missing=max(missing,pow(1.-pow(d/1.05,2.),3.));
 }
 vMissing=(coverage<.015||missing>coverage*.55)?1.:0.;
 float height=clamp(sum/max(1.,weight)/ruler*.2,-.24,.24);
 for(int j=0;j<24;j++){
  if(j>=dropCount)break;
  float d=acos(clamp(dot(p,dropPosition[j]),-1.,1.));
  height+=.075*dropStrength[j]*exp(-d*d/.035);
 }
 vec3 n=normalize(vec3(p.x,p.y/.88,p.z/1.12));
 vec3 displaced=position*radial+n*height;
 vLocal=displaced;vWorld=(modelMatrix*vec4(displaced,1.)).xyz;
 vColor=mix(col,vec3(.69,.8,.93),mono);vCoverage=coverage;vHeight=abs(height);
 gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
}`;
const fragment = `
uniform float cut;uniform float opacity;
varying vec3 vWorld;varying vec3 vLocal;varying vec3 vColor;varying float vCoverage;varying float vHeight; varying float vMissing;
void main(){
 if(vLocal.x>cut)discard;
 vec3 n=normalize(cross(dFdx(vWorld),dFdy(vWorld)));
 vec3 eye=normalize(cameraPosition-vWorld);if(dot(n,eye)<0.)n=-n;
 vec3 light=normalize(vec3(-.5,.9,.6));
 float diffuse=max(0.,dot(n,light));
 float spec=pow(max(0.,dot(n,normalize(light+eye))),70.);
 float rim=pow(1.-max(0.,dot(n,eye)),3.);
 float evidence=smoothstep(.015,.2,vCoverage);
 vec3 col=vColor*(.12+.42*diffuse+min(.24,vHeight*1.4))*(.18+.82*evidence);
 col+=vec3(.74,.86,1.)*(spec*.9+rim*.2)*(.18+.82*evidence);
 float hatch=step(.55,fract((gl_FragCoord.x+gl_FragCoord.y)/10.));
 col=mix(col,mix(vec3(.11,.14,.18),vec3(.34,.39,.45),hatch),vMissing*.9);
 gl_FragColor=vec4(col,opacity);
}`;
const palette = BANDS.map((b) => new THREE.Color(b.color));
const vectors = (n, size = 3) =>
  Array.from({ length: n }, () => (size === 4 ? new THREE.Vector4() : new THREE.Vector3()));
export function waterMeshData(rows = 96, cols = 192) {
  const grid = scalpGrid(rows, cols),
    geometry = new THREE.BufferGeometry();
  for (let i = 0; i <= cols; i++) grid.vertices[i] = [0, 0.88, 0];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(grid.vertices.flat(), 3));
  geometry.setIndex(grid.indices);
  return geometry;
}
export class WaterRenderer {
  constructor(scene) {
    this.scene = scene;
    this.surfaces = [];
    this.drops = [];
    this.shapes = {
      stem: new THREE.ConeGeometry(1, 1, 28),
      round: new THREE.SphereGeometry(1, 28, 20),
    };
  }
  hide() {
    for (const m of [...this.surfaces, ...this.drops]) m.visible = false;
  }
  mesh(i, live) {
    let m = this.surfaces[i];
    if (!m) {
      const texture = new THREE.DataTexture(
        new Float32Array(WATER_CHANNELS * WATER_SAMPLES),
        WATER_SAMPLES,
        WATER_CHANNELS,
        THREE.RedFormat,
        THREE.FloatType,
      );
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      const uniforms = {
        waves: { value: texture },
        sourceA: { value: vectors(32, 4) },
        sourceB: { value: vectors(32, 4) },
        sourceColor: { value: vectors(32, 4) },
        waveSpan: { value: new Float32Array(32) },
        missingSource: { value: vectors(64) },
        missingCount: { value: 0 },
        dropPosition: { value: vectors(24) },
        dropStrength: { value: new Float32Array(24) },
        dropCount: { value: 0 },
        channels: { value: 0 },
        ruler: { value: 80 },
        lag: { value: 0 },
        radial: { value: 1 },
        mono: { value: 0 },
        cut: { value: 20 },
        opacity: { value: 1 },
      };
      m = new THREE.Mesh(
        waterMeshData(live ? 96 : 40, live ? 192 : 80),
        new THREE.ShaderMaterial({
          vertexShader: vertex,
          fragmentShader: fragment,
          uniforms,
          side: THREE.DoubleSide,
          transparent: true,
        }),
      );
      m.frustumCulled = false;
      this.scene.add(m);
      this.surfaces.push(m);
      m.userData.live = live;
      m.userData.clock = new WaveformClock();
    }
    if (m.userData.live !== live) {
      m.geometry.dispose();
      m.geometry = waterMeshData(live ? 96 : 40, live ? 192 : 80);
      m.userData.live = live;
    }
    return m;
  }
  update(frames, options, placement) {
    if (options.frozen && !this.options?.frozen)
      for (const m of this.surfaces) m.userData.heldLag = m.material.uniforms.lag.value;
    this.options = options;
    this.hide();
    let di = 0;
    frames.forEach((f, i) => {
      const place = placement(f),
        m = this.mesh(i, options.mode === 'live'),
        u = m.material.uniforms;
      m.visible = true;
      m.position.set(place.offset, 0, 0);
      m.scale.setScalar(place.scale);
      const cs = waterChannels(f, options.selected);
      const missing = missingWaterSources(f, options.selected);
      u.missingCount.value = missing.length;
      missing.forEach((p, j) => u.missingSource.value[j].set(...p));
      if (m.userData.waveform !== f.waveform || m.userData.selected !== options.selected) {
        u.waves.value.image.data.fill(0);
        cs.forEach((c, j) => {
          for (let k = 0; k < WATER_SAMPLES; k++)
            u.waves.value.image.data[j * WATER_SAMPLES + k] = sampleWave(
              c.wave,
              (k / (WATER_SAMPLES - 1)) * (c.wave.duration - 1 / c.wave.rate),
            );
          u.sourceA.value[j].set(...c.a, c.b ? 1 : 0);
          u.sourceB.value[j].set(...(c.b || c.a), c.status === 'derived' ? 0.4 : 1);
          u.waveSpan.value[j] = c.wave.duration - 1 / c.wave.rate;
        });
        u.waves.value.needsUpdate = true;
        m.userData.waveform = f.waveform;
        m.userData.selected = options.selected;
      }
      cs.forEach((c, j) => {
        const color = palette[options.band >= 0 ? options.band : Math.max(0, c.band)];
        u.sourceColor.value[j].set(color.r, color.g, color.b, c.rms);
      });
      u.channels.value = cs.length;
      u.ruler.value = Math.max(1, options.scale);
      u.radial.value = place.radial;
      u.mono.value = options.monochrome ? 1 : 0;
      u.cut.value = options.cut;
      u.opacity.value = options.mode === 'history' ? 0.34 : 1;
      m.material.depthWrite = options.mode !== 'history';
      if (m.userData.end !== f.waveform?.end) {
        m.userData.arrival = performance.now();
        m.userData.end = f.waveform?.end;
      }
      m.userData.clock.ingest(f, performance.now(), options.mode);
      const ds = regionalArchitectures(options.dropletsFor(f), options.scale),
        active = ds.filter((d) => d.active).slice(0, 24);
      u.dropCount.value = active.length;
      active.forEach((d, j) => {
        u.dropPosition.value[j].set(...d.position);
        u.dropStrength.value[j] = d.size;
      });
      for (const d of ds) {
        const dp =
          options.mode === 'live'
            ? place
            : placement({ ...f, waveform: null, start: d.exampleStart ?? d.start, end: d.end });
        const p = d.position,
          base = [p[0], p[1] * 0.88, p[2] * 1.12],
          normal = normalize([p[0], p[1] / 0.88, p[2] / 1.12]);
        if (base[0] * dp.radial > options.cut) continue;
        for (const part of d.parts) {
          const e = part.episode;
          let drop = this.drops[di];
          if (!drop) {
            drop = new THREE.Mesh(
              this.shapes[part.shape],
              new THREE.MeshStandardMaterial({
                transparent: true,
                roughness: 0.19,
                metalness: 0.38,
                depthWrite: false,
              }),
            );
            this.scene.add(drop);
            this.drops.push(drop);
          }
          drop.geometry = this.shapes[part.shape];
          drop.visible = true;
          drop.position.set(
            base[0] * dp.radial * dp.scale + dp.offset,
            base[1] * dp.radial * dp.scale,
            base[2] * dp.radial * dp.scale,
          );
          drop.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(...normal),
          );
          const size = dp.scale * d.size;
          drop.position.addScaledVector(new THREE.Vector3(...normal), part.y * size);
          drop.scale.set(
            part.radius * size,
            (part.height || part.radius) * size,
            part.radius * size,
          );
          const color = options.monochrome
            ? new THREE.Color('#c5dced')
            : palette[options.band >= 0 ? options.band : Math.max(0, e.band || 0)];
          drop.material.color.copy(color).multiplyScalar(0.3 + 0.7 * e.brightness);
          drop.material.emissive
            .copy(color)
            .multiplyScalar(Math.max(0.025, (e.brightness - 0.13) * 0.5));
          drop.material.opacity = e.opacity;
          drop.userData = {
            episode: e,
            architecture: d,
            base: drop.position.clone(),
            normal: new THREE.Vector3(...normal),
            scale: dp.scale,
            channels: cs,
            surface: m,
          };
          di++;
        }
      }
    });
    this.animate(performance.now());
  }
  animate(now) {
    for (const m of this.surfaces)
      if (m.visible) {
        const moving = this.options.animate && this.options.mode === 'live';
        m.material.uniforms.lag.value = this.options.frozen
          ? m.userData.heldLag || 0
          : moving
            ? m.userData.clock.lag(now)
            : 0;
      }
    for (const d of this.drops)
      if (d.visible && d.userData.architecture.active) {
        const x = d.userData,
          lag = x.surface.material.uniforms.lag.value;
        const height =
          waterAt(x.architecture.position, x.channels, { scale: this.options.scale, lag }).height +
          0.075 * x.architecture.size;
        d.position.copy(x.base).addScaledVector(x.normal, height * x.scale);
      }
  }
}
