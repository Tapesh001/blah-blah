import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { World } from '../api';
import {
  GRID_A,
  GRID_B,
  ISLE_A,
  ISLE_B,
  ROADS,
  buildHeightTexture,
  buildTerrainMesh,
  fbm,
  heightAt,
  roadNearest,
  roadPoint,
  type IsleGrid,
} from './terrain';

/* ---- shared waves: CPU and GPU use the same table ---- */
const WAVES = [
  { d: [0.8, 0.6], a: 0.55, l: 46 },
  { d: [0.95, -0.3], a: 0.34, l: 27 },
  { d: [0.5, 0.86], a: 0.22, l: 15 },
  { d: [1.0, 0.1], a: 0.8, l: 90 },
  { d: [0.3, 0.95], a: 0.12, l: 8.5 },
  { d: [0.7, -0.7], a: 0.09, l: 5.2 },
];
const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+17.;a*=.5;}return s;}
`;

export interface WorldHandle extends World {
  renderer: THREE.WebGLRenderer;
  update(dt: number): void;
  render(): void;
  resize(): void;
  /** 0..1 flash for speed blur etc. */
  speedFx: number;
}

export function createWorld(canvas: HTMLCanvasElement): WorldHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.62;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 14000);
  scene.fog = new THREE.FogExp2(0x9fb4c4, 0.0006);

  /* ---- sky + lights ---- */
  const sky = new Sky();
  sky.scale.setScalar(12000);
  scene.add(sky);
  const skyU = sky.material.uniforms;
  const sunDir = new THREE.Vector3();
  const sun = new THREE.DirectionalLight(0xffe2b8, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.near = 1;
  sc.far = 600;
  sc.left = sc.bottom = -90;
  sc.right = sc.top = 90;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4234, 1);
  scene.add(hemi);

  /* ---- terrain ---- */
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  scene.add(buildTerrainMesh(GRID_A, terrainMat), buildTerrainMesh(GRID_B, terrainMat));
  const hTexA = buildHeightTexture(GRID_A);
  const hTexB = buildHeightTexture(GRID_B);

  /* ---- ocean ---- */
  const oceanU = {
    uTime: { value: 0 },
    uSea: { value: 0.6 },
    uCam: { value: new THREE.Vector3() },
    uSun: { value: sunDir },
    uSunCol: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uZenith: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uFogD: { value: 0.0006 },
    uFoam: { value: 0.2 },
    uWd: { value: WAVES.map((w) => new THREE.Vector2(w.d[0], w.d[1]).normalize()) },
    uWa: { value: WAVES.map((w) => w.a) },
    uWl: { value: WAVES.map((w) => w.l) },
  };
  const oceanGeo = new THREE.PlaneGeometry(2, 2, 320, 320);
  oceanGeo.rotateX(-Math.PI / 2);
  const ocean = new THREE.Mesh(
    oceanGeo,
    new THREE.ShaderMaterial({
      uniforms: oceanU,
      vertexShader: /* glsl */ `
uniform float uTime,uSea; uniform vec3 uCam; uniform vec2 uWd[6]; uniform float uWa[6],uWl[6];
varying vec3 vW; varying vec3 vN; varying float vCrest;
void main(){
 vec2 g=position.xz; vec2 a=abs(g);
 vec2 w=sign(g)*(a*70.+pow(a,vec2(4.))*5200.);
 vec2 p=floor(uCam.xz/4.)*4.+w;
 vec3 P=vec3(p.x,0.,p.y); vec3 N=vec3(0.,1.,0.); float crest=0.;
 for(int i=0;i<6;i++){
  float k=6.2831853/uWl[i]; float om=sqrt(9.81*k); float A=uWa[i]*uSea;
  float th=k*dot(uWd[i],p)-om*uTime;
  float s=sin(th),c=cos(th);
  P.y+=A*s; P.xz+=uWd[i]*A*0.55*c;
  N.xz-=uWd[i]*k*A*c; crest+=A*k*s;
 }
 vW=P; vN=normalize(N); vCrest=crest;
 gl_Position=projectionMatrix*viewMatrix*vec4(P,1.);
}`,
      fragmentShader: /* glsl */ `
uniform float uTime,uSea,uFogD,uFoam; uniform vec3 uCam,uSun,uSunCol,uHorizon,uZenith,uDeep,uFog;
varying vec3 vW; varying vec3 vN; varying float vCrest;
${NOISE_GLSL}
void main(){
 vec3 V=normalize(uCam-vW); float dist=length(uCam-vW);
 vec2 q=vW.xz;
 float n1=fbm(q*0.35+uTime*vec2(.5,.3)), n2=fbm(q*1.1-uTime*vec2(.4,.7));
 float e=0.25;
 float dx=fbm((q+vec2(e,0.))*0.35+uTime*vec2(.5,.3))-n1 + (fbm((q+vec2(e,0.))*1.1-uTime*vec2(.4,.7))-n2)*.5;
 float dz=fbm((q+vec2(0.,e))*0.35+uTime*vec2(.5,.3))-n1 + (fbm((q+vec2(0.,e))*1.1-uTime*vec2(.4,.7))-n2)*.5;
 float det=(0.9+uSea*0.8)/(1.+dist*0.012);
 vec3 N=normalize(vN+vec3(-dx,0.,-dz)*det*3.2);
 float F=0.02+0.98*pow(1.-max(dot(N,V),0.),5.);
 vec3 R=reflect(-V,N); R.y=abs(R.y);
 vec3 skyc=mix(uHorizon,uZenith,pow(R.y,0.55));
 float sp=pow(max(dot(R,uSun),0.),380.)*6.+pow(max(dot(R,uSun),0.),24.)*0.25;
 vec3 scatter=vec3(0.03,0.32,0.33)*max(0.,vCrest+0.15)*(0.35+0.65*max(dot(uSun,vec3(0,1,0)),0.))*1.3;
 vec3 col=mix(uDeep+scatter,skyc,F)+uSunCol*sp;
 float foam=smoothstep(0.55-uFoam*0.45,1.0,vCrest+n2*0.55)*smoothstep(0.35,0.75,n1+n2*0.5);
 col=mix(col,vec3(0.85,0.9,0.92)*(0.35+dot(uSunCol,vec3(.2))),foam*0.9);
 float fg=1.-exp(-uFogD*uFogD*dist*dist);
 col=mix(col,uFog,fg);
 gl_FragColor=vec4(col,1.);
}`,
    }),
  );
  ocean.frustumCulled = false;
  scene.add(ocean);

  /* ---- clouds ---- */
  const cloudU = {
    uTime: { value: 0 },
    uCover: { value: 0.4 },
    uCam: { value: new THREE.Vector3() },
    uSun: { value: sunDir },
    uSunCol: { value: new THREE.Color() },
    uDark: { value: new THREE.Color() },
    uFlash: { value: 0 },
    uWind: { value: new THREE.Vector2(-0.7, 0.5) },
  };
  const clouds = new THREE.Mesh(
    new THREE.PlaneGeometry(26000, 26000),
    new THREE.ShaderMaterial({
      uniforms: cloudU,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `varying vec3 vW; void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: /* glsl */ `
uniform float uTime,uCover,uFlash; uniform vec3 uCam,uSun,uSunCol,uDark; uniform vec2 uWind; varying vec3 vW;
${NOISE_GLSL}
void main(){
 vec2 p=vW.xz/2600.+uWind*uTime*0.006;
 float d=fbm(p)+0.5*fbm(p*2.7+3.)-0.25;
 float a=smoothstep(1.02-uCover*1.05,1.25-uCover*0.75,d*1.5);
 float dn=fbm(p+uSun.xz*0.05)+0.5*fbm((p+uSun.xz*0.05)*2.7+3.)-0.25;
 float lit=clamp((d-dn)*5.+0.55,0.,1.);
 vec3 V=normalize(vW-uCam);
 float silver=pow(max(dot(V,uSun),0.),10.)*(1.-a*0.6);
 vec3 col=mix(uDark,uDark*1.5+uSunCol*0.7,lit*(1.-uCover*0.75))+uSunCol*silver*1.6+vec3(0.8,0.85,1.)*uFlash*2.5*fbm(p*5.);
 float dist=length(vW.xz-uCam.xz);
 a*=1.-smoothstep(5500.,12500.,dist);
 gl_FragColor=vec4(col,a);
}`,
    }),
  );
  clouds.rotation.x = -Math.PI / 2;
  clouds.position.y = 900;
  clouds.frustumCulled = false;
  clouds.renderOrder = -1;
  scene.add(clouds);

  /* ---- grass (camera-following instanced tile) ---- */
  const TILE = 110;
  const BLADES = 150000;
  const blade = new THREE.BufferGeometry();
  blade.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-0.045, 0, 0, 0.045, 0, 0, -0.03, 0.5, 0, 0.045, 0, 0, 0.03, 0.5, 0, -0.03, 0.5, 0, -0.03, 0.5, 0, 0.03, 0.5, 0, 0, 1, 0],
      3,
    ),
  );
  const ig = new THREE.InstancedBufferGeometry();
  ig.index = blade.index;
  ig.setAttribute('position', blade.attributes.position!);
  const offs = new Float32Array(BLADES * 4);
  for (let i = 0; i < BLADES; i++) {
    offs[i * 4] = Math.random() * TILE;
    offs[i * 4 + 1] = Math.random() * TILE;
    offs[i * 4 + 2] = Math.random();
    offs[i * 4 + 3] = Math.random();
  }
  ig.setAttribute('aOff', new THREE.InstancedBufferAttribute(offs, 4));
  ig.instanceCount = BLADES;
  const grassU = {
    uTime: { value: 0 },
    uCam: { value: new THREE.Vector3() },
    uTile: { value: TILE },
    uH: { value: hTexA },
    uOrg: { value: new THREE.Vector3(GRID_A.ox, GRID_A.oz, GRID_A.size) },
    uWind: { value: new THREE.Vector3(-0.7, 0.5, 6) },
    uSunCol: { value: new THREE.Color() },
    uAmb: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uFogD: { value: 0.0006 },
  };
  const grass = new THREE.Mesh(
    ig,
    new THREE.ShaderMaterial({
      uniforms: grassU,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
uniform float uTime,uTile; uniform vec3 uCam,uOrg,uWind; uniform sampler2D uH; attribute vec4 aOff;
varying float vT; varying float vR; varying float vD; varying float vG;
void main(){
 vec2 base=aOff.xy+uTile*floor((uCam.xz-aOff.xy)/uTile+0.5);
 vec2 uv=(base-uOrg.xy)/uOrg.z; vec4 hm=texture2D(uH,uv);
 float dist=length(base-uCam.xz);
 float fade=1.-smoothstep(uTile*0.36,uTile*0.5,dist);
 float hgt=(0.35+0.75*aOff.z)*hm.g*fade*step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
 float ang=aOff.w*6.2831; float cs=cos(ang),sn=sin(ang);
 vec3 p=vec3(position.x*cs,position.y*hgt,position.x*sn);
 float t=position.y;
 float gust=0.5+0.5*sin(dot(base,uWind.xy)*0.11-uTime*(1.2+uWind.z*0.12)+aOff.z*2.);
 gust*=0.6+0.4*sin(dot(base,vec2(-uWind.y,uWind.x))*0.05+uTime*0.7);
 float bend=(0.12+0.085*uWind.z*gust)*t*t*hgt+0.03*sin(uTime*6.+aOff.w*30.)*t*hgt;
 p.xz+=uWind.xy*bend; p.y-=bend*0.45;
 vec3 w=vec3(base.x,hm.r,base.y)+p;
 vT=t; vR=aOff.z; vD=dist; vG=gust;
 gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
}`,
      fragmentShader: /* glsl */ `
uniform vec3 uSunCol,uAmb,uFog; uniform float uFogD; varying float vT; varying float vR; varying float vD; varying float vG;
void main(){
 vec3 a=mix(vec3(0.05,0.13,0.03),vec3(0.16,0.27,0.06),vR);
 vec3 b=mix(vec3(0.42,0.55,0.16),vec3(0.62,0.6,0.22),vR);
 vec3 alb=mix(a,b,vT*vT)+vec3(0.12,0.13,0.05)*vG*vT;
 vec3 col=alb*(uAmb*0.9+uSunCol*(0.35+0.65*vT));
 float fg=1.-exp(-uFogD*uFogD*vD*vD);
 gl_FragColor=vec4(mix(col,uFog,fg),1.);
}`,
    }),
  );
  grass.frustumCulled = false;
  scene.add(grass);

  /* ---- scenery ---- */
  const rnd = (() => {
    let s = 1234567;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  })();
  const paint = (g: THREE.BufferGeometry, hex: number) => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position!.count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g.toNonIndexed();
  };
  const pine = mergeGeometries([
    paint(new THREE.CylinderGeometry(0.18, 0.3, 2.2, 6).translate(0, 1.1, 0), 0x4a3524),
    paint(new THREE.ConeGeometry(2.0, 3.4, 7).translate(0, 3.4, 0), 0x1f4a2a),
    paint(new THREE.ConeGeometry(1.5, 3.0, 7).translate(0, 5.2, 0), 0x275a31),
    paint(new THREE.ConeGeometry(0.95, 2.6, 7).translate(0.15, 6.9, 0), 0x2f6a38),
  ])!;
  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const scatter = (geo: THREE.BufferGeometry, count: number, G: IsleGrid, ok: (h: number, x: number, z: number) => boolean, sMin: number, sMax: number) => {
    const im = new THREE.InstancedMesh(geo, propMat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    let n = 0;
    for (let tries = 0; tries < count * 30 && n < count; tries++) {
      const x = G.isle.x + (rnd() * 2 - 1) * G.isle.r;
      const z = G.isle.z + (rnd() * 2 - 1) * G.isle.r;
      const h = heightAt(x, z);
      if (!ok(h, x, z)) continue;
      const s = sMin + rnd() * (sMax - sMin);
      e.set((rnd() - 0.5) * 0.12, rnd() * 6.28, (rnd() - 0.5) * 0.12 - 0.08);
      m.compose(new THREE.Vector3(x, h - 0.15, z), q.setFromEuler(e), new THREE.Vector3(s, s * (0.85 + rnd() * 0.4), s));
      im.setMatrixAt(n++, m);
    }
    im.count = n;
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
  };
  const farFromRoad = (x: number, z: number, d: number) => {
    for (const R of ROADS) for (let i = 0; i < R.length; i += 3) if (Math.hypot(R[i]!.x - x, R[i]!.z - z) < d) return false;
    return true;
  };
  scatter(pine, 1100, GRID_A, (h, x, z) => h > 6 && h < 88 && fbm(x / 70, z / 70, 3) > 0.52 && farFromRoad(x, z, 9), 0.8, 1.7);
  scatter(pine, 160, GRID_B, (h, x, z) => h > 6 && h < 60 && fbm(x / 50, z / 50, 3) > 0.58 && farFromRoad(x, z, 8), 0.6, 1.2);
  const rock = paint(new THREE.IcosahedronGeometry(1, 1), 0x77726c);
  {
    const p = rock.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const k = 0.7 + 0.6 * hash3(p.getX(i), p.getY(i), p.getZ(i));
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k);
    }
    rock.computeVertexNormals();
  }
  scatter(rock, 500, GRID_A, (h, x, z) => h > 0.5 && farFromRoad(x, z, 7), 0.5, 2.6);
  scatter(rock, 300, GRID_B, (h, x, z) => h > 0.5 && farFromRoad(x, z, 6), 0.6, 3.2);

  // lamps along roads, houses, turbines, foundry, engine tower
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffb45a, emissiveIntensity: 6 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.55, metalness: 0.8 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x7a3b2c, roughness: 0.8 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 0.85 });
  const postG = new THREE.CylinderGeometry(0.06, 0.09, 3.6, 6).translate(0, 1.8, 0);
  const bulbG = new THREE.SphereGeometry(0.22, 10, 8).translate(0, 3.7, 0);
  const lampPts: THREE.Vector3[] = [];
  ROADS.forEach((R) => {
    for (let i = 10; i < R.length; i += 22) {
      const p = R[i]!;
      const side = (i / 22) % 2 ? 1 : -1;
      const x = p.x + Math.cos(p.heading) * 4.6 * side;
      const z = p.z + Math.sin(p.heading) * 4.6 * side;
      lampPts.push(new THREE.Vector3(x, heightAt(x, z), z));
    }
  });
  const posts = new THREE.InstancedMesh(postG, ironMat, lampPts.length);
  const bulbs = new THREE.InstancedMesh(bulbG, glowMat, lampPts.length);
  lampPts.forEach((p, i) => {
    const m = new THREE.Matrix4().setPosition(p);
    posts.setMatrixAt(i, m);
    bulbs.setMatrixAt(i, m);
  });
  posts.castShadow = true;
  scene.add(posts, bulbs);

  const house = (x: number, z: number, rot: number, w: number, d: number, hh: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), wallMat);
    body.position.y = hh / 2;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.78, 2.2, 4, 1).rotateY(Math.PI / 4), roofMat);
    roof.scale.z = d / w;
    roof.position.y = hh + 1.1;
    const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 0.9, d + 0.06), glowMat);
    win.position.y = hh * 0.55;
    const door = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 1.9, 0.9), woodMat);
    door.position.y = 0.95;
    g.add(body, roof, win, door);
    g.traverse((o) => ((o.castShadow = true), (o.receiveShadow = true)));
    g.position.set(x, heightAt(x, z) - 0.3, z);
    g.rotation.y = rot;
    scene.add(g);
  };
  const RA = ROADS[0]!;
  for (let i = 0; i < 16; i++) {
    const p = RA[Math.floor(RA.length * (0.78 + 0.011 * i))]!;
    const side = i % 2 ? 1 : -1;
    const off = 11 + (i % 3) * 5;
    house(p.x + Math.cos(p.heading) * off * side, p.z + Math.sin(p.heading) * off * side, -p.heading + (side > 0 ? 0 : Math.PI), 6 + (i % 3), 5 + (i % 2) * 2, 3.4 + (i % 3) * 0.8);
  }
  { // foundry at the summit
    const s = RA[0]!;
    house(s.x - 16, s.z - 6, 0.6, 14, 10, 7);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 16, 10), new THREE.MeshStandardMaterial({ color: 0x6a4034, roughness: 0.9 }));
    stack.position.set(s.x - 20, heightAt(s.x - 20, s.z - 10) + 8, s.z - 10);
    stack.castShadow = true;
    scene.add(stack);
  }
  const rotors: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const p = RA[Math.floor(RA.length * (0.3 + i * 0.035))]!;
    const x = p.x + Math.cos(p.heading) * 26;
    const z = p.z + Math.sin(p.heading) * 26;
    const g = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.95, 34, 10), wallMat);
    mast.position.y = 17;
    const hub = new THREE.Group();
    hub.position.set(0, 34, 1.2);
    for (let b = 0; b < 3; b++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 15, 0.18).translate(0, 7.5, 0), wallMat);
      bl.rotation.z = (b * Math.PI * 2) / 3;
      hub.add(bl);
    }
    g.add(mast, hub);
    g.traverse((o) => (o.castShadow = true));
    g.position.set(x, heightAt(x, z) - 0.5, z);
    g.rotation.y = 0.95;
    rotors.push(hub);
    scene.add(g);
  }
  { // engine tower on the far island
    const R = ROADS[1]!;
    const e = R[R.length - 1]!;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(4, 6.5, 30, 14), new THREE.MeshStandardMaterial({ color: 0x8b8478, roughness: 0.85 }));
    t.position.set(e.x + 12, heightAt(e.x + 12, e.z) + 14, e.z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x8fd8ff, emissiveIntensity: 9 }));
    lamp.position.set(e.x + 12, t.position.y + 17, e.z);
    t.castShadow = true;
    scene.add(t, lamp);
  }
  { // pier planks
    const a = RA[RA.length - 16]!;
    const b = RA[RA.length - 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, len), woodMat);
    deck.position.set((a.x + b.x) / 2, 1.85, (a.z + b.z) / 2);
    deck.rotation.y = -Math.atan2(b.x - a.x, -(b.z - a.z));
    deck.castShadow = deck.receiveShadow = true;
    scene.add(deck);
  }

  /* ---- rain ---- */
  const RAIN = 9000;
  const rp = new Float32Array(RAIN * 6);
  for (let i = 0; i < RAIN; i++) {
    const x = Math.random() * 70;
    const y = Math.random() * 50;
    const z = Math.random() * 70;
    rp.set([x, y, z, x, y, z], i * 6);
  }
  const re = new Float32Array(RAIN * 2);
  for (let i = 0; i < RAIN; i++) re[i * 2 + 1] = 1;
  const rainG = new THREE.BufferGeometry();
  rainG.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rainG.setAttribute('aEnd', new THREE.BufferAttribute(re, 1));
  const rainU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uRain: { value: 0 }, uWind: { value: new THREE.Vector3() } };
  const rain = new THREE.LineSegments(
    rainG,
    new THREE.ShaderMaterial({
      uniforms: rainU,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
uniform float uTime; uniform vec3 uCam,uWind; attribute float aEnd; varying float vA;
void main(){
 vec3 v=vec3(uWind.x,-19.,uWind.z);
 vec3 p=position+v*uTime; p=mod(p-uCam+vec3(35.,25.,35.),vec3(70.,50.,70.))-vec3(35.,25.,35.)+uCam;
 p+=normalize(v)*aEnd*0.9; vA=aEnd;
 gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);
}`,
      fragmentShader: `uniform float uRain; varying float vA; void main(){gl_FragColor=vec4(0.75,0.82,0.9,(0.12+0.3*vA)*uRain);}`,
    }),
  );
  rain.frustumCulled = false;
  scene.add(rain);

  /* ---- particle bursts ---- */
  const PN = 3000;
  const pPos = new Float32Array(PN * 3);
  const pVel = new Float32Array(PN * 3);
  const pLife = new Float32Array(PN);
  const pCol = new Float32Array(PN * 3);
  const pG = new THREE.BufferGeometry();
  pG.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pG.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pts = new THREE.Points(pG, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
  pts.frustumCulled = false;
  scene.add(pts);
  let pNext = 0;
  const KCOL = { spray: [0.9, 0.95, 1], dust: [0.55, 0.47, 0.36], sparks: [6, 3, 0.8] };

  /* ---- post ---- */
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.75, 0.9);
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uStorm: { value: 0 }, uSpeed: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse; uniform float uStorm,uSpeed,uFlash; varying vec2 vUv;
void main(){
 vec2 c=vUv-0.5; float r=length(c);
 vec3 col=vec3(0.); float w=0.;
 for(int i=0;i<6;i++){float t=float(i)/5.; vec2 u=0.5+c*(1.-uSpeed*0.045*t*r*2.); col+=texture2D(tDiffuse,u).rgb; w+=1.;}
 col/=w;
 float l=dot(col,vec3(0.2126,0.7152,0.0722));
 col=mix(col,vec3(l)*vec3(0.86,0.95,1.08),uStorm*0.45);
 col=mix(col,col*col*(3.-2.*col),0.0);
 col*=mix(vec3(1.04,1.0,0.94),vec3(0.9,0.97,1.06),uStorm);
 col*=1.-smoothstep(0.35,0.95,r)*(0.45+0.25*uStorm);
 col+=uFlash*vec3(0.5,0.55,0.7);
 gl_FragColor=vec4(col,1.);
}`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  /* ---- state ---- */
  const tmpC = new THREE.Color();
  const lerpHex = (a: number, b: number, t: number, out: THREE.Color) => out.setHex(a).lerp(tmpC.setHex(b), t);
  const windBase = new THREE.Vector2(-0.77, 0.64); // from the north-east
  let flash = 0;
  let flashT = 4;

  const world: WorldHandle = {
    renderer,
    scene,
    camera,
    storm: 0.1,
    wet: 0,
    time: 0,
    speedFx: 0,
    heightAt,
    roadNearest,
    roadPoint: (p) => roadPoint(p, 0),
    oceanHeight(x, z) {
      let y = 0;
      for (const w of WAVES) {
        const k = 6.2831853 / w.l;
        const len = Math.hypot(w.d[0]!, w.d[1]!);
        y += w.a * oceanU.uSea.value * Math.sin((k * (w.d[0]! * x + w.d[1]! * z)) / len - Math.sqrt(9.81 * k) * world.time);
      }
      return y;
    },
    windAt(x, z, out) {
      const sp = 5 + 12 * world.storm;
      const g = 0.75 + 0.5 * fbm((x - windBase.x * world.time * sp) / 120, (z - windBase.y * world.time * sp) / 120, 2) + 0.35 * world.storm * Math.sin(world.time * 0.6 + x * 0.01);
      const veer = x > 950 ? -0.45 * THREE.MathUtils.smoothstep(x, 950, 1150) : 0;
      const cx = Math.cos(veer);
      const sx = Math.sin(veer);
      out.set((windBase.x * cx - windBase.y * sx) * sp * g, 0, (windBase.x * sx + windBase.y * cx) * sp * g);
      return out;
    },
    burst(kind, pos, vel, count) {
      const c = KCOL[kind];
      for (let i = 0; i < count; i++) {
        const k = pNext++ % PN;
        pPos.set([pos.x, pos.y, pos.z], k * 3);
        const s = kind === 'sparks' ? 5 : 2.2;
        pVel.set([vel.x + (Math.random() - 0.5) * s, vel.y + Math.random() * s, vel.z + (Math.random() - 0.5) * s], k * 3);
        pLife[k] = 0.6 + Math.random() * 0.9;
        pCol.set(c, k * 3);
      }
    },
    places: {
      bikeStart: { x: RA[4]!.x, z: RA[4]!.z, heading: RA[4]!.heading },
      harbour: { x: RA[RA.length - 4]!.x, z: RA[RA.length - 4]!.z },
      boatStart: { x: 478, z: 62, heading: 1.2 },
      cove: { x: 1205, z: -208 },
    },
    update(dt) {
      world.time += dt;
      const s = world.storm;
      world.wet += ((s > 0.5 ? 1 : 0) - world.wet) * Math.min(1, dt * 0.05);
      // sun: golden and low, sinking as the storm builds; clean dawn when calm
      const el = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(26, -3, THREE.MathUtils.smoothstep(s, 0.05, 0.95)));
      const az = THREE.MathUtils.degToRad(250);
      sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
      skyU['sunPosition']!.value.copy(sunDir);
      skyU['turbidity']!.value = 4 + 14 * s;
      skyU['rayleigh']!.value = 2.2 - 1.6 * s;
      skyU['mieCoefficient']!.value = 0.006 + 0.02 * s;
      skyU['mieDirectionalG']!.value = 0.86;
      const day = THREE.MathUtils.smoothstep(sunDir.y, -0.06, 0.2);
      // lightning
      flashT -= dt;
      if (s > 0.7 && flashT < 0) {
        flash = 1;
        flashT = 2 + Math.random() * 7 * (1.4 - s);
      }
      flash = Math.max(0, flash - dt * (flash > 0.6 ? 9 : 2.5));
      const fl = flash * (0.6 + 0.4 * Math.sin(world.time * 60));
      const sunCol = lerpHex(0xffc98a, 0xff9a5a, 1 - day, new THREE.Color());
      sun.color.copy(sunCol);
      sun.intensity = 3.4 * day * (1 - 0.82 * s) + 0.05;
      hemi.intensity = 0.6 + 0.9 * day * (1 - 0.55 * s) + fl * 3;
      lerpHex(0xbfd8ff, 0x55606c, s, hemi.color);
      const fogC = lerpHex(0xa9bccb, 0x2a323b, Math.max(s, 1 - day), new THREE.Color()).multiplyScalar(0.35 + 0.65 * day + fl);
      (scene.fog as THREE.FogExp2).color.copy(fogC);
      const fd = 0.00045 + 0.0011 * s;
      (scene.fog as THREE.FogExp2).density = fd;
      const cp = camera.position;
      sun.position.copy(cp).addScaledVector(sunDir, 300);
      sun.target.position.copy(cp);
      const lit = sunCol.clone().multiplyScalar(sun.intensity * 0.33);
      // ocean
      oceanU.uTime.value = world.time;
      oceanU.uSea.value = 0.45 + 2.0 * s;
      oceanU.uCam.value.copy(cp);
      oceanU.uSunCol.value.copy(lit).multiplyScalar(3);
      lerpHex(0xc8d8e2, 0x39424c, s, oceanU.uHorizon.value).multiplyScalar(0.3 + 0.7 * day + fl);
      lerpHex(0x3f74b8, 0x1b2026, s, oceanU.uZenith.value).multiplyScalar(0.3 + 0.7 * day + fl);
      lerpHex(0x06283a, 0x04090d, s, oceanU.uDeep.value).multiplyScalar(0.4 + 0.6 * day);
      oceanU.uFog.value.copy(fogC);
      oceanU.uFogD.value = fd;
      oceanU.uFoam.value = 0.15 + 0.85 * s;
      // clouds
      cloudU.uTime.value = world.time * (1 + 3 * s);
      cloudU.uCover.value = 0.32 + 0.68 * THREE.MathUtils.smoothstep(s, 0.1, 0.8);
      cloudU.uCam.value.copy(cp);
      cloudU.uSunCol.value.copy(lit).multiplyScalar(1.6);
      lerpHex(0x9aa7b5, 0x15191e, s, cloudU.uDark.value).multiplyScalar(0.3 + 0.7 * day);
      cloudU.uFlash.value = fl;
      clouds.position.x = cp.x;
      clouds.position.z = cp.z;
      // grass follows the nearer island
      const onB = cp.x > 900;
      grassU.uH.value = onB ? hTexB : hTexA;
      const G = onB ? GRID_B : GRID_A;
      grassU.uOrg.value.set(G.ox, G.oz, G.size);
      grassU.uTime.value = world.time;
      grassU.uCam.value.copy(cp);
      const w = world.windAt(cp.x, cp.z, new THREE.Vector3());
      const ws = w.length();
      grassU.uWind.value.set(w.x / ws, w.z / ws, ws);
      grassU.uSunCol.value.copy(lit);
      grassU.uAmb.value.copy(hemi.color).multiplyScalar(hemi.intensity * 0.45);
      grassU.uFog.value.copy(fogC);
      grassU.uFogD.value = fd;
      // rain
      rainU.uTime.value = world.time;
      rainU.uCam.value.copy(cp);
      rainU.uRain.value = THREE.MathUtils.smoothstep(s, 0.42, 0.8);
      rainU.uWind.value.copy(w);
      rotors.forEach((r, i) => (r.rotation.z += dt * (0.3 + ws * 0.12) * (1 + i * 0.03)));
      glowMat.emissiveIntensity = 0.3 + 8 * Math.max(s, 1 - day);
      terrainMat.roughness = 0.95 - 0.45 * world.wet;
      // particles
      for (let k = 0; k < PN; k++) {
        if (pLife[k]! <= 0) continue;
        pLife[k]! -= dt;
        pVel[k * 3 + 1]! -= 9.8 * dt;
        pPos[k * 3]! += pVel[k * 3]! * dt;
        pPos[k * 3 + 1]! += pVel[k * 3 + 1]! * dt;
        pPos[k * 3 + 2]! += pVel[k * 3 + 2]! * dt;
        if (pLife[k]! <= 0) pPos[k * 3 + 1] = -999;
      }
      pG.attributes.position!.needsUpdate = true;
      pG.attributes.color!.needsUpdate = true;
      renderer.toneMappingExposure = 0.62 + 0.5 * (1 - day) * (1 - s * 0.3);
      grade.uniforms['uStorm']!.value = s;
      grade.uniforms['uSpeed']!.value = world.speedFx;
      grade.uniforms['uFlash']!.value = fl * 0.25;
      bloom.strength = 0.42 + 0.35 * (1 - day);
    },
    render() {
      composer.render();
    },
    resize() {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
  };
  for (let k = 0; k < PN; k++) pPos[k * 3 + 1] = -999;
  world.resize();
  window.addEventListener('resize', world.resize);
  return world;
}

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

export { ISLE_A, ISLE_B };
