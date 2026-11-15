import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {heightFn,regionOf} from './vendor/tria-prima/world/heightmap.js';
import {ORBS,STEEPLE,HARBOUR,MORNE,BEACONS,clamp} from './game.js';

const UP=new THREE.Vector3(0,1,0);
function random(seed=17){return ()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
const rnd=random();
export function homeHeight(x,z){
 const r=Math.sqrt((x/131)**2+(z/139)**2);
 const inland=5+Math.sin(x*.045)*1.3+Math.sin(z*.055)*1.6+Math.sin(x*.08+z*.06)*.65;
 return Math.min(inland, (1-r)*40)-.5;
}
export function landHeight(x,z){
 let h=homeHeight(x,z);
 if(Math.abs(x-MORNE.x)<235&&Math.abs(z-MORNE.z)<235)h=Math.max(h,heightFn((x-MORNE.x)/MORNE.scale,(z-MORNE.z)/MORNE.scale)*MORNE.scale);
 for(const b of BEACONS){if(!b.island)continue;const d=Math.hypot(x-b.island.x,z-b.island.z);h=Math.max(h,(1-d/b.island.r)*11+.5*Math.sin(x));}
 return h;
}
function brushTexture(){
 const c=document.createElement('canvas');c.width=2048;c.height=1024;const ctx=c.getContext('2d');const r=random(731);
 const g=ctx.createLinearGradient(0,0,0,1024);g.addColorStop(0,'#06152c');g.addColorStop(.38,'#133b65');g.addColorStop(.7,'#397686');g.addColorStop(1,'#092738');ctx.fillStyle=g;ctx.fillRect(0,0,2048,1024);
 const curls=[{x:440,y:370,s:200},{x:1230,y:385,s:240},{x:1800,y:330,s:150},{x:890,y:160,s:80}];
 for(let k=0;k<12500;k++){
  const x=r()*2048,y=r()*780;let ang=.22*Math.sin(x*.006)+.12*Math.sin(y*.02);let close=0;
  for(const v of curls){const dx=x-v.x,dy=y-v.y,d=Math.hypot(dx,dy);if(d<v.s*1.8){const power=1-d/(v.s*1.8);ang+=(Math.atan2(dy,dx)+Math.PI/2-ang)*power;close=Math.max(close,power);}}
  const len=5+r()*20,bright=r();ctx.strokeStyle=bright>.94?'rgba(227,206,128,.22)':bright>.65?'rgba(121,182,190,.26)':'rgba(52,112,154,.35)';ctx.lineWidth=1+r()*3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(ang)*len,y+Math.sin(ang)*len);ctx.stroke();
 }
 for(const v of curls){for(let j=0;j<9;j++){ctx.beginPath();for(let i=0;i<360;i++){const a=i/50+j*.13,rr=8+i*.5;const x=v.x+Math.cos(a)*rr,y=v.y+Math.sin(a)*rr*.55;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.strokeStyle=j%3===0?'#b9c9a536':'#70a8b22a';ctx.lineWidth=2;ctx.stroke();}}
 for(let i=0;i<110;i++){const x=r()*2048,y=50+r()*520,rad=2+r()*6;const glow=ctx.createRadialGradient(x,y,0,x,y,rad*5);glow.addColorStop(0,'#fbe4a7');glow.addColorStop(.15,'#dacc92bb');glow.addColorStop(1,'#dac78900');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,rad*5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d8d4a45c';ctx.lineWidth=1;for(let k=0;k<3;k++){ctx.beginPath();ctx.ellipse(x,y,rad*(2.2+k),rad*(1.7+k),.3,0,Math.PI*1.7);ctx.stroke();}}
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,2,64,64,64);g.addColorStop(0,'#fff5d7');g.addColorStop(.12,'#ffe1a0ee');g.addColorStop(.35,'#ebba633c');g.addColorStop(1,'#ebba6300');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);}

export class World {
 constructor(canvas){
  this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));this.renderer.setSize(innerWidth,innerHeight);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3;
  this.scene=new THREE.Scene();this.scene.fog=new THREE.FogExp2('#234958',.00165);this.camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.15,2400);this.camera.position.set(100,58,147);this.camera.lookAt(0,12,0);
  this.scene.add(new THREE.HemisphereLight('#b6ddeb','#183c38',2.25));const moonLight=new THREE.DirectionalLight('#d7e3dd',2.4);moonLight.position.set(-130,250,90);this.scene.add(moonLight);const warm=new THREE.DirectionalLight('#f3ba65',.6);warm.position.set(200,50,100);this.scene.add(warm);
  this.staticBuckets=new Map();this.mats={};this.glow=glowTexture();this.orbMeshes=[];this.beaconGroups=[];this.sails=[];this.colliders=[];
  this.makeSky();this.makeWater();this.makeTerrain();this.makeVillage();this.makeMorne();this.makeBeacons();this.flush();this.makeOrbs();this.bike=this.makeBike();this.scene.add(this.bike);this.boat=this.makeBoat();this.scene.add(this.boat);this.boat.position.set(143,.4,48);this.boat.rotation.y=-Math.PI/2;this.bike.position.set(0,homeHeight(0,77),77);this.bike.visible=true;
  this.camTarget=new THREE.Vector3();this.camLook=new THREE.Vector3();this.lookCurrent=new THREE.Vector3(0,12,0);this.v=new THREE.Vector3();
  window.addEventListener('resize',()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);});
 }
 mat(color,emissive=false){const k=color+emissive;if(!this.mats[k])this.mats[k]=new THREE.MeshStandardMaterial({color,roughness:.91,metalness:0,emissive:emissive?color:0,emissiveIntensity:emissive?1.6:0});return this.mats[k];}
 add(geo,color,pos,rot=null,group=null,emissive=false){const mat=this.mat(color,emissive);const m=new THREE.Mesh(geo,mat);if(pos)m.position.set(...pos);if(rot)m.rotation.set(...rot);if(group){group.add(m);return m;}m.updateMatrix();let g=geo.clone().applyMatrix4(m.matrix);if(!g.attributes.normal)g.computeVertexNormals();if(g.index)g=g.toNonIndexed();if(!this.staticBuckets.has(mat))this.staticBuckets.set(mat,[]);this.staticBuckets.get(mat).push(g);return m;}
 box(x,y,z,w,h,d,color,group=null,rot=null,emissive=false){return this.add(new THREE.BoxGeometry(w,h,d),color,[x,y,z],rot,group,emissive);}
 cyl(x,y,z,rt,rb,h,color,group=null,rot=null,n=9){return this.add(new THREE.CylinderGeometry(rt,rb,h,n),color,[x,y,z],rot,group);}
 tube(a,b,r,color,group=null){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),dir=vb.clone().sub(va);const g=new THREE.CylinderGeometry(r,r,dir.length(),7);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP,dir.normalize()));g.translate(...va.add(vb).multiplyScalar(.5).toArray());return this.add(g,color,null,null,group);}
 flush(){for(const [mat,geos] of this.staticBuckets){const geom=mergeGeometries(geos,false);if(geom)this.scene.add(new THREE.Mesh(geom,mat));geos.forEach(g=>g.dispose());}this.staticBuckets.clear();}
 makeSky(){
  const sky=new THREE.Mesh(new THREE.SphereGeometry(1400,48,24),new THREE.MeshBasicMaterial({map:brushTexture(),side:THREE.BackSide,fog:false}));this.scene.add(sky);this.sky=sky;
  const moon=new THREE.Group();const core=new THREE.Mesh(new THREE.SphereGeometry(25,32,24),new THREE.MeshBasicMaterial({color:'#ffdf95',fog:false}));moon.add(core);const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color:'#ffd58a',transparent:true,opacity:.8,depthWrite:false,fog:false}));halo.scale.set(210,210,1);moon.add(halo);moon.position.set(-310,440,-600);this.scene.add(moon);
  for(let i=0;i<4;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(35+i*7,.35,5,80),new THREE.MeshBasicMaterial({color:'#e9cf7a',transparent:true,opacity:.17,fog:false}));ring.position.copy(moon.position);ring.lookAt(0,0,0);this.scene.add(ring);}
  const p=[];for(let i=0;i<800;i++){const a=rnd()*Math.PI*2,b=.1+rnd()*1.35,r=1100;p.push(Math.cos(a)*Math.cos(b)*r,Math.sin(b)*r,Math.sin(a)*Math.cos(b)*r);}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));this.scene.add(new THREE.Points(geo,new THREE.PointsMaterial({color:'#e9deb0',size:1.8,sizeAttenuation:true,transparent:true,opacity:.85,fog:false})));
 }
 makeWater(){
  this.waterMat=new THREE.ShaderMaterial({uniforms:{uTime:{value:0},uLight:{value:new THREE.Vector3(-.4,.7,-.6)}},vertexShader:`uniform float uTime; varying vec3 vWorld; varying float vWave; void main(){vec3 p=position;float a=sin(p.x*.048+uTime*.65+p.y*.023)*.5;float b=sin(p.y*.082-uTime*.9+p.x*.015)*.22;p.z+=a+b;vWave=a+b;vec4 wp=modelMatrix*vec4(p,1.);vWorld=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,fragmentShader:`precision highp float;uniform float uTime;varying vec3 vWorld;varying float vWave;void main(){float bands=sin(vWorld.x*.26+sin(vWorld.z*.15+uTime*.25)*2.+uTime*.4);float fine=sin(vWorld.z*1.5+sin(vWorld.x*.43)*2.+uTime*.6);vec3 base=mix(vec3(.018,.10,.15),vec3(.08,.25,.29),vWave*.6+.4);float stroke=smoothstep(.87,1.,bands)*smoothstep(-.2,.6,fine);base+=vec3(.17,.27,.25)*stroke*.34;float path=exp(-pow((vWorld.x+170.+vWorld.z*.26)/80.,2.));float gold=path*smoothstep(.3,.9,bands)*.22;base+=vec3(.8,.65,.3)*gold;float dist=length(cameraPosition-vWorld);base=mix(base,vec3(.13,.27,.32),1.-exp(-dist*.0016));gl_FragColor=vec4(base,1.);}`});
  const geo=new THREE.PlaneGeometry(3500,3500,200,200);this.water=new THREE.Mesh(geo,this.waterMat);this.water.rotation.x=-Math.PI/2;this.water.position.y=-.12;this.scene.add(this.water);
 }
 terrain(size,res,cx,cz,height,colorFn){
  const geo=new THREE.PlaneGeometry(size,size,res,res);geo.rotateX(-Math.PI/2);const p=geo.attributes.position,cols=[];for(let i=0;i<p.count;i++){const x=p.getX(i)+cx,z=p.getZ(i)+cz,y=height(x,z);p.setY(i,y);const c=new THREE.Color(colorFn(x,z,y));const n=.88+rnd()*.22;c.multiplyScalar(n);cols.push(c.r,c.g,c.b);}geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:false}));mesh.position.set(cx,0,cz);this.scene.add(mesh);return mesh;
 }
 makeTerrain(){
  this.terrain(310,110,0,0,homeHeight,(x,z,h)=>h<1?'#657367':h<2?'#758577':(Math.sin(x*.04+z*.02)>.25?'#254f49':'#315d54'));
  this.terrain(768*MORNE.scale,144,MORNE.x,MORNE.z,(x,z)=>heightFn((x-MORNE.x)/MORNE.scale,(z-MORNE.z)/MORNE.scale)*MORNE.scale,(x,z,h)=>{const r=regionOf((x-MORNE.x)/MORNE.scale,(z-MORNE.z)/MORNE.scale,h/MORNE.scale);return h<1?'#85978a':({scar:'#494c4a',heights:'#748082',saltwood:'#354f51',mere:'#4d6a5e',shore:'#728375',vale:'#45675b'}[r]||'#385d51');});
  for(const b of BEACONS){if(!b.island)continue;const {x,z,r}=b.island;this.terrain(r*2.7,34,x,z,(xx,zz)=>(1-Math.hypot(xx-x,zz-z)/r)*11+.5*Math.sin(xx),(x,z,h)=>h<1?'#87968a':'#4b7069');}
  // A ribbon of warm stones makes the route readable beneath the bicycle.
  this.road([[0,85],[5,60],[3,40],[4,20],[0,-8],[0,-25]],4.3);
  this.road([[0,-25],[29,-13],[53,7],[76,30],[103,48],[124,48]],4.1);
  // Distant hills frame the village and echo the painted horizon.
  for(let i=0;i<14;i++){const x=-300+i*52,z=-285-rnd()*55;this.cyl(x,-12,z,0,70+rnd()*40,80+rnd()*80,'#183b4b',null,null,7);}
 }
 road(points,width){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],0,p[1])));const pos=[],cols=[];const idx=[];for(let i=0;i<=130;i++){const p=curve.getPoint(i/130),t=curve.getTangent(i/130);for(const side of [-1,1]){const x=p.x+t.z*width*side,z=p.z-t.x*width*side;pos.push(x,Math.max(.15,homeHeight(x,z)+.12),z);const c=new THREE.Color(i%7===0?'#a9986d':'#83917a');cols.push(c.r,c.g,c.b);}if(i<130){const a=i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));g.setIndex(idx);g.computeVertexNormals();this.scene.add(new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide})));}
 tree(x,z,h=12,cypress=true,ground=homeHeight(x,z)){
  if(ground<1)return;this.cyl(x,ground+h*.27,z,.23,.45,h*.55,'#3a5146');
  if(cypress){for(let j=0;j<3;j++){this.cyl(x+Math.sin(j*4)*.3,ground+h*(.47+j*.15),z,.03,h*(.14-j*.026),h*.67,j%2?'#163f3d':'#1d4942',null,null,7);}}
  else {for(let j=0;j<3;j++)this.add(new THREE.IcosahedronGeometry(h*.25,1),j%2?'#426d58':'#355e4c',[x+(rnd()-.5)*h*.35,ground+h*(.6+j*.1),z+(rnd()-.5)*h*.35]);}
 }
 house(x,z,w=9,h=7,d=8,color='#70877d'){
  const y=homeHeight(x,z);if(y<2)return;this.box(x,y+h/2,z,w,h,d,color);this.cyl(x,y+h+2,z,w*.75,w*.75,4,'#30475a',null,[0,Math.PI/4,0],4);
  // Roof is an extruded gable rather than a flat cap.
  const shape=new THREE.Shape();shape.moveTo(-w*.58,0);shape.lineTo(0,3.5);shape.lineTo(w*.58,0);shape.closePath();const roof=new THREE.ExtrudeGeometry(shape,{depth:d+1,bevelEnabled:false});this.add(roof,'#263f52',[x,y+h,z-d/2-.5]);
  for(let i=-1;i<=1;i+=2){this.box(x+i*w*.25,y+h*.56,z+d/2+.03,w*.16,h*.25,.07,'#e3b665',null,null,true);this.box(x+i*w*.25,y+h*.56,z+d/2+.09,.12,h*.29,.06,'#3b5756');this.box(x+i*w*.25,y+h*.56,z+d/2+.09,w*.19,.13,.06,'#3b5756');}
  this.box(x,y+1.3,z+d/2+.06,w*.16,2.6,.08,'#193a41');this.box(x+w*.3,y+h+3,z-d*.15,1,3,1.2,'#627b76');this.colliders.push({x,z,r:Math.max(w,d)*.48});
 }
 lantern(x,z,ground=homeHeight(x,z),height=4.8){this.cyl(x,ground+height/2,z,.075,.1,height,'#5c6854');this.box(x,ground+height,z,.6,.9,.6,'#f0c67b',null,null,true);this.cyl(x,ground+height+.65,z,0,.55,.5,'#354c49');}
 makeVillage(){
  const placements=[[-19,60,10,6,8],[-25,38,12,8,10],[21,47,9,7,9],[28,22,12,8,10],[-18,12,10,6,9],[-30,-10,12,8,9],[26,-20,10,7,9],[40,-40,12,9,10],[-44,-37,11,7,10],[52,20,10,6,9],[70,1,11,8,10],[86,22,9,7,10],[-55,23,12,8,10],[-72,52,11,7,9],[-57,72,10,8,9],[-80,-18,9,6,8],[-55,-66,11,8,10],[23,-67,10,7,9]];
  for(let i=0;i<placements.length;i++)this.house(...placements[i],['#688983','#789586','#b2a17b','#5a7b79'][i%4]);
  const {x,z}=STEEPLE,y=homeHeight(x,z);this.box(x,y+5,z-7,15,10,23,'#99a68c');const roofshape=new THREE.Shape();roofshape.moveTo(-9,0);roofshape.lineTo(0,8);roofshape.lineTo(9,0);roofshape.closePath();this.add(new THREE.ExtrudeGeometry(roofshape,{depth:25,bevelEnabled:false}),'#244454',[x,y+10,z-20]);this.box(x,y+13,z+4,5.5,26,6,'#afae8c');this.cyl(x,y+31,z+4,0,4.5,14,'#213d4d',null,[0,Math.PI/4,0],4);this.box(x,y+9,z+7.05,2.5,6,.08,'#e8be68',null,null,true);this.box(x,y+22,z+7.05,2,3,.08,'#e6bd68',null,null,true);this.tube([x,y+38,z+4],[x,y+41,z+4],.09,'#d6c887');this.tube([x-1,y+40,z+4],[x+1,y+40,z+4],.09,'#d6c887');this.colliders.push({x,z:z-9,r:10});
  for(let i=0;i<70;i++){const x=(rnd()-.5)*240,z=(rnd()-.5)*250;if(Math.abs(x)<14&&z>-40)continue;if(this.colliders.some(c=>Math.hypot(x-c.x,z-c.z)<c.r+8))continue;this.tree(x,z,9+rnd()*15,rnd()>.28);}
  this.tree(-12,78,31,true);this.tree(-18,80,24,true);this.tree(-20,66,19,true);this.tree(64,-68,34,true);
  for(const [x,z] of [[-8,64],[11,35],[-9,8],[12,-18],[38,-7],[69,20],[105,46]])this.lantern(x,z);
  // Harbour and its pale planks reach beyond the high water mark.
  this.box(128,1.3,48,25,.65,7,'#8e8b6c');for(let i=0;i<14;i++)this.box(117+i*1.7,1.67,48,.1,.05,7,'#5e6d60');for(let x=118;x<=140;x+=7)for(const z of [45,51])this.cyl(x,.2,z,.22,.28,5,'#657363');this.lantern(137,44.2,1.7,4);this.box(109,homeHeight(109,48)+3,44,4,1,.2,'#c8bb8a');
  // Individual short brush marks on the ground give the landscape its painted texture.
  for(let i=0;i<900;i++){const x=(rnd()-.5)*255,z=(rnd()-.5)*260,y=homeHeight(x,z);if(y<1||Math.abs(x)<9&&z>-30)continue;this.box(x,y+.08,z,.12+rnd()*.2,.08,.6+rnd()*1.3,i%3===0?'#7c9771':'#436f5c',null,[0,rnd()*1.2,0]);}
 }
 makeMorne(){
  const wx=x=>MORNE.x+x*MORNE.scale,wz=z=>MORNE.z+z*MORNE.scale;
  for(let i=0;i<190;i++){const x=(rnd()-.5)*620,z=(rnd()-.5)*640,h=heightFn(x,z)*MORNE.scale;if(h<2||h>50||Math.hypot(x+10,z-70)<30)continue;this.tree(wx(x),wz(z),5+rnd()*13,rnd()>.25,h);}
  const x=wx(-10),z=wz(70),y=heightFn(-10,70)*MORNE.scale;
  this.box(x,y+.2,z,15,.6,24,'#8d9687');for(const side of [-1,1]){this.box(x+side*7,y+4,z,1.5,8,23,'#6d8078');for(let j=0;j<4;j++){this.box(x+side*7,y+8+(j%2),z-9+j*6,2,2,2,'#8a9584');this.cyl(x+side*6.9,y+11,z-9+j*6,0,1.1,5,'#5b7774',null,null,4);}}
  this.box(x,y+6,z-11,14,12,1.6,'#7e8f80');const rose=new THREE.Mesh(new THREE.TorusGeometry(2,.4,7,24),this.mat('#ccbb84'));rose.position.set(x,y+8,z-10);rose.updateMatrix();this.add(rose.geometry.clone().applyMatrix4(rose.matrix),'#ccbb84');this.box(x,y+7,z-10.08,2,3,.1,'#d7b972',null,null,true);
  // The Athanor's final ember is the landmark reached on foot.
  this.cyl(x,y+2,z-5,1.5,2,4,'#5a6c67');this.add(new THREE.SphereGeometry(.85,12,8),'#eec06e',[x,y+3,z-3.7],null,null,true);
  this.morneChapel={x,z,y};this.morneDock={x:540,z:-10};this.box(540,1.2,-16,8,.6,23,'#8c9276');for(let i=0;i<12;i++)this.box(540,1.53,-26+i*1.8,8,.05,.13,'#5a7369');
  // A warm line of lanterns traces a traversable path from the dock to the chapel.
  for(let i=0;i<13;i++){const zz=310-i*18;this.lantern(wx(i%2?5:-5),wz(zz),heightFn(i%2?5:-5,zz)*MORNE.scale,3.8);}
  // Original volcanic Scar and eastern Mere remain part of the sampled terrain.
  const lava=new THREE.Mesh(new THREE.CircleGeometry(17,40),new THREE.MeshBasicMaterial({color:'#bb642f',transparent:true,opacity:.8}));lava.rotation.x=-Math.PI/2;lava.position.set(wx(70),20.2*MORNE.scale,wz(-255));this.scene.add(lava);
 }
 makeBeacons(){
  for(let i=0;i<BEACONS.length;i++){const b=BEACONS[i],x=b.island?b.island.x:553,z=b.island?b.island.z:-27,y=b.island?10:Math.max(1,landHeight(x,z));const h=i===1?18:14;this.cyl(x,y+h*.5,z,2.3,4,h,'#bcc2a4',null,null,12);this.cyl(x,y+h*.58,z,2.7,2.9,2,'#355666',null,null,12);this.cyl(x,y+h-1,z,3.2,3.2,.7,'#304b54',null,null,12);this.cyl(x,y+h+1,z,2.3,2.3,3,'#3b5356',null,null,10);this.cyl(x,y+h+3.4,z,0,3.4,2,'#304b54');
   const g=new THREE.Group();g.position.set(x,y+h+1,z);const flame=new THREE.Mesh(new THREE.SphereGeometry(1.5,12,8),new THREE.MeshBasicMaterial({color:'#f9d487'}));g.add(flame);const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color:'#ffd589',transparent:true,depthWrite:false}));glow.scale.set(25,25,1);g.add(glow);const light=new THREE.PointLight('#ffce79',18,55,1.5);g.add(light);g.visible=false;this.scene.add(g);this.beaconGroups.push(g);
   const ring=new THREE.Mesh(new THREE.TorusGeometry(11,.15,4,64),new THREE.MeshBasicMaterial({color:'#c9ba7c',transparent:true,opacity:.45}));ring.rotation.x=-Math.PI/2;ring.position.set(b.x,.35,b.z);this.scene.add(ring);
  }
 }
 makeOrbs(){for(const p of ORBS){const g=new THREE.Group();g.position.set(p.x,homeHeight(p.x,p.z)+1.8,p.z);const gem=new THREE.Mesh(new THREE.OctahedronGeometry(.5),new THREE.MeshBasicMaterial({color:'#ffe5a0'}));g.add(gem);const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color:'#ffe1a0',transparent:true,depthWrite:false}));glow.scale.set(5,5,1);g.add(glow);this.scene.add(g);this.orbMeshes.push(g);}}
 makeBike(){
  const g=new THREE.Group();g.scale.setScalar(1.15);const wheelMat=this.mat('#112a30');this.wheels=[];
  for(const z of [-1.12,1.12]){const w=new THREE.Group();w.position.set(0,.8,z);const tire=new THREE.Mesh(new THREE.TorusGeometry(.73,.08,8,30),wheelMat);tire.rotation.y=Math.PI/2;w.add(tire);const rim=new THREE.Mesh(new THREE.TorusGeometry(.64,.025,5,30),this.mat('#c3b78b'));rim.rotation.y=Math.PI/2;w.add(rim);for(let i=0;i<10;i++){const a=i*Math.PI/5;this.tube([0,0,0],[0,Math.cos(a)*.64,Math.sin(a)*.64],.012,'#b7b391',w);}this.tube([-.12,0,0],[.12,0,0],.06,'#c2ae75',w);g.add(w);this.wheels.push(w);}
  const nodes=[[0,.8,1.12],[0,.85,.15],[0,1.8,.42],[0,1.8,-.76],[0,.8,-1.12]];for(const [a,b] of [[0,1],[0,2],[1,2],[1,3],[2,3],[3,4],[1,4]])this.tube(nodes[a],nodes[b],.065,'#cbac63',g);this.tube([0,1.8,-.76],[0,2.2,-.8],.05,'#b6b79b',g);this.tube([-.48,2.25,-.8],[.48,2.25,-.8],.055,'#acae95',g);this.box(0,1.92,.45,.52,.12,.4,'#674d39',g);this.box(0,1.57,-1.2,.5,.4,.45,'#f6d58a',g,null,true);
  const crank=new THREE.Group();crank.position.set(0,.85,.15);this.tube([-.3,0,0],[.3,0,0],.045,'#bfc6a4',crank);this.tube([-.3,0,0],[-.3,-.3,.05],.045,'#bfc6a4',crank);this.tube([.3,0,0],[.3,.3,-.05],.045,'#bfc6a4',crank);g.add(crank);this.crank=crank;
  this.rider=new THREE.Group();this.rider.position.set(0,1.9,.45);this.cyl(0,.45,-.12,.31,.33,.95,'#d0a359',this.rider,[.28,0,0]);this.add(new THREE.SphereGeometry(.24,12,8),'#d2b58c',[0,1.15,-.29],null,this.rider);this.cyl(0,1.36,-.28,.34,.36,.12,'#a6a67c',this.rider);this.cyl(0,1.43,-.28,.22,.24,.17,'#bbc098',this.rider);for(const side of [-1,1]){this.tube([side*.26,.76,-.14],[side*.43,.35,-1.2],.095,'#b98f4d',this.rider);this.tube([side*.22,.02,0],[side*.28,-.53,-.3],.12,'#304a50',this.rider);this.tube([side*.28,-.53,-.3],[side*.29,-.88,-.1],.10,'#29454c',this.rider);}this.box(0,.5,.21,.47,.55,.27,'#52685a',this.rider);g.add(this.rider);return g;
 }
 makeBoat(){
  const g=new THREE.Group();const shape=new THREE.Shape();shape.moveTo(0,-4.8);shape.bezierCurveTo(-1.5,-3.8,-2.2,-2,-1.9,1);shape.quadraticCurveTo(-1.8,3.3,-1.2,4);shape.lineTo(1.2,4);shape.quadraticCurveTo(1.8,3.3,1.9,1);shape.bezierCurveTo(2.2,-2,1.5,-3.8,0,-4.8);
  const hull=new THREE.ExtrudeGeometry(shape,{depth:1.4,bevelEnabled:true,bevelThickness:.35,bevelSize:.22,bevelSegments:2,steps:1});hull.rotateX(Math.PI/2);this.add(hull,'#8b7151',[0,1.2,0],null,g);
  for(let i=0;i<8;i++)this.box((i-3.5)*.42,1.3,.1,.39,.12,6.1,'#b5a779',g);for(const side of [-1,1]){this.tube([side*1.7,1.8,2.8],[side*1.65,1.8,-2.8],.09,'#c1b681',g);this.tube([side*1.65,1.8,-2.8],[0,1.8,-4.5],.09,'#c1b681',g);for(let j=-2;j<=2;j+=2)this.tube([side*1.7,1.3,j],[side*1.7,1.8,j],.05,'#657a76',g);}
  this.cyl(0,6.2,-.6,.09,.16,10,'#a99d71',g);this.cyl(0,1.5,2.2,.4,.55,.45,'#a4894d',g);this.tube([0,1.75,2.2],[.6,1.75,2.2],.07,'#cfb674',g);
  this.sailPivot=new THREE.Group();this.sailPivot.position.set(0,2,-.6);g.add(this.sailPivot);
  const positions=[],uv=[],ind=[];const rows=24,cols=14;for(let r=0;r<=rows;r++){const t=r/rows;for(let c=0;c<=cols;c++){const u=c/cols;positions.push(u*(1-t)*5.2, t*8.2,0);uv.push(u,t);}}for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const a=r*(cols+1)+c;ind.push(a,a+1,a+cols+1,a+1,a+cols+2,a+cols+1);}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(ind);geo.computeVertexNormals();this.sailBase=positions;
  this.sail=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:'#d4af65',side:THREE.DoubleSide,roughness:.96}));this.sailPivot.add(this.sail);this.tube([0,0,0],[5.2,0,0],.09,'#bdab77',this.sailPivot);this.tube([0,0,0],[0,8.2,0],.025,'#d4c59a',this.sailPivot);for(let r=1;r<5;r++){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,r*1.6,.03),new THREE.Vector3((1-r*1.6/8.2)*5.2,r*1.6,.03)]),new THREE.LineBasicMaterial({color:'#866b43',transparent:true,opacity:.4}));this.sailPivot.add(line);}
  this.rope=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,1.8,2.2),new THREE.Vector3(4,2,-.6)]),new THREE.LineBasicMaterial({color:'#ebd498'}));g.add(this.rope);
  for(const [x,z] of [[-1.3,-2.8],[1.3,2.5]]){this.box(x,2.3,z,.36,.6,.36,'#f7cd76',g,null,true);const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color:'#ffc979',transparent:true,depthWrite:false}));glow.position.set(x,2.3,z);glow.scale.set(2.5,2.5,1);g.add(glow);}
  this.box(0,1.6,3.2,1.8,.2,.7,'#6f7868',g);this.box(0,2.1,3.5,.16,1,.16,'#b69d69',g);const wheel=new THREE.Mesh(new THREE.TorusGeometry(.35,.04,6,18),this.mat('#c4b37c'));wheel.position.set(0,2.5,3.5);g.add(wheel);
  this.wake=new THREE.Mesh(new THREE.PlaneGeometry(2.5,20),new THREE.MeshBasicMaterial({color:'#a1c3b7',transparent:true,opacity:.09,depthWrite:false}));this.wake.rotation.x=-Math.PI/2;this.wake.position.set(0,.2,14);g.add(this.wake);return g;
 }
 update(t,dt,s,{title=false,paused=false,jump=0,windForce=null,walk=false,look=0}={}){
  this.waterMat.uniforms.uTime.value=t;this.sky.position.copy(this.camera.position);
  for(let i=0;i<this.orbMeshes.length;i++){const o=this.orbMeshes[i];o.visible=!s.collected.includes(i);o.position.y=homeHeight(o.position.x,o.position.z)+1.7+Math.sin(t*1.6+i)*.3;o.children[0].rotation.y=t*.7;}
  for(let i=0;i<3;i++){this.beaconGroups[i].visible=s.lit.includes(i);if(this.beaconGroups[i].visible)this.beaconGroups[i].children[1].scale.setScalar(24+Math.sin(t*3)*2);}
  const sailing=s.chapter==='sail';this.bike.visible=!sailing;this.rider.visible=!s.firstPerson;
  if(!sailing){const ground=homeHeight(s.x,s.z);this.bike.position.set(s.x,ground+.2+jump,s.z);this.bike.rotation.y=-s.heading;this.bike.rotation.z=Math.sin(t*1.3)*s.speed*.002;const f=homeHeight(s.x+Math.sin(s.heading)*1.2,s.z-Math.cos(s.heading)*1.2);this.bike.rotation.x=clamp(Math.atan2(f-ground,1.2),-.32,.32);this.wheels.forEach(w=>w.rotation.x-=s.speed*dt/.75);this.crank.rotation.x+=s.speed*dt*1.8;}
  else {this.boat.position.set(s.x,.3+Math.sin(t*1.1+s.x*.04)*.16,s.z);this.boat.rotation.y=-s.heading;this.boat.rotation.z=Math.sin(t*.9)*.045+(windForce?.side||1)*s.speed*.006;this.boat.rotation.x=Math.sin(t*1.2)*.018;}
  const boom=(.18+(1-s.trim)*1.25)*(windForce?.side||1);this.sailPivot.rotation.y=boom-Math.PI/2;this.sail.scale.y=.25+s.sailRaised*.75;const p=this.sail.geometry.attributes.position;for(let i=0;i<p.count;i++){const u=this.sail.geometry.attributes.uv.getX(i),v=this.sail.geometry.attributes.uv.getY(i);p.setZ(i,Math.sin(u*Math.PI)*Math.sin(v*Math.PI)*(.9-s.trim*.5)+Math.sin(t*3+v*12+u*4)*.055*(1-s.trim)*u);}p.needsUpdate=true;this.sail.geometry.computeVertexNormals();const end=new THREE.Vector3(5.2,0,0).applyAxisAngle(UP,this.sailPivot.rotation.y).add(this.sailPivot.position);this.rope.geometry.attributes.position.setXYZ(1,...end.toArray());this.rope.geometry.attributes.position.needsUpdate=true;this.wake.material.opacity=sailing?.02+s.speed*.008:0;
  if(title){const a=.06*Math.sin(t*.05);this.camTarget.set(100+Math.sin(a)*30,58,147);this.camLook.set(2,12,-12);}
  else if(walk){this.camTarget.set(s.x,landHeight(s.x,s.z)+2,s.z);this.camLook.set(s.x+Math.sin(s.heading+look)*10,landHeight(s.x,s.z)+2.2,s.z-Math.cos(s.heading+look)*10);}
  else {const h=s.heading+look,base=sailing?this.boat.position.y:homeHeight(s.x,s.z)+jump;
   if(s.firstPerson){const back=sailing?2.7:-.15;this.camTarget.set(s.x-Math.sin(h)*back,base+(sailing?3.2:2.7),s.z+Math.cos(h)*back);this.camLook.set(s.x+Math.sin(h)*25,base+(sailing?3.1:2.3),s.z-Math.cos(h)*25);}
   else {const back=sailing?19:10+Math.min(s.speed,9)*.22;this.camTarget.set(s.x-Math.sin(h)*back,base+(sailing?8.8:5.8),s.z+Math.cos(h)*back);this.camLook.set(s.x+Math.sin(h)*7,base+(sailing?3.4:2.1),s.z-Math.cos(h)*7);}
  }
  const smoothing=1-Math.exp(-dt*(s.firstPerson?10:3));this.camera.position.lerp(this.camTarget,smoothing);this.lookCurrent.lerp(this.camLook,smoothing);this.camera.lookAt(this.lookCurrent);this.renderer.render(this.scene,this.camera);
 }
}
