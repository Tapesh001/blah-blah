import './style.css';
import './accessibility.css';
import {World,homeHeight,landHeight} from './world.js';
import {freshState,ORBS,STEEPLE,HARBOUR,MORNE,BEACONS,clamp,distance,wrapAngle,repairReady,installGear,connectChain,finishRepair,collect,deliver,startSailing,lightBeacon,finishJourney,restoreState,windAt,sailingForce} from './game.js';
import {Soundscape} from './audio.js';

const $=id=>document.getElementById(id);
const SAVE_KEY='starwind-voyage-v1';
let state=freshState(),world,started=false,keys={},lastTime=0,time=0,saveTime=0,toastTimer=0,jump=0,jumpVelocity=0,selectedGear=null,kindle=0,interaction=null,look=0,pointer=null,winchPreviousView=false;
let saved=null;try{saved=restoreState(JSON.parse(localStorage.getItem(SAVE_KEY)));}catch{}
const sound=new Soundscape();
const dialogs=[...document.querySelectorAll('dialog')];
const isPaused=()=>dialogs.some(d=>d.open);
function save(){if(state.practice)return;try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));saved=restoreState(state);$('continue-btn').hidden=false;}catch{}}
function showToast(message,duration=4){$('toast').textContent=message;$('toast').classList.add('visible');toastTimer=duration;}
function showDialog(id){keys={};$(id).showModal();}
function closeDialog(id){$(id).close();keys={};}
function updateAudioButton(){const enabled=sound.enabled;$('sound-btn').setAttribute('aria-label',enabled?'Mute sound':'Enable sound');$('sound-btn').innerHTML=enabled?'♫':'♫<span class="sound-off">×</span>';}
function setMode(){
 $('winch-btn').hidden=state.chapter!=='sail'||state.onFoot;
 const sail=state.chapter==='sail';$('chapter-no').textContent=state.onFoot?'EPILOGUE':sail?'CHAPTER 02':'CHAPTER 01';$('chapter-name').textContent=state.onFoot?'The last ember':sail?'The open sea':'The night ride';$('location-label').textContent=state.onFoot?'THE ISLE OF MORNE':sail?(state.practice?'FREE SAIL · PRACTICE':'THE LANTERN ARCHIPELAGO'):'SAINT-RÉMY · AFTER HOURS';$('ride-controls').hidden=sail;$('sail-controls').hidden=!sail||state.onFoot;$('wind-panel').hidden=!sail||state.onFoot;$('speed-label').textContent=sail?(state.onFoot?'M / S':'KNOTS'):'KM / H';$('stat-label').textContent=sail?'BEACONS LIT':'LIGHTS FOUND';$('condition-icon').textContent=sail?'◭':'⛓';$('condition-label').textContent=sail?'SAIL POWER':'CHAIN CONDITION';$('view-btn').hidden=state.onFoot;updateView();
}
function updateView(){$('view-btn').querySelector('span').textContent=state.firstPerson?'First person':'Chase camera';}
function begin(useSaved=false,practice=false){dialogs.forEach(d=>d.close());state=useSaved&&saved?restoreState(saved):freshState();if(practice)startSailing(state,true);started=true;keys={};jump=jumpVelocity=0;kindle=0;look=0;$('intro').hidden=true;$('hud').hidden=false;setMode();save();showToast(practice?'A fair wind, and no hurry.':useSaved?'Your light is right where you left it.':'Six little stars. One sleeping village.',5);if(state.chainBroken)openRepair();}
$('begin-btn').addEventListener('click',()=>{if(saved){showDialog('new-confirm');}else begin();});
// Keep reset deliberate and reversible until the player actually begins again.
const confirm=document.createElement('dialog');confirm.id='new-confirm';confirm.className='simple-modal';confirm.innerHTML='<div class="eyebrow">A FRESH PAGE</div><h2>Begin again?</h2><p>This replaces your saved journey in this browser.</p><button id="confirm-new" class="primary">Start a new journey ↗</button><button id="cancel-new" class="text-button">Keep my checkpoint</button>';document.body.append(confirm);dialogs.push(confirm);$('confirm-new').onclick=()=>begin();$('cancel-new').onclick=()=>closeDialog('new-confirm');
$('continue-btn').hidden=!saved;$('continue-btn').onclick=()=>begin(true);$('practice-btn').onclick=()=>begin(false,true);
$('sound-btn').onclick=()=>{sound.toggle();updateAudioButton();};$('credits-btn').onclick=()=>showDialog('credits-dialog');$('close-credits').onclick=()=>closeDialog('credits-dialog');
$('pause-btn').onclick=()=>{if(started&&!isPaused())showDialog('pause-dialog');};$('home-link').onclick=e=>{e.preventDefault();if(started&&!isPaused())showDialog('pause-dialog');};$('resume-btn').onclick=()=>closeDialog('pause-dialog');
$('menu-btn').onclick=()=>{save();closeDialog('pause-dialog');started=false;keys={};$('intro').hidden=false;$('hud').hidden=true;};
$('harbour-reset').onclick=()=>{if(state.onFoot){state.x=540;state.z=-30;state.heading=0;}else if(state.chapter==='sail'){state.x=151;state.z=48;state.heading=Math.PI/2;}else{state.x=0;state.z=77;state.heading=0;}state.speed=0;closeDialog('pause-dialog');save();showToast('Back on familiar ground.');};
$('view-btn').onclick=()=>{state.firstPerson=!state.firstPerson;look=0;updateView();};
$('winch-btn').onclick=()=>openWinch();
$('map-btn').onclick=()=>openMap();$('close-map').onclick=()=>closeDialog('map-dialog');
$('interact-btn').onclick=()=>interact();
$('explore-btn').onclick=()=>closeDialog('ending-dialog');$('replay-btn').onclick=()=>{closeDialog('ending-dialog');showDialog('new-confirm');};
dialogs.forEach(d=>d.addEventListener('close',()=>{keys={};}));
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&!isPaused()){keys={};save();showDialog('pause-dialog');}});
window.addEventListener('blur',()=>{keys={};});window.addEventListener('beforeunload',()=>{if(started)save();});

function target(){
 if(state.onFoot)return {...world.morneChapel,name:'THE ATHANOR'};
 if(state.chapter==='ride'){
  if(state.chainBroken)return {x:state.x,z:state.z,name:'REPAIR THE CHAIN'};
  if(state.delivered)return {...HARBOUR,name:'THE HARBOUR'};
  const next=ORBS.findIndex((_,i)=>!state.collected.includes(i));if(next>=0)return {...ORBS[next],name:'FALLEN STAR'};
  return {...STEEPLE,name:'THE STEEPLE'};
 }
 const next=BEACONS.findIndex((_,i)=>!state.lit.includes(i));return next>=0?{...BEACONS[next],name:BEACONS[next].name.toUpperCase()}:{...world.morneDock,name:'MORNE · SAFE HARBOUR'};
}
function interact(){if(!started||isPaused())return;if(state.chainBroken){openRepair();return;}if(interaction==='deliver'){if(deliver(state)){save();sound.success();showToast('The steeple is awake. The sea is calling.',6);}}else if(interaction==='board'){if(startSailing(state)){setMode();save();sound.success();showToast('The wind carries what the road cannot.',6);}}else if(interaction==='dock'){state.onFoot=true;state.firstPerson=true;state.x=540;state.z=-30;state.heading=0;state.speed=0;setMode();save();showToast('Follow the lanterns to the ruined chapel.',6);}else if(interaction==='kindle'){const i=BEACONS.findIndex((b,j)=>!state.lit.includes(j)&&distance(state,b)<53);if(i>=0){kindle+=.45;if(kindle>=1.5)ignite(i);}}}
function ignite(i){if(lightBeacon(state,i)){kindle=0;save();sound.success();showToast(`${BEACONS[i].name} burns again.`,5);}}
function handleKey(e,down){
 const k=e.key.toLowerCase();if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k)&&started&&!isPaused())e.preventDefault();
 if(!down){keys[k]=false;return;}if(e.repeat){keys[k]=true;return;}
 if(isPaused())return;
 if(k==='escape'&&started){e.preventDefault();showDialog('pause-dialog');return;}if(k==='m'){openMap();return;}if(!started)return;
 if(k==='v'&&!state.onFoot){state.firstPerson=!state.firstPerson;look=0;updateView();}
 if(k==='r'&&state.chapter==='sail'&&!state.onFoot){openWinch();return;}
 if(k==='e'&&(state.chapter==='ride'||interaction==='dock')){interact();return;}
 if(k===' '&&state.chapter==='ride'&&jump===0&&!state.chainBroken){jumpVelocity=5.3;sound.click();}
 keys[k]=true;
}
window.addEventListener('keydown',e=>handleKey(e,true));window.addEventListener('keyup',e=>handleKey(e,false));
document.querySelectorAll('[data-key]').forEach(b=>{b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);handleKey({key:b.dataset.key,preventDefault(){}},true);};b.onpointerup=()=>keys[b.dataset.key]=false;b.onpointercancel=()=>keys[b.dataset.key]=false;});
$('world').addEventListener('pointerdown',e=>{if(!started||isPaused())return;pointer={x:e.clientX,y:e.clientY};$('world').setPointerCapture(e.pointerId);});
$('world').addEventListener('pointermove',e=>{if(!pointer)return;const dx=e.clientX-pointer.x;look=clamp(look+dx*.005,-1.7,1.7);pointer={x:e.clientX,y:e.clientY};});$('world').addEventListener('pointerup',()=>{pointer=null;});

// Clockwork workbench: wrong size gears do not mesh; the chain needs a closed link and a safe tension.
function gearSVG(cx,cy,r,teeth,inner=15){let d='';for(let i=0;i<teeth*4;i++){const a=i/(teeth*4)*Math.PI*2,rad=i%4===0||i%4===3?r*.88:r;d+=`${i?'L':'M'}${cx+Math.cos(a)*rad},${cy+Math.sin(a)*rad}`;}d+='Z';return `<path d="${d}" fill="url(#brass)" stroke="#e5cb86" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="${r*.64}" fill="#1b3035" stroke="#b9a065" stroke-width="4"/>${Array.from({length:6},(_,i)=>{const a=i*Math.PI/3;return `<line x1="${cx+Math.cos(a)*inner}" y1="${cy+Math.sin(a)*inner}" x2="${cx+Math.cos(a)*r*.64}" y2="${cy+Math.sin(a)*r*.64}" stroke="#d1b36e" stroke-width="8"/>`;}).join('')}<circle cx="${cx}" cy="${cy}" r="${inner}" fill="url(#brass)"/><circle cx="${cx}" cy="${cy}" r="5" fill="#537681"/>`;}
$('gear-crank').innerHTML=gearSVG(120,184,73,32);$('gear-rear').innerHTML=gearSVG(500,171,44,24,10);
function openRepair(){state.speed=0;selectedGear=null;updateRepair();showDialog('repair-dialog');}
function updateRepair(){
 $('gear-idler').innerHTML=state.gear?gearSVG(320,220,42,24,10):'';$('axle-btn').hidden=state.gear;$('gear-board').querySelector('.axle-glow').style.opacity=state.gear?0:1;$('chain-path').style.opacity=state.linked?1:.26;
 $('link-btn').disabled=!state.gear||state.linked;$('chain-tension').disabled=!state.linked;$('tension-dial').disabled=!state.linked;$('chain-tension').value=state.tension*100;$('tension-number').textContent=Math.round(state.tension*100)+'%';$('test-drive').disabled=!repairReady(state);
 for(const [id,done,active] of [['step-gear',state.gear,!state.gear],['step-chain',state.linked,state.gear&&!state.linked],['step-tension',repairReady(state),state.linked]]){$(id).classList.toggle('done',done);$(id).classList.toggle('active',active);}
 $('repair-instruction').textContent=!state.gear?'The idler has slipped its axle. Choose the 24-tooth gear, then place it on the glowing spindle.':!state.linked?'The teeth mesh. Now fit the master link to close the loop.':'Turn the tensioner until the chain is snug. The gold band, 55–72%, is just right.';
 if(state.linked)$('repair-feedback').textContent=repairReady(state)?'That feels right. Give the pedals a turn.':state.tension<.55?'Too loose — the chain will slip.':'Too tight — ease the tensioner back.';
}
document.querySelectorAll('.gear-choice').forEach(b=>{b.onclick=()=>{selectedGear=Number(b.dataset.teeth);document.querySelectorAll('.gear-choice').forEach(x=>x.classList.toggle('selected',x===b));sound.click();};b.ondragstart=e=>{selectedGear=Number(b.dataset.teeth);e.dataTransfer.setData('text/plain',b.dataset.teeth);};});
function placeGear(){if(installGear(state,selectedGear)){sound.chime(2);$('repair-feedback').textContent='The idler is seated. Time to reconnect the chain.';updateRepair();save();}else{$('repair-feedback').textContent=selectedGear?'That gear does not mesh. The idler needs 24 teeth.':'Select a gear from the tray first.';sound.click();}}
$('axle-btn').onclick=placeGear;$('axle-btn').ondragover=e=>e.preventDefault();$('axle-btn').ondrop=e=>{e.preventDefault();placeGear();};$('gear-board').ondragover=e=>e.preventDefault();$('gear-board').ondrop=e=>{e.preventDefault();placeGear();};
$('link-btn').onclick=()=>{connectChain(state);sound.chime(3);updateRepair();save();};
function setTension(n){state.tension=clamp(n,0,1);updateRepair();save();}
$('chain-tension').oninput=e=>setTension(Number(e.target.value)/100);
function rotary(element,get,set,step){let dragging=false,lastAngle=0,moved=0;const angle=e=>{const r=element.getBoundingClientRect();return Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2);};element.addEventListener('pointerdown',e=>{if(element.disabled)return;e.preventDefault();element.setPointerCapture(e.pointerId);dragging=true;lastAngle=angle(e);moved=0;});element.addEventListener('pointermove',e=>{if(!dragging)return;const a=angle(e),delta=wrapAngle(a-lastAngle);moved+=Math.abs(delta);lastAngle=a;set(get()+delta*.12);});element.addEventListener('pointerup',()=>{if(dragging&&moved<.05)set(get()+step);dragging=false;});element.addEventListener('pointercancel',()=>dragging=false);element.addEventListener('keydown',e=>{if(['ArrowRight','ArrowUp','Enter',' '].includes(e.key)){e.preventDefault();set(get()+step);}if(['ArrowLeft','ArrowDown'].includes(e.key)){e.preventDefault();set(get()-step);}});}
rotary($('tension-dial'),()=>state.tension,setTension,.06);
$('test-drive').onclick=()=>{if(finishRepair(state)){sound.success();save();closeDialog('repair-dialog');showToast('Every link has its place. Ride on.',5);}};
$('close-repair').onclick=()=>closeDialog('repair-dialog');
function openWinch(){winchPreviousView=state.firstPerson;state.firstPerson=true;updateView();updateWinch();showDialog('winch-dialog');}
function updateWinch(){const force=sailingForce(state.heading,state.trim,windAt(time));$('sail-trim').value=Math.round(state.trim*100);$('winch-number').textContent=Math.round(state.trim*100)+'%';$('sail-winch').querySelector('.winch-handle').style.transform=`rotate(${state.trim*720}deg)`;$('winch-advice').textContent=force.noGo?'Bow into the wind. Bear away at the helm before trimming.':force.efficiency>.9?'The sail has found its shape. The wind is with you.':state.trim<force.ideal?'Haul the sheet a little. The sail is spilling wind.':'Ease the rope. Give the sail more room.';}
function setTrim(n){state.trim=clamp(n,.05,.95);updateWinch();}
$('sail-trim').oninput=e=>setTrim(Number(e.target.value)/100);rotary($('sail-winch'),()=>state.trim,setTrim,.05);
function closeWinch(){closeDialog('winch-dialog');state.firstPerson=winchPreviousView;updateView();save();}
$('close-winch').onclick=closeWinch;$('return-helm').onclick=closeWinch;$('winch-dialog').addEventListener('cancel',()=>{state.firstPerson=winchPreviousView;updateView();save();});

function openMap(){drawChart();showDialog('map-dialog');}
let chartBackground=null;
function drawChart(){
 const canvas=$('chart'),c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 const project=(x,z)=>({x:105+(x+130)*.79,y:365+(z-75)*.79});
 if(!chartBackground){const b=document.createElement('canvas');b.width=w;b.height=h;const ctx=b.getContext('2d');ctx.fillStyle='#0d2c39';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#a0c1b51a';ctx.lineWidth=1;for(let i=0;i<w;i+=40){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,h);ctx.stroke();}for(let j=0;j<h;j+=40){ctx.beginPath();ctx.moveTo(0,j);ctx.lineTo(w,j);ctx.stroke();}for(let i=0;i<w;i+=3)for(let j=0;j<h;j+=3){const x=(i-105)/.79-130,z=(j-365)/.79+75,y=landHeight(x,z);if(y>0){ctx.fillStyle=y>45?'#698a7a':y>20?'#4a7367':y>3?'#315a54':'#749582';ctx.fillRect(i,j,3,3);}}chartBackground=b;}
 c.drawImage(chartBackground,0,0);c.font='9px "DM Sans",sans-serif';c.letterSpacing='1px';c.fillStyle='#b5c8b4';const text=(x,z,s)=>{const p=project(x,z);c.fillText(s,p.x,p.y);};text(-70,-50,'SAINT-RÉMY');text(465,-285,'THE ISLE OF MORNE');text(475,-265,'SALT · MERCURY · SULFUR');text(190,-310,'THE OPEN SEA');text(-80,162,'01 · THE NIGHT RIDE');
 c.strokeStyle='#d6be7c75';c.setLineDash([4,6]);c.beginPath();const route=[HARBOUR,...BEACONS,world.morneDock];route.forEach((b,i)=>{const p=project(b.x,b.z);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);});c.stroke();c.setLineDash([]);
 for(let i=0;i<3;i++){const b=BEACONS[i],p=project(b.x,b.z);c.fillStyle=state.lit.includes(i)?'#ffda84':'#b7c8ae';c.font='20px Georgia';c.fillText(state.lit.includes(i)?'✦':'✧',p.x-7,p.y+5);c.font='9px sans-serif';c.fillText(b.name,p.x+14,p.y+3);}
 for(let i=0;i<6;i++){if(state.collected.includes(i))continue;const p=project(ORBS[i].x,ORBS[i].z);c.fillStyle='#e8ce8e';c.beginPath();c.arc(p.x,p.y,2,0,Math.PI*2);c.fill();}
 const p=project(state.x,state.z);c.save();c.translate(p.x,p.y);c.rotate(state.heading);c.fillStyle='#ffe8a3';c.shadowColor='#ffdf8f';c.shadowBlur=10;c.beginPath();c.moveTo(0,-8);c.lineTo(5,6);c.lineTo(0,3);c.lineTo(-5,6);c.closePath();c.fill();c.restore();
 c.fillStyle='#e1d3a2';c.font='11px Georgia';c.fillText('N',w-40,33);c.beginPath();c.moveTo(w-36,46);c.lineTo(w-36,75);c.moveTo(w-36,46);c.lineTo(w-40,54);c.moveTo(w-36,46);c.lineTo(w-32,54);c.strokeStyle='#e1d3a2';c.stroke();c.font='8px sans-serif';c.fillText('100 m',w-90,h-19);c.beginPath();c.moveTo(w-95,h-30);c.lineTo(w-16,h-30);c.stroke();
}
function updateHud(force){
 const sailing=state.chapter==='sail',goal=target(),d=distance(state,goal),bearing=Math.atan2(goal.x-state.x,state.z-goal.z),relative=wrapAngle(bearing-state.heading);$('waypoint').textContent=`${relative>.3?'↗':relative<-.3?'↖':'↑'} ${goal.name} · ${Math.round(d)} M`;$('compass-track').style.textIndent=`${-Math.round(state.heading*26)}px`;
 $('stars-count').innerHTML=sailing?`${state.lit.length} <small>/ 3</small>`:`${state.collected.length} <small>/ 6</small>`;$('speed').textContent=(Math.abs(state.speed)*(sailing?(state.onFoot?1:1.944):3.6)).toFixed(1);
 $('condition-fill').style.width=(sailing?force.force*state.sailRaised*100:state.chainBroken?0:state.repaired?100:Math.max(8,100-state.distance/35*90))+'%';$('condition-fill').style.background=state.chainBroken?'#df9272':'#e7ca84';
 if(sailing){const wind=windAt(time);$('wind-arrow').style.transform=`rotate(${(wind.heading-state.heading)*180/Math.PI}deg)`;$('wind-speed').textContent=`${wind.speed.toFixed(1)} knots · ${force.noGo?'headwind':force.relative>0?'starboard':'port'}`;$('trim-value').textContent=Math.round(state.trim*100)+'%';$('wind-advice').textContent=force.noGo?'Into the wind — turn across it.':force.efficiency>.85?'Good trim. Keep her steady.':state.trim<force.ideal?'Haul the sheet with E.':'Ease the sheet with Q.';}
 const objective=state.onFoot?['THE LAST EMBER','Follow the lanterns inland. Reach the Athanor in the ruined chapel.']:!sailing?(state.chainBroken?['A LITTLE REPAIR','The chain has snapped. Press E to open the roadside workbench.']:state.delivered?['FOLLOW THE WATER','Your lights are delivered. Ride to the harbour and board the boat.']:state.collected.length===6?['WAKE THE STEEPLE','Bring the six stars to the church. Press E when you arrive.']:['CARRY THE LIGHT','Collect six fallen stars along the village road.']):state.lit.length===3?['THE ISLE OF MORNE','Moor at the last harbour. A final light waits in the chapel.']:['KEEP THE LIGHT ALIVE','Follow the chart to each beacon. Hold Space nearby to kindle it.'];$('objective-tag').textContent=objective[0];$('objective-text').textContent=objective[1];
 interaction=null;let prompt='',action='';
 if(state.chainBroken){interaction='repair';prompt='The pedals turn, but the wheel is still.';action='Repair the chain';}
 else if(!sailing&&!state.delivered&&state.collected.length===6&&distance(state,STEEPLE)<17){interaction='deliver';prompt='Six stars for a sleeping steeple.';action='Deliver the light';}
 else if(!sailing&&state.delivered&&distance(state,HARBOUR)<15){interaction='board';prompt='Leave the bicycle. Take the wind.';action='Set sail';}
 else if(sailing&&!state.onFoot){const bi=BEACONS.findIndex((b,i)=>!state.lit.includes(i)&&distance(state,b)<53);if(bi>=0){interaction='kindle';prompt=`${BEACONS[bi].name} · ${kindle>0?Math.round(kindle/1.5*100)+'%':'a light waiting to happen'}`;action='Hold Space to kindle';}else if(state.lit.length===3&&distance(state,world.morneDock)<45){interaction='dock';prompt='The Isle of Morne · follow the lanterns inland';action='Moor & step ashore';}}
 $('interaction').hidden=!interaction;$('interaction-text').textContent=prompt;$('interact-btn').innerHTML=action+` <kbd>${interaction==='kindle'?'SPACE':'E'}</kbd>`;
}
function physics(dt){
 const turn=(keys.d||keys.arrowright?1:0)-(keys.a||keys.arrowleft?1:0),forward=keys.w||keys.arrowup,brake=keys.s||keys.arrowdown;
 if(state.onFoot){state.heading+=turn*dt*1.6;state.speed=(forward?4.2:brake?-2.4:0);const nx=state.x+Math.sin(state.heading)*state.speed*dt,nz=state.z-Math.cos(state.heading)*state.speed*dt;if(landHeight(nx,nz)>-.4||distance({x:nx,z:nz},world.morneDock)<20){state.x=nx;state.z=nz;}if(distance(state,world.morneChapel)<12&&!state.complete&&!state.practice){finishJourney(state);save();sound.success();showDialog('ending-dialog');}return sailingForce(state.heading,state.trim,windAt(time));}
 if(state.chapter==='ride'){
  if(!state.chainBroken){const slope=(homeHeight(state.x+Math.sin(state.heading),state.z-Math.cos(state.heading))-homeHeight(state.x,state.z));state.speed+=((forward?5.5:0)-state.speed*.55-(brake?state.speed*3.5:0)-slope*.7)*dt;state.speed=clamp(state.speed,0,10.5);}else state.speed=Math.max(0,state.speed-dt*8);
  state.heading+=turn*dt*clamp(state.speed*.14,.3,1.3);const nx=state.x+Math.sin(state.heading)*state.speed*dt,nz=state.z-Math.cos(state.heading)*state.speed*dt;
  if(homeHeight(nx,nz)>.4||distance({x:nx,z:nz},HARBOUR)<15){const blocked=world.colliders.some(c=>Math.hypot(nx-c.x,nz-c.z)<c.r+1);if(!blocked){state.x=nx;state.z=nz;state.distance+=state.speed*dt;}else state.speed*=.5;}else{state.speed=0;showToast('The sea begins here. Follow the road to the harbour.',2);}
  if(!state.repaired&&!state.chainBroken&&state.distance>35){state.chainBroken=true;state.speed=0;save();sound.broken();openRepair();}
  for(let i=0;i<ORBS.length;i++)if(distance(state,ORBS[i])<5.5&&collect(state,i)){sound.chime(i);save();showToast(state.collected.length===6?'Six stars. Bring them to the steeple.':`${state.collected.length} of 6 · a little more light`,3);}
  if(jumpVelocity||jump>0){jumpVelocity-=dt*10;jump=Math.max(0,jump+jumpVelocity*dt);if(jump===0)jumpVelocity=0;}
  return sailingForce(state.heading,state.trim,windAt(time));
 }
 state.heading+=turn*dt*(.35+Math.abs(state.speed)*.035);if(keys.q)state.trim=clamp(state.trim-dt*.25,.05,.95);if(keys.e)state.trim=clamp(state.trim+dt*.25,.05,.95);if(forward)state.sailRaised=clamp(state.sailRaised+dt*.4,0,1);if(brake)state.sailRaised=clamp(state.sailRaised-dt*.7,0,1);
 const force=sailingForce(state.heading,state.trim,windAt(time));const desired=force.force*7.5*state.sailRaised;state.speed+=(desired-state.speed)*dt*.35;
 const nx=state.x+Math.sin(state.heading)*state.speed*dt,nz=state.z-Math.cos(state.heading)*state.speed*dt;
 if(landHeight(nx,nz)<.15&&Math.abs(nx)<850&&Math.abs(nz)<850){state.x=nx;state.z=nz;}else{state.speed=0;state.x-=Math.sin(state.heading)*dt;state.z+=Math.cos(state.heading)*dt;if(toastTimer<=0)showToast('Shallows ahead. Turn the rudder toward open water.',3);}
 const bi=BEACONS.findIndex((b,i)=>!state.lit.includes(i)&&distance(state,b)<53);
 if(bi>=0&&keys[' ']){kindle+=dt;if(kindle>=1.5)ignite(bi);}else kindle=Math.max(0,kindle-dt*.35);
 return force;
}
function loop(ms){requestAnimationFrame(loop);const dt=Math.min((ms-lastTime)/1000||.016,.05);lastTime=ms;const paused=isPaused();if(!paused)time+=dt;let force=sailingForce(state.heading,state.trim,windAt(time));if(started&&!paused){force=physics(dt);saveTime+=dt;if(saveTime>5){saveTime=0;save();}if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)$('toast').classList.remove('visible');}sound.update(time,state.chapter);if(!pointer)look*=Math.exp(-dt*.8);}if(started)updateHud(force);world.update(time,dt,state,{title:!started,paused,jump,windForce:force,walk:state.onFoot,look});}
try{world=new World($('world'));$('loading').style.opacity='0';setTimeout(()=>$('loading').hidden=true,650);requestAnimationFrame(loop);}catch(error){console.error(error);$('loading').innerHTML='<span>✧</span><p>This voyage needs WebGL 2.</p><p style="font:12px sans-serif;max-width:400px;text-align:center">Try a browser with hardware acceleration enabled, then reload.</p>';}
