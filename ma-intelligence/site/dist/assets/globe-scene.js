import * as THREE from 'three';
import {GlobeNavigation,MIN_DISTANCE,MAX_DISTANCE} from './globe-navigation.js';
import {GLTFLoader} from './three/GLTFLoader.js';
import {geoVector,vectorGeo,arcSample,frontVisible,greatCircleAngle} from './globe-math.mjs';

const vec=coordinates=>new THREE.Vector3(...coordinates);
const up=new THREE.Vector3(0,1,0);
export function createGlobe(host,callbacks={}){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(42,1,.1,2200);
  camera.position.copy(vec(geoVector(25,-35,310)));
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'default'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.setClearColor(0x050914,0);
  host.appendChild(renderer.domElement);
  renderer.domElement.tabIndex=0;
  renderer.domElement.setAttribute('aria-label','3D-Erde: Ziehen zum Drehen, Mausrad oder zwei Finger zum Zoomen. Pfeiltasten drehen; Plus und Minus zoomen. Übernahmen sind auch in der Liste erreichbar.');
  const controls=new GlobeNavigation(camera,renderer.domElement,{
    onStart:()=>{flight=null;stopRotation();callbacks.onHover?.(null);},
    onHover:event=>{if(!event){callbacks.onHover?.(null);return;}const hit=pick(event,false);renderer.domElement.style.cursor=hit?'pointer':'grab';callbacks.onHover?.(hit?.deal||null,event.clientX,event.clientY);},
    onTap:event=>{const hit=pick(event,true);if(hit?.deal)callbacks.onDealClick?.(hit.deal.id);else if(hit?.companies)callbacks.onCompanyClick?.(hit.companies);}
  });
  controls.autoRotate=!reduced;
  scene.add(new THREE.AmbientLight(0xabc5ef,1.45));
  const sun=new THREE.DirectionalLight(0xfff8e9,2.0);
  sun.position.set(300,220,260);
  scene.add(sun);
  const earthMaterial=new THREE.MeshPhongMaterial({color:0xc5dcff,shininess:12,specular:0x1d354b});
  const earth=new THREE.Mesh(new THREE.SphereGeometry(100,96,64),earthMaterial);
  scene.add(earth);
  new GLTFLoader().load('/assets/earth-nasa.glb',gltf=>{
    const model=gltf.scene;
    // NASA asset: equatorial radius 500, Y north. Its -Z axis is Greenwich;
    // our geographic layer uses +X for Greenwich and -Z for 90 degrees east.
    model.scale.setScalar(.2);model.rotation.y=-Math.PI/2;
    model.traverse(object=>{if(object.isMesh){
      if(object.material.map)object.material.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      object.material.needsUpdate=true;
    }});
    scene.add(model);earth.visible=false;
    callbacks.onEarth?.('NASA Earth 3D');
  },undefined,()=>callbacks.onNotice?.('Das NASA-3D-Modell konnte nicht geladen werden. Als Ersatz wird das bisherige NASA-Satellitenmosaik angezeigt.'));
  new THREE.TextureLoader().load('/assets/earth-blue-marble.jpg',texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    earthMaterial.map=texture;earthMaterial.needsUpdate=true;
  },undefined,()=>callbacks.onNotice?.('Das Satellitenmosaik ist nicht verfügbar. Die Länderumrisse bleiben sichtbar.'));
  const atmosphereMaterial=new THREE.ShaderMaterial({
    uniforms:{glow:{value:new THREE.Color(0x65b9ff)}},
    vertexShader:'varying vec3 vNormal; varying vec3 vView; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',
    fragmentShader:'uniform vec3 glow;varying vec3 vNormal;varying vec3 vView;void main(){float i=pow(1.0-max(dot(normalize(vNormal),normalize(vView)),0.0),3.0);gl_FragColor=vec4(glow,i*0.55);}',
    transparent:true,depthWrite:false,blending:THREE.AdditiveBlending
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(102,80,56),atmosphereMaterial));
  const stars=[];let seed=731;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<1300;i++){const a=rand()*Math.PI*2,y=rand()*2-1,s=Math.sqrt(1-y*y),r=850+rand()*150;stars.push(r*s*Math.cos(a),r*y,r*s*Math.sin(a));}
  const starGeometry=new THREE.BufferGeometry();starGeometry.setAttribute('position',new THREE.Float32BufferAttribute(stars,3));
  const starMaterial=new THREE.PointsMaterial({color:0xd5e0fa,size:1.15,sizeAttenuation:false,transparent:true,opacity:.53,depthWrite:false});
  scene.add(new THREE.Points(starGeometry,starMaterial));
  fetch('/assets/world.json').then(r=>{if(!r.ok)throw new Error('world');return r.json();}).then(world=>{
    const features=globalThis.topojson.feature(world,world.objects.countries).features;
    const positions=[];
    function addRing(ring){for(let i=1;i<ring.length;i++){positions.push(...geoVector(ring[i-1][1],ring[i-1][0],100.08),...geoVector(ring[i][1],ring[i][0],100.08));}}
    features.forEach(f=>{const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;polygons.forEach(p=>p.forEach(addRing));});
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    scene.add(new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x8cb2c1,transparent:true,opacity:.18,depthWrite:false})));
  }).catch(()=>{});
  let companies=[],companyPoints=null,dealEntries=[],selected=null,flight=null,lastRender=0,lastFrame=0,paused=false;
  const dealGroup=new THREE.Group();scene.add(dealGroup);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  const size={width:1,height:1};
  let firstSize=true;
  function homeDistance(){const halfFov=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));return Math.min(580,Math.max(310,110/Math.sin(halfFov)));}
  function resize(){size.width=host.clientWidth;size.height=host.clientHeight;if(!size.width||!size.height)return;camera.aspect=size.width/size.height;camera.updateProjectionMatrix();renderer.setSize(size.width,size.height,false);if(firstSize){camera.position.copy(vec(geoVector(25,-35,homeDistance())));firstSize=false;}}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);resize();

  function stopRotation(){controls.autoRotate=false;callbacks.onRotation?.(false);}
  function setCompanies(records){
    companies=records;
    if(companyPoints){scene.remove(companyPoints);companyPoints.geometry.dispose();companyPoints.material.dispose();}
    const positions=records.flatMap(c=>geoVector(c.location.lat,c.location.lon,100.28));
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    const material=new THREE.PointsMaterial({color:0xc4d9e7,size:2.0,sizeAttenuation:false,transparent:true,opacity:.38,depthWrite:false});
    companyPoints=new THREE.Points(geometry,material);scene.add(companyPoints);
  }
  function filterDeals(ids){const allowed=new Set(ids);dealEntries.forEach(e=>e.group.visible=allowed.has(e.deal.id));}
  function setDeals(records,entities){
    for(const entry of dealEntries)entry.group.traverse(object=>{object.geometry?.dispose();object.material?.dispose();});
    dealGroup.clear();dealEntries=[];
    records.forEach((deal,index)=>{
      const buyer=entities[deal.buyerId],target=entities[deal.targetId];
      const group=new THREE.Group();
      const lift=(index%3)*2.4;
      const points=Array.from({length:101},(_,i)=>vec(arcSample(buyer,target,i/100,lift)));
      const curve=new THREE.CatmullRomCurve3(points);
      const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0xd6f391,transparent:true,opacity:.7,depthWrite:false}));
      line.userData.dealId=deal.id;
      group.add(line);
      const head=new THREE.Mesh(new THREE.ConeGeometry(1.05,3.35,10),new THREE.MeshBasicMaterial({color:0xe7ffae}));
      head.position.copy(curve.getPoint(.84));head.quaternion.setFromUnitVectors(up,curve.getTangent(.84).normalize());head.userData.dealId=deal.id;group.add(head);
      const flow=new THREE.Mesh(new THREE.SphereGeometry(.43,8,6),new THREE.MeshBasicMaterial({color:0xedffc1}));group.add(flow);
      const dots=[];
      for(const [entity,role,color] of [[buyer,'buyer',0xd6f391],[target,'target',0x85caff]]){
        const dot=new THREE.Mesh(new THREE.SphereGeometry(.85,12,8),new THREE.MeshBasicMaterial({color}));
        dot.position.copy(vec(geoVector(entity.lat,entity.lon,100.65)));dot.userData.dealId=deal.id;group.add(dot);dots.push(dot);
        const ring=new THREE.Mesh(new THREE.RingGeometry(1.35,1.65,28),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));
        ring.position.copy(vec(geoVector(entity.lat,entity.lon,100.7)));ring.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),ring.position.clone().normalize());group.add(ring);dots.push(ring);
      }
      dealEntries.push({deal,buyer,target,group,curve,line,head,flow,dots,index});dealGroup.add(group);
    });
  }
  function focusLocation(lat,lon,distance=250){
    stopRotation();const from=camera.position.clone();const to=vec(geoVector(lat,lon,Math.min(controls.maxDistance,Math.max(controls.minDistance,distance))));
    flight={from,to,started:performance.now(),duration:reduced?0:1050};
  }
  function selectDeal(id,focus=true){
    selected=dealEntries.find(e=>e.deal.id===id)||null;
    dealEntries.forEach(e=>{const active=e===selected;e.line.material.opacity=selected?(active?1:.15):.7;e.head.material.color.set(active?0xf2ffcc:0xd6f391);e.head.material.transparent=true;e.head.material.opacity=selected&&!active ? .22 : 1;e.flow.visible=!selected||active;e.dots.forEach(dot=>{dot.material.transparent=true;dot.material.opacity=selected&&!active ? .22 : 1;});});
    if(selected&&focus){const center=vectorGeo(arcSample(selected.buyer,selected.target,.5));const angle=greatCircleAngle(selected.buyer,selected.target);focusLocation(center.lat,center.lon,Math.max(145,Math.min(325,155+angle*120))*Math.max(1,.9/camera.aspect));}
  }
  function home(){camera.up.set(0,1,0);controls.update();selectDeal(null,false);focusLocation(25,-35,homeDistance());}
  function zoom(factor){stopRotation();flight=null;controls.zoom(factor);}
  function toggleRotation(){flight=null;controls.autoRotate=!controls.autoRotate;callbacks.onRotation?.(controls.autoRotate);return controls.autoRotate;}
  const canvas=renderer.domElement;
  function pick(event,includeCompanies){
    const rect=canvas.getBoundingClientRect();pointer.x=(event.clientX-rect.left)/rect.width*2-1;pointer.y=-(event.clientY-rect.top)/rect.height*2+1;
    raycaster.setFromCamera(pointer,camera);
    const groundPoint=raycaster.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(),100),new THREE.Vector3());
    const ground=groundPoint?{distance:camera.position.distanceTo(groundPoint)}:null;
    const threshold=(camera.position.length()-100)*Math.tan(camera.fov*Math.PI/360)*2/size.height*(event.pointerType==='touch'?13:8);
    raycaster.params.Line.threshold=Math.max(.025,threshold);
    const candidates=dealEntries.filter(e=>e.group.visible).flatMap(e=>[e.line,e.head,...e.dots]);
    const found=raycaster.intersectObjects(candidates).find(h=>h.object.userData.dealId&&(!ground||h.distance<ground.distance+1));
    if(found)return {deal:dealEntries.find(e=>e.deal.id===found.object.userData.dealId).deal};
    if(!includeCompanies||!companyPoints?.visible)return null;
    raycaster.params.Points.threshold=Math.max(.02,threshold);
    const hits=raycaster.intersectObject(companyPoints).filter(h=>!ground||h.distance<ground.distance+1).sort((a,b)=>(a.distanceToRay??0)-(b.distanceToRay??0));
    if(!hits.length)return null;
    const c=companies[hits[0].index],l=c.location;
    const colocated=companies.filter(x=>Math.abs(x.location.lat-l.lat)<.001&&Math.abs(x.location.lon-l.lon)<.001);
    return {companies:colocated};
  }
  canvas.addEventListener('keydown',event=>{
    const step=Math.max(.12,Math.min(8,(camera.position.length()-100)*.035));
    const direction={ArrowLeft:[0,-step],ArrowRight:[0,step],ArrowUp:[step,0],ArrowDown:[-step,0]}[event.key];
    if(direction){event.preventDefault();const p=vectorGeo(camera.position.toArray());focusLocation(Math.max(-85,Math.min(85,p.lat+direction[0])),p.lon+direction[1],camera.position.length());}
    if(['+','='].includes(event.key)){event.preventDefault();zoom(.85);}
    if(event.key==='-'){event.preventDefault();zoom(1.18);}
  });
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();paused=true;callbacks.onError?.('Die 3D-Darstellung wurde vom Gerät unterbrochen. Lade die Seite neu oder nutze die 2D-Karte.');});
  let frame;
  function animate(time){
    frame=requestAnimationFrame(animate);
    if(document.hidden||paused)return;
    const dt=Math.min(.05,(time-lastFrame)/1000||.016);lastFrame=time;
    if(flight){const t=flight.duration?Math.min(1,(time-flight.started)/flight.duration):1;const ease=1-Math.pow(1-t,3);const fromDirection=flight.from.clone().normalize(),toDirection=flight.to.clone().normalize();const quaternion=new THREE.Quaternion().setFromUnitVectors(fromDirection,toDirection);const rotation=new THREE.Quaternion().slerp(quaternion,ease);camera.position.copy(fromDirection.applyQuaternion(rotation)).multiplyScalar(THREE.MathUtils.lerp(flight.from.length(),flight.to.length(),ease));if(t===1)flight=null;}
    controls.update(dt);
    if(time-lastRender<1000/30)return;
    lastRender=time;
    const distance=camera.position.length();
    const visualScale=Math.max(.008,Math.min(1.5,Math.pow((distance-100)/210,1.1)));
    if(companyPoints)companyPoints.material.size=distance<155?1.75:2;
    for(const entry of dealEntries){
      entry.head.scale.setScalar(visualScale);entry.flow.scale.setScalar(visualScale);entry.dots.forEach(dot=>dot.scale.setScalar(visualScale));
      entry.flow.position.copy(entry.curve.getPoint(reduced ? .6 : (time/8500+entry.index*.173)%1));
    }
    if(selected){
      const projected=[['buyer',selected.buyer],['target',selected.target]].map(([role,entity])=>{const position=geoVector(entity.lat,entity.lon,100.8);const p=vec(position).project(camera);return {role,entity,x:(p.x+1)*size.width/2,y:(1-p.y)*size.height/2,visible:frontVisible(position,camera.position.toArray())&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1};});
      callbacks.onLabels?.(projected);
    }else callbacks.onLabels?.([]);
    callbacks.onView?.(distance);
    renderer.render(scene,camera);
  }
  frame=requestAnimationFrame(animate);
  return {setCompanies,setDeals,filterDeals,selectDeal,focusLocation,home,zoom,toggleRotation,showCompanies:visible=>{if(companyPoints)companyPoints.visible=visible;},isRotating:()=>controls.autoRotate,dispose:()=>{cancelAnimationFrame(frame);resizeObserver.disconnect();controls.dispose();scene.traverse(o=>{o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();});renderer.dispose();}};
}
