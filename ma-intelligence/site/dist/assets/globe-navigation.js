import * as THREE from 'three';

const origin=new THREE.Vector3();
const surface=new THREE.Sphere(origin,100);
export const MIN_DISTANCE=101.5;
export const MAX_DISTANCE=590;
export function zoomDistance(distance,factor){return THREE.MathUtils.clamp(100+(distance-100)*factor,MIN_DISTANCE,MAX_DISTANCE);}

// Rotate the camera around the fixed Earth. Rays intersect its surface, so
// a finger moves a local place by the same screen distance at every altitude.
export class GlobeNavigation {
  constructor(camera,canvas,events={}){
    this.camera=camera;this.canvas=canvas;this.events=events;
    this.minDistance=MIN_DISTANCE;this.maxDistance=MAX_DISTANCE;
    this.autoRotate=false;this.points=new Map();this.tap=null;this.multi=false;
    this.ray=new THREE.Raycaster();this.listeners=[];
    this.listen('pointerdown',e=>this.down(e));
    this.listen('pointermove',e=>this.move(e));
    this.listen('pointerup',e=>this.end(e,false));
    this.listen('pointercancel',e=>this.end(e,true));
    this.listen('lostpointercapture',e=>this.end(e,true));
    this.listen('pointerleave',()=>events.onHover?.(null));
    this.listen('wheel',e=>{e.preventDefault();events.onStart?.();const unit=e.deltaMode===1?16:e.deltaMode===2?canvas.clientHeight:1;this.zoom(Math.exp(THREE.MathUtils.clamp(e.deltaY*unit,-180,180)*.002),{x:e.clientX,y:e.clientY});},{passive:false});
    this.update();
  }
  listen(type,fn,options){this.canvas.addEventListener(type,fn,options);this.listeners.push([type,fn,options]);}
  update(dt=0){
    if(this.autoRotate&&!this.points.size){const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),dt*.012);this.camera.position.applyQuaternion(q);this.camera.up.applyQuaternion(q);}
    this.camera.lookAt(origin);this.camera.updateMatrixWorld();
  }
  hit(point){
    const r=this.canvas.getBoundingClientRect();
    if(!r.width||!r.height)return null;
    this.update();
    this.ray.setFromCamera(new THREE.Vector2((point.x-r.left)/r.width*2-1,1-(point.y-r.top)/r.height*2),this.camera);
    return this.ray.ray.intersectSphere(surface,new THREE.Vector3());
  }
  align(anchor,point){
    if(!anchor)return false;
    const after=this.hit(point);if(!after)return false;
    const q=new THREE.Quaternion().setFromUnitVectors(after.normalize(),anchor.clone().normalize());
    this.camera.position.applyQuaternion(q);this.camera.up.applyQuaternion(q);this.update();return true;
  }
  drag(from,to){
    if(this.align(this.hit(from),to))return;
    // Grabbing empty space or crossing the limb: bounded tangent rotation.
    const rate=2*Math.tan(this.camera.fov*Math.PI/360)*(this.camera.position.length()-100)/100/Math.max(1,this.canvas.clientHeight);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion);
    const vertical=new THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion);
    const q=new THREE.Quaternion().setFromAxisAngle(vertical,THREE.MathUtils.clamp(-(to.x-from.x)*rate,-.12,.12));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(right,THREE.MathUtils.clamp(-(to.y-from.y)*rate,-.12,.12)));
    this.camera.position.applyQuaternion(q);this.camera.up.applyQuaternion(q);this.update();
  }
  zoom(factor,point){
    const anchor=point?this.hit(point):null;
    this.camera.position.setLength(zoomDistance(this.camera.position.length(),factor));this.update();
    if(point)this.align(anchor,point);
  }
  state(){
    const p=[...this.points.values()].slice(0,2);
    return {center:{x:p.reduce((n,v)=>n+v.x,0)/p.length,y:p.reduce((n,v)=>n+v.y,0)/p.length},span:p.length===2?Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y):0};
  }
  down(e){
    if(e.pointerType==='mouse'&&e.button!==0)return;
    this.events.onStart?.();
    const point={x:e.clientX,y:e.clientY};
    if(!this.points.size){this.multi=false;this.tap={...point,started:e.timeStamp,moved:false};}
    this.points.set(e.pointerId,point);if(this.points.size>1)this.multi=true;
    this.canvas.setPointerCapture?.(e.pointerId);this.canvas.style.cursor='grabbing';
  }
  move(e){
    if(!this.points.has(e.pointerId)){if(e.pointerType==='mouse')this.events.onHover?.(e);return;}
    const before=this.state(),point={x:e.clientX,y:e.clientY};
    if(this.tap&&Math.hypot(point.x-this.tap.x,point.y-this.tap.y)>6)this.tap.moved=true;
    this.points.set(e.pointerId,point);const after=this.state();
    if(this.points.size>2)return;
    if(this.points.size===1){this.drag(before.center,after.center);return;}
    const anchor=this.hit(before.center);
    if(before.span>8&&after.span>8)this.zoom(THREE.MathUtils.clamp(before.span/after.span,.7,1.4));
    if(!this.align(anchor,after.center))this.drag(before.center,after.center);
  }
  end(e,cancelled){
    if(!this.points.has(e.pointerId))return;
    const tap=!cancelled&&!this.multi&&this.points.size===1&&this.tap&&!this.tap.moved&&e.timeStamp-this.tap.started<650&&Math.hypot(e.clientX-this.tap.x,e.clientY-this.tap.y)<=6;
    this.points.delete(e.pointerId);
    if(this.canvas.hasPointerCapture?.(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
    // Remaining fingers start from their current positions; never reinterpret
    // the end of a pinch as a click or apply stale one-finger coordinates.
    if(!this.points.size){this.tap=null;this.multi=false;this.canvas.style.cursor='grab';}
    if(tap)this.events.onTap?.(e);
  }
  dispose(){for(const [t,f,o] of this.listeners)this.canvas.removeEventListener(t,f,o);this.points.clear();}
}
