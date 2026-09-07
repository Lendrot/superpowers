export const RADIUS=100;
const rad=Math.PI/180;
export function geoVector(lat,lon,r=RADIUS){return [r*Math.cos(lat*rad)*Math.cos(lon*rad),r*Math.sin(lat*rad),-r*Math.cos(lat*rad)*Math.sin(lon*rad)];}
export function vectorGeo([x,y,z]){const r=Math.hypot(x,y,z);return {lat:Math.asin(Math.max(-1,Math.min(1,y/r)))/rad,lon:Math.atan2(-z,x)/rad};}
export function greatCircleAngle(a,b){const u=geoVector(a.lat,a.lon,1),v=geoVector(b.lat,b.lon,1);return Math.acos(Math.max(-1,Math.min(1,u.reduce((s,n,i)=>s+n*v[i],0))));}
export function arcSample(a,b,t,lift=0){
  const u=geoVector(a.lat,a.lon,1),v=geoVector(b.lat,b.lon,1);
  const omega=greatCircleAngle(a,b);
  let p;
  if(omega<1e-7)p=u.map((n,i)=>(1-t)*n+t*v[i]);
  else if(Math.PI-omega<1e-5){const axis=Math.abs(u[1])<.9?[0,1,0]:[1,0,0];const dot=u.reduce((s,n,i)=>s+n*axis[i],0);let normal=axis.map((n,i)=>n-dot*u[i]);const length=Math.hypot(...normal);normal=normal.map(n=>n/length);p=u.map((n,i)=>n*Math.cos(Math.PI*t)+normal[i]*Math.sin(Math.PI*t));}
  else{const f=Math.sin((1-t)*omega)/Math.sin(omega),g=Math.sin(t*omega)/Math.sin(omega);p=u.map((n,i)=>n*f+v[i]*g);}
  // A small visual loop keeps very local acquisitions readable. Endpoints
  // remain their source coordinates; the arc is an abstract relationship.
  if(omega<.003){
    let side=[-u[2],0,u[0]];
    const sideLength=Math.hypot(...side);
    side=sideLength<1e-6?[1,0,0]:side.map(n=>n/sideLength);
    const spread=.025*(1-omega/.003)*Math.sin(2*Math.PI*t);
    p=p.map((n,i)=>n+side[i]*spread);
  }
  const h=Math.max(6,Math.min(44,omega*23))+lift;
  const r=RADIUS+.55+Math.sin(Math.PI*t)*h;
  const length=Math.hypot(...p);
  return p.map(n=>n/length*r);
}
export function frontVisible(position,camera){const delta=position.map((n,i)=>camera[i]-n);return position.reduce((s,n,i)=>s+n*delta[i],0)>0;}
export const displayDate=date=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
