export const TAU = Math.PI * 2;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
export const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
export const ORBS = Array.from({length:6},(_,i)=>({x:Math.sin(i*1.15)*6,z:60-i*13.3}));
export const STEEPLE = {x:0,z:-25};
export const HARBOUR = {x:117,z:48};
export const MORNE = {x:540,z:-220,scale:.6};
export const BEACONS = [
  {x:230,z:108,name:'Gull’s Lantern',island:{x:230,z:85,r:24}},
  {x:335,z:-93,name:'The Glasswatch',island:{x:335,z:-117,r:25}},
  {x:540,z:14,name:'Morne’s Last Light',island:null}
];
export const freshState = () => ({version:1,chapter:'ride',x:0,z:77,heading:0,speed:0,distance:0,collected:[],delivered:false,chainBroken:false,repaired:false,gear:false,linked:false,tension:.2,trim:.35,sailRaised:1,lit:[],complete:false,firstPerson:false,practice:false,onFoot:false});
export function repairReady(s){return s.gear && s.linked && s.tension>=.55 && s.tension<=.72;}
export function installGear(s,teeth){if(teeth!==24||s.gear)return false;s.gear=true;return true;}
export function connectChain(s){if(!s.gear)return false;s.linked=true;return true;}
export function finishRepair(s){if(!repairReady(s))return false;s.repaired=true;s.chainBroken=false;s.speed=0;return true;}
export function collect(s,index){if(s.chapter!=='ride'||s.collected.includes(index)||index<0||index>=6)return false;s.collected.push(index);return true;}
export function deliver(s){if(s.collected.length!==6||!s.repaired)return false;s.delivered=true;return true;}
export function startSailing(s,practice=false){if(!practice&&!s.delivered)return false;s.chapter='sail';s.practice=practice;s.x=151;s.z=48;s.heading=Math.PI/2;s.speed=0;s.sailRaised=1;return true;}
export function lightBeacon(s,index){if(s.chapter!=='sail'||s.lit.includes(index)||index<0||index>=BEACONS.length)return false;s.lit.push(index);return true;}
export function finishJourney(s){if(s.chapter!=='sail'||s.lit.length!==3||s.practice)return false;s.complete=true;return true;}
export function windAt(time){return {heading:1.15+Math.sin(time*.018)*.45,speed:12+Math.sin(time*.045)*2.2};}
export function sailingForce(heading,trim,wind){
  const relative=wrapAngle(wind.heading+Math.PI-heading);
  const angle=Math.abs(relative);
  const noGo=angle<.55;
  const ideal=clamp(.9-angle/Math.PI*.74,.12,.9);
  const efficiency=clamp(1-Math.abs(trim-ideal)*1.65,.12,1);
  const polar=noGo ? .025 : Math.pow(Math.sin((angle-.4)/(Math.PI-.4)*Math.PI*.72),.65);
  return {relative,ideal,efficiency,noGo,force:clamp(polar*efficiency,0,1),side:relative>0?1:-1};
}
export function restoreState(raw){
  if(!raw||raw.version!==1||!['ride','sail'].includes(raw.chapter))return null;
  const s=freshState();
  for(const key of ['x','z','heading','distance','tension','trim','sailRaised'])if(Number.isFinite(raw[key]))s[key]=raw[key];
  for(const key of ['delivered','chainBroken','repaired','gear','linked','complete','practice','onFoot'])s[key]=raw[key]===true;
  s.chapter=raw.chapter;
  s.collected=[...new Set(Array.isArray(raw.collected)?raw.collected.filter(i=>Number.isInteger(i)&&i>=0&&i<6):[])];
  s.lit=[...new Set(Array.isArray(raw.lit)?raw.lit.filter(i=>Number.isInteger(i)&&i>=0&&i<3):[])];
  s.x=clamp(s.x,-850,850);s.z=clamp(s.z,-850,850);s.trim=clamp(s.trim,.05,.95);s.tension=clamp(s.tension,0,1);s.sailRaised=clamp(s.sailRaised,0,1);
  if(s.repaired)s.chainBroken=false;
  if(s.chapter==='sail'&&!s.delivered&&!s.practice)return null;
  return s;
}
