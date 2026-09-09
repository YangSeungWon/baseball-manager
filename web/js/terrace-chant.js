// Short, original vowel calls. No sustained sawtooth voices or external recordings.
export function chantPattern(name='',order=1){
 let seed=[...name].reduce((n,c)=>(Math.imul(n,31)+c.codePointAt(0))>>>0,order);
 const variant=seed%3;
 return {key:name+':'+order,bpm:108+variant*6,variant,drums:[[0,4,8,12],[0,3,8,11],[0,6,8,12]][variant],claps:[[2,6,10,14,15],[4,6,12,14],[2,4,10,14,15]][variant],voice:[[0,3,6,10,12,14],[0,2,5,8,11,14],[0,4,6,9,12,14]][variant].map((step,i)=>({step,vowel:i%3===2?'a':'o',response:i>=3,duration:i===2?.38:.23}))};
}
export class TerraceChant {
 constructor(ctx,destination,noise){
  this.ctx=ctx;this.noise=noise;
  this.voices=Array.from({length:8},(_,voice)=>{const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.8),ctx.sampleRate),d=b.getChannelData(0),n=noise.getChannelData(0),f0=96+voice*9;let phase=0;for(let i=0;i<d.length;i++){phase+=2*Math.PI*f0*(1-.045*i/d.length+.008*Math.sin(i/ctx.sampleRate*13+voice))/ctx.sampleRate;let tone=0;for(let h=1;h<=5;h++)tone+=Math.sin(phase*h)/(h*h);d[i]=tone*.36+n[i%n.length]*.55;}return b;});
  this.nodes=new Set();this.bus=ctx.createGain();this.bus.gain.value=.42;
  this.limiter=ctx.createDynamicsCompressor();this.limiter.threshold.value=-18;this.limiter.knee.value=12;this.limiter.ratio.value=4;
  this.bus.connect(this.limiter);this.limiter.connect(destination);
  this.reverb=ctx.createConvolver();const impulse=ctx.createBuffer(2,Math.ceil(ctx.sampleRate*1.1),ctx.sampleRate);
  for(let ch=0;ch<2;ch++){const d=impulse.getChannelData(ch);let last=0;for(let i=0;i<d.length;i++){last=last*.7+(Math.random()*2-1)*.3;d[i]=last*Math.exp(-7*i/d.length);}}
  this.reverb.buffer=impulse;this.wet=ctx.createGain();this.wet.gain.value=.12;this.bus.connect(this.reverb);this.reverb.connect(this.wet);this.wet.connect(this.limiter);
 }
 setPlayer(name,order){const pattern=chantPattern(name,order);if(this.pattern?.key===pattern.key)return;this.stop();this.pattern=pattern;this.step=0;}
 setCue(cue,strength=.5){
  this.cue=cue;if(!this.pattern)return;
  if(['idle','pitch'].includes(cue)){if(!this.timer)this.start();return;}
  this.stop();this.step=0;
  if(['cheer','groan','foul'].includes(cue))this.call(this.ctx.currentTime+.04,cue==='groan'?'o':'a',cue==='cheer'?.55:.32,true,.6+strength*.3);
  this.resumeAt=this.ctx.currentTime+({contact:2.8,cheer:2+Math.max(0,Math.min(1,strength))*3,groan:1.8,foul:1.2}[cue]||1.5);this.start(this.resumeAt);
 }
 start(at=this.ctx.currentTime+.06){
  if(this.timer||!this.pattern)return;this.next=at;this.bus.gain.cancelScheduledValues(this.ctx.currentTime);this.bus.gain.setTargetAtTime(.42,this.ctx.currentTime,.025);
  const tick=()=>{const c=this.ctx;if(c.state!=='running'){this.next=c.currentTime+.1;return;}if(this.next<c.currentTime)this.next=c.currentTime+.05;
   while(this.next<c.currentTime+.18){const p=this.pattern,e=p.voice.find(x=>x.step===this.step%16);if(e)this.call(this.next,e.vowel,e.duration,e.response);this.next+=30/p.bpm;this.step++;}
  };this.timer=setInterval(tick,80);tick();
 }
 call(at,vowel,duration,response=false,level=1){
  const c=this.ctx,people=response?6:3;
  for(let i=0;i<people;i++){
   const source=c.createBufferSource();source.buffer=this.voices[(i+Math.floor(Math.random()*3))%this.voices.length];source.playbackRate.value=.92+Math.random()*.16;
   const low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=1800;low.Q.value=.5;
   const formant=c.createBiquadFilter();formant.type='bandpass';formant.frequency.value=(vowel==='a'?780:460)*(1+(Math.random()-.5)*.18);formant.Q.value=.85;
   const gain=c.createGain(),pan=c.createStereoPanner();pan.pan.value=(response?1:-1)*(.2+Math.random()*.45);
   const t=at+Math.random()*.045,peak=(response?.095:.12)*level;
   gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(peak,t+.035);gain.gain.setValueAtTime(peak*.8,t+duration*.55);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
   source.connect(low);low.connect(formant);formant.connect(gain);gain.connect(pan);pan.connect(this.bus);
   const node={source,parts:[low,formant,gain,pan]};this.nodes.add(node);source.onended=()=>{source.disconnect();for(const p of node.parts)p.disconnect();this.nodes.delete(node);};source.start(t);source.stop(t+duration+.02);
  }
 }
 stop(){clearInterval(this.timer);this.timer=null;if(!this.ctx)return;const t=this.ctx.currentTime;this.bus.gain.cancelScheduledValues(t);this.bus.gain.setTargetAtTime(0,t,.02);for(const n of this.nodes){try{n.source.stop(t+.04);}catch{}}}
 dispose(){this.stop();for(const n of this.nodes){n.source.onended=null;n.source.disconnect();for(const p of n.parts)p.disconnect();}this.nodes.clear();this.bus.disconnect();this.reverb.disconnect();this.wet.disconnect();this.limiter.disconnect();}
}
