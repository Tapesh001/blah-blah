import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,installGear,connectChain,finishRepair,repairReady,collect,deliver,startSailing,lightBeacon,finishJourney,restoreState,sailingForce} from '../src/game.js';
import {heightFn} from '../src/vendor/tria-prima/world/heightmap.js';

test('complete campaign requires valid repair, six lights, delivery and three beacons',()=>{
 const s=freshState();assert.equal(startSailing(s),false);assert.equal(deliver(s),false);
 s.chainBroken=true;assert.equal(connectChain(s),false);assert.equal(installGear(s,16),false);assert.equal(installGear(s,32),false);assert.equal(finishRepair(s),false);
 assert.equal(installGear(s,24),true);assert.equal(connectChain(s),true);s.tension=.9;assert.equal(repairReady(s),false);s.tension=.64;assert.equal(finishRepair(s),true);assert.equal(s.chainBroken,false);
 for(let i=0;i<6;i++)assert.equal(collect(s,i),true);assert.equal(collect(s,2),false);assert.equal(deliver(s),true);assert.equal(startSailing(s),true);
 assert.equal(finishJourney(s),false);for(let i=0;i<3;i++)assert.equal(lightBeacon(s,i),true);assert.equal(lightBeacon(s,0),false);assert.equal(finishJourney(s),true);
 const saved=restoreState(JSON.parse(JSON.stringify(s)));assert.equal(saved.complete,true);assert.equal(saved.repaired,true);assert.equal(saved.speed,0);
});
test('wind and rope trim alter propulsion and enforce no-go zone',()=>{
 const wind={heading:Math.PI/2,speed:12};const downwind=sailingForce(Math.PI/2,.16,wind);const intoWind=sailingForce(-Math.PI/2,.8,wind);assert.equal(intoWind.noGo,true);assert.ok(downwind.force>intoWind.force*5);
 const reach=sailingForce(0,.53,wind);const bad=sailingForce(0,.05,wind);assert.ok(reach.force>bad.force);assert.ok(reach.ideal>.4&&reach.ideal<.6);
});
test('checkpoint restores unfinished repair and rejects malformed progress',()=>{
 const s=freshState();s.chainBroken=true;s.gear=true;s.collected=[0,1];let r=restoreState(JSON.parse(JSON.stringify(s)));assert.equal(r.gear,true);assert.equal(r.chainBroken,true);assert.deepEqual(r.collected,[0,1]);
 assert.equal(restoreState({version:88}),null);assert.equal(restoreState({...s,chapter:'sail'}),null);r=restoreState({...s,x:Infinity,trim:9,collected:[0,0,7,'1']});assert.equal(r.x,0);assert.equal(r.trim,.95);assert.deepEqual(r.collected,[0]);
});
test('practice stays separate from campaign completion',()=>{const s=freshState();startSailing(s,true);for(let i=0;i<3;i++)lightBeacon(s,i);assert.equal(finishJourney(s),false);assert.equal(restoreState(s).practice,true);});
test('adapted Morne keeps upstream landmark heights and south shore',()=>{assert.ok(heightFn(-170,-255)>120);assert.ok(heightFn(215,50)<-6);assert.ok(Math.abs(heightFn(0,326))<.1);assert.ok(heightFn(-10,70)>20);});
