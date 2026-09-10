import * as T from '../vendor/three/three.module.min.js';
import { FRANCHISES } from './core/names.js';

const IDENTITIES={
 SE:{form:'gorilla',accent:'#26282b'},BS:{form:'dolphin',accent:'#bfe9f5'},IC:{form:'bison',accent:'#4c3427'},DG:{form:'hawk',accent:'#f1c45b'},DJ:{form:'dragon',accent:'#e1b54d'},GJ:{form:'phoenix',accent:'#ffd54d'},US:{form:'shark',accent:'#d8edf0'},GY:{form:'hunter-hawk',accent:'#232326'},CW:{form:'unicorn',accent:'#efdcff'},CJ:{form:'owl',accent:'#f1d09a'},CA:{form:'arrow',accent:'#f2d2a5'},JJ:{form:'jaguar',accent:'#e7bd55'},GN:{form:'wolf',accent:'#e4e7eb'},JU:{form:'raven',accent:'#222638'}
};
export const mascotIdentity=name=>{const f=FRANCHISES.find(x=>`${x.city} ${x.nick}`===name);return f?{...f,...IDENTITIES[f.code]}:null;};

export function createTeamMascot(v,teamName){
 const id=mascotIdentity(teamName);if(!id)return null;
 const root=new T.Group();root.name=`mascot-${id.code}`;root.position.set(23.5,0,-5.5);root.rotation.y=-.18;root.userData.noBatch=true;v.scene.add(root);
 const part=(geo,color,parent=root,scale=[1,1,1],pos=[0,0,0])=>{const m=v.mesh(geo,color,parent,scale,pos);m.userData.noBatch=true;m.castShadow=true;return m;};
 const ball=(color,parent,scale,pos)=>part(v.sphere,color,parent,scale,pos);
 const box=(color,parent,scale,pos)=>part(v.box,color,parent,scale,pos);
 const cone=(color,parent,scale,pos,rot=[0,0,0])=>{const m=part(new T.ConeGeometry(1,1,10),color,parent,scale,pos);m.rotation.set(...rot);return m;};
 const suit=id.color,fur=id.accent||'#d6d8d4',dark='#18252a',white='#f2eee2';
 // Big rounded costume body, short padded legs and independently animated arms.
 ball(suit,root,[.62,.82,.48],[0,1.05,0]);box(white,root,[.42,.34,.5],[0,1.02,.34]);
 for(const x of [-.28,.28]){part(v.cylinder,dark,root,[.16,.58,.16],[x,.42,0]);ball(white,root,[.20,.13,.27],[x,.08,.1]);}
 const arms=[];for(const side of [-1,1]){const a=new T.Group();a.position.set(side*.56,1.52,0);a.userData.noBatch=true;root.add(a);part(v.cylinder,suit,a,[.15,.52,.15],[0,-.38,0]);ball(fur,a,[.19,.19,.19],[0,-.82,.04]);arms.push(a);}
 const head=new T.Group();head.position.set(0,2.05,0);head.userData.noBatch=true;root.add(head);ball(fur,head,[.62,.57,.52],[0,0,0]);
 const eye=(x,y=.12,z=.47)=>{ball(white,head,[.13,.16,.08],[x,y,z]);ball(dark,head,[.055,.075,.04],[x,y,z+.075]);};
 const ear=(x,y=.08)=>ball(fur,head,[.19,.23,.12],[x,y,0]);
 const muzzle=(scale=[.38,.22,.25],pos=[0,-.16,.45],color=white)=>ball(color,head,scale,pos);
 const beak=(color='#e6b84b',scale=[.23,.18,.42],pos=[0,-.08,.55])=>cone(color,head,scale,pos,[Math.PI/2,0,0]);
 let tail=null,wings=null;
 const form=id.form;
 if(form==='gorilla'){
  eye(-.2,.14);eye(.2,.14);muzzle([.4,.25,.27],[0,-.17,.46],'#a98a72');box(dark,head,[.38,.10,.08],[0,.31,.42]);arms.forEach(a=>a.scale.y=1.22);
 }else if(form==='dolphin'){
  eye(-.2,.14);eye(.2,.14);muzzle([.18,.12,.55],[0,-.08,.68],fur);cone(fur,head,[.2,.4,.26],[0,.48,-.08],[0,0,0]);
  tail=cone(fur,root,[.35,.6,.18],[0,1.0,-.48],[-Math.PI/2,0,0]);
 }else if(form==='bison'){
  eye(-.2,.12);eye(.2,.12);muzzle([.4,.25,.28],[0,-.18,.45],'#9b765d');ear(-.55,.16);ear(.55,.16);
  for(const side of [-1,1])cone('#e6d5ae',head,[.13,.38,.13],[side*.48,.35,.02],[0,0,side*.65]);box('#39291f',head,[.52,.22,.42],[0,.36,-.03]);
 }else if(['hawk','hunter-hawk','phoenix','owl','raven'].includes(form)){
  eye(-.19,.14);eye(.19,.14);beak(form==='raven'?'#24252b':'#e5b94f',form==='owl'?[.2,.18,.28]:[.22,.18,.42]);
  wings=arms;arms.forEach((a,i)=>{a.scale.set(1.35,.85,.55);a.rotation.z=(i?1:-1)*.2;});
  if(form==='phoenix')for(const x of [-.28,0,.28])cone('#ffd04b',head,[.12,.42,.12],[x,.54,-.08],[0,0,x*1.2]);
  if(form==='owl'){ear(-.43,.3);ear(.43,.3);box('#7c5738',head,[.5,.12,.08],[0,.3,.43]);}
  if(form==='raven'){head.scale.y=1.08;tail=cone('#202436',root,[.35,.72,.18],[0,.95,-.5],[-Math.PI/2,0,0]);}
  if(form==='hunter-hawk')box('#232326',head,[.55,.10,.38],[0,.47,0]);
 }else if(form==='dragon'){
  eye(-.2,.12);eye(.2,.12);muzzle([.4,.2,.32],[0,-.14,.48],fur);for(const side of [-1,1])cone('#e7c65b',head,[.12,.38,.12],[side*.3,.48,-.1],[0,0,side*.25]);
  for(let i=0;i<4;i++)cone('#e7c65b',root,[.12,.3,.12],[0,1.55-i*.34,-.48],[Math.PI/2,0,0]);tail=cone(fur,root,[.25,.9,.25],[0,.65,-.72],[-Math.PI/2,0,0]);
 }else if(form==='shark'){
  eye(-.21,.14);eye(.21,.14);muzzle([.42,.22,.38],[0,-.17,.42],white);cone(fur,head,[.2,.45,.25],[0,.52,-.08],[0,0,0]);tail=cone(fur,root,[.36,.65,.18],[0,.95,-.55],[-Math.PI/2,0,0]);
 }else if(form==='unicorn'){
  eye(-.2,.12);eye(.2,.12);muzzle([.3,.22,.36],[0,-.18,.5],white);ear(-.42,.28);ear(.42,.28);cone('#f2cf69',head,[.10,.58,.10],[0,.66,.05],[0,0,-.08]);
  for(let i=0;i<4;i++)ball('#d9a7ee',head,[.14,.2,.12],[-.35,.3-i*.12,-.22-i*.05]);tail=cone('#d9a7ee',root,[.25,.8,.2],[0,.72,-.63],[-Math.PI/2,0,0]);
 }else if(form==='arrow'){
  eye(-.19,.1);eye(.19,.1);muzzle();cone('#f2d2a5',head,[.19,.75,.19],[0,.72,0],[0,0,0]);box(dark,head,[.48,.09,.1],[0,.33,.43]);
 }else if(['jaguar','wolf'].includes(form)){
  eye(-.2,.12);eye(.2,.12);muzzle([.37,.23,.32],[0,-.17,.46],white);ear(-.43,.28);ear(.43,.28);tail=cone(fur,root,[.18,.8,.18],[0,.78,-.62],[-Math.PI/2,0,0]);
  if(form==='jaguar')for(const [x,y] of [[-.33,.2],[.34,.25],[-.25,-.2],[.25,-.15]])ball(dark,head,[.055,.045,.025],[x,y,.49]);
  else box(dark,head,[.36,.09,.07],[0,.29,.44]);
 }
 // Team mark on the chest reads at field-camera distance.
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#f6f0df';c.beginPath();c.arc(64,64,55,0,Math.PI*2);c.fill();c.fillStyle=suit;c.font='900 72px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(id.mark,64,70);
 const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;v.textures.push(tex);const badge=new T.Mesh(new T.PlaneGeometry(.52,.52),new T.MeshBasicMaterial({map:tex,transparent:true}));badge.position.set(0,1.12,.49);badge.userData.noBatch=true;root.add(badge);
 root.traverse(o=>o.userData.noBatch=true);
 return {root,head,arms,tail,wings,id,baseY:root.position.y};
}

export function updateTeamMascot(m,time,energy=0){
 if(!m)return;const cheer=Math.max(0,Math.min(1,energy));
 m.root.position.y=m.baseY+Math.abs(Math.sin(time*5.5))*cheer*.34;
 m.root.rotation.z=Math.sin(time*2.1)*.025+Math.sin(time*8)*cheer*.05;
 m.head.rotation.y=Math.sin(time*1.35)*.18;m.head.rotation.z=Math.sin(time*.9)*.04;
 m.arms[0].rotation.z=-.18-Math.sin(time*2.6)*.16-cheer*.7;
 m.arms[1].rotation.z=.45+Math.sin(time*3.8)*.48+cheer*.8;
 m.arms[1].rotation.x=Math.sin(time*2.2)*.18;
 if(m.wings){m.arms[0].rotation.z=-.45-Math.sin(time*4.5)*(.18+cheer*.3);m.arms[1].rotation.z=.45+Math.sin(time*4.5)*(.18+cheer*.3);}
 if(m.tail)m.tail.rotation.z=Math.sin(time*2.7)*.22;
}
