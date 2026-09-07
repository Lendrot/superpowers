import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=new URL('../dist/assets/',import.meta.url);
const moduleUrl=new URL('three/three.module.min.js',root).href;
const THREE=await import(moduleUrl);
const source=fs.readFileSync(new URL('globe-navigation.js',root),'utf8').replace("'three'",JSON.stringify(moduleUrl));
const {GlobeNavigation,zoomDistance}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let taps=0;
const canvas={clientHeight:800,style:{},addEventListener(){},removeEventListener(){},getBoundingClientRect(){return {left:0,top:0,width:1000,height:800}},setPointerCapture(){},hasPointerCapture(){return false}};
const camera=new THREE.PerspectiveCamera(42,1.25,.1,2200);
const nav=new GlobeNavigation(camera,canvas,{onTap:()=>taps++});
function screen(v){const p=v.clone().project(camera);return {x:(p.x+1)*500,y:(1-p.y)*400}}
for(const d of [590,310,110,101.5]){
 camera.position.set(0,0,d);camera.up.set(0,1,0);nav.update();
 const from={x:500,y:400},to={x:525,y:414};const anchor=nav.hit(from);nav.drag(from,to);const p=screen(anchor);
 assert(Math.hypot(p.x-to.x,p.y-to.y)<.01,`drag ${d}`);
 const point={x:530,y:415},zanchor=nav.hit(point);nav.zoom(.85,point);const z=screen(zanchor);assert(Math.hypot(z.x-point.x,z.y-point.y)<.01,`zoom ${d}`);
}
assert.equal(zoomDistance(101.5,.1),101.5);assert.equal(zoomDistance(590,10),590);
const ev=(id,x,y,t=0)=>({pointerId:id,clientX:x,clientY:y,pointerType:'touch',timeStamp:t});
camera.position.set(0,0,110);nav.update();nav.down(ev(1,450,400));nav.down(ev(2,550,400));nav.move(ev(2,580,400,100));nav.end(ev(2,580,400,150),false);const before=camera.position.clone();nav.move(ev(1,450,400,160));assert(before.distanceTo(camera.position)<1e-8);nav.end(ev(1,450,400,180),false);assert.equal(taps,0);
nav.down(ev(3,500,400,200));nav.end(ev(3,500,400,250),false);assert.equal(taps,1);
console.log('PASS: surface-grab and cursor zoom at four distances; limits; pinch-to-drag continuity; click isolation');
