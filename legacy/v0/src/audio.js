export class Soundscape {
  constructor(){this.enabled=false;this.ctx=null;this.last=0;}
  toggle(){this.enabled=!this.enabled;if(this.enabled){this.ctx??=new (window.AudioContext||window.webkitAudioContext)();this.ctx.resume();this.chime(0);}return this.enabled;}
  tone(freq,duration=.6,gain=.04,type='sine',delay=0){if(!this.enabled||!this.ctx)return;const t=this.ctx.currentTime+delay;const o=this.ctx.createOscillator(),v=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);v.gain.setValueAtTime(0,t);v.gain.linearRampToValueAtTime(gain,t+.015);v.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(v);v.connect(this.ctx.destination);o.start(t);o.stop(t+duration+.05);}
  chime(i=0){const notes=[293.66,349.23,440,523.25,587.33,698.46];this.tone(notes[i%6],1.5,.045);this.tone(notes[i%6]*2,.8,.012,'sine',.07);}
  click(){this.tone(190,.09,.025,'triangle');}
  broken(){this.tone(110,.3,.055,'sawtooth');this.tone(73,.45,.035,'triangle',.12);}
  success(){[0,2,4,5].forEach((v,i)=>this.tone([293.66,349.23,440,523.25,587.33,698.46][v],2,.035,'sine',i*.18));}
  update(t,chapter){if(!this.enabled||t-this.last<4)return;this.last=t;const scale=chapter==='sail'?[146.83,220,293.66,349.23,440]:[146.83,174.61,220,293.66,349.23];this.tone(scale[Math.floor(t/4)%scale.length],4,.012,'sine');}
}
