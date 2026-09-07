import {formatNumber as fmt, pinSize, clusterSize, clusterRadius, zoomLabel, escapeHtml as esc, inBounds} from './map-logic.mjs';

const globe = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6.5h14M5 17.5h14"/></svg>';
const arrow = '<svg viewBox="0 0 30 36" aria-hidden="true"><path d="M10 2h10v17h9L15 35 1 19h9Z"/></svg>';
const plus = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const minus = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>';
const close = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
const external = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4 10 14M11 5H5v14h14v-6"/></svg>';
const info = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/></svg>';
const app = document.getElementById('app');
app.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-icon">${arrow}</span>marktatlas<span class="brand-dot">.</span></div>
    <div class="header-context">Unternehmen auf der Weltkarte</div>
    <div class="header-actions"><a href="/deutschland/" class="text-button" style="text-decoration:none;margin:0" aria-label="Deutschland-M&amp;A-Karte öffnen">DE</a><a href="/" class="text-button" style="text-decoration:none;margin:0" aria-label="3D-Globus öffnen">3D</a><span class="year-tag">Fokus <b>2026</b></span><button class="sources-button" id="sources-button">${info}<span>Daten & Quellen</span></button></div>
  </header>
  <div class="workspace">
    <aside class="sidebar">
      <div class="overview">
        <p class="eyebrow">Eine geografische Perspektive</p>
        <h1>Die Welt der<br><em>Unternehmen.</em></h1>
        <p class="intro">Vom globalen Überblick bis zum einzelnen Unternehmenssitz.</p>
        <div class="statistics" aria-live="polite">
          <div><strong id="company-count">—</strong><span>Unternehmen erfasst</span></div>
          <div><strong id="country-count">—</strong><span>Länder / Gebiete</span></div>
        </div>
      </div>
      <div class="map-guide">
        <p class="eyebrow">Mit jedem Zoom mehr entdecken</p>
        <div class="zoom-illustration" aria-hidden="true"><span class="sample-cluster">128</span><i></i><span class="sample-cluster medium">12</span><i></i><span class="sample-arrow">${arrow}</span></div>
        <div class="guide-row"><span class="guide-number">01</span><p><strong>Eine Region öffnen</strong>Zahl anklicken oder hineinzoomen. Die Bündel teilen sich auf.</p></div>
        <div class="guide-row"><span class="guide-number">02</span><p><strong>Ein Unternehmen entdecken</strong>Kleinere Pfeile zeigen einzelne Standorte. Antippen öffnet die Details.</p></div>
      </div>
      <div class="sidebar-bottom"><div class="coverage-label"><span class="coverage-icon">◐</span> Offene Daten · Teilabdeckung</div><p>Keine vollständige, für 2026 bestätigte Börsenliste.</p><button id="coverage-button" class="text-button">Datenabdeckung ansehen <span aria-hidden="true">↗</span></button></div>
    </aside>
    <section class="map-area" aria-label="Weltkarte erkunden">
      <div id="map" aria-label="Karte. Mit Pfeiltasten verschieben, mit Plus und Minus zoomen."></div>
      <div class="map-topline"><div class="view-tag">${globe}<span id="view-label">Weltansicht</span></div><div class="visible-count"><span id="visible-count">—</span> im Ausschnitt</div></div>
      <div class="map-status" id="map-status" role="status"><span class="loading-ring"></span>Unternehmensstandorte werden geladen …</div>
      <div class="map-notice" id="map-notice" role="status" hidden></div>
      <div class="map-legend"><span class="legend-arrow">${arrow}</span><span>Unternehmenssitz</span><span class="legend-divider"></span><span class="legend-number">12</span><span>Anzahl im Bündel</span></div>
      <div class="zoom-controls"><button id="zoom-in" title="Hineinzoomen" aria-label="Hineinzoomen">${plus}</button><button id="zoom-out" title="Herauszoomen" aria-label="Herauszoomen">${minus}</button><span></span><button id="reset-map" title="Zur Weltansicht" aria-label="Zur Weltansicht">${globe}</button></div>
      <div class="scale-journey"><span class="active" data-stage="0">Welt</span><i></i><span data-stage="1">Region</span><i></i><span data-stage="2">Stadt</span><i></i><span data-stage="3">Standort</span></div>
      <div class="map-hint" id="map-hint">Hineinzoomen. Zusammenhänge entdecken.</div>
    </section>
    <section class="detail-panel" id="detail-panel" aria-label="Unternehmensdetails" hidden tabindex="-1"></section>
  </div>
  <footer class="app-footer"><span><span class="footer-label">DATENBASIS</span> Wikidata · Abruf 05.09.2026</span><span>Standorte teils nur ortsgenau · Börsenstatus 2026 nicht vollständig geprüft</span></footer>
  <dialog id="sources-dialog" aria-labelledby="sources-title"><div class="dialog-heading"><span class="eyebrow">Daten & Quellen</span><button id="close-sources" class="icon-button" aria-label="Dateninformationen schließen">${close}</button></div><h2 id="sources-title">Was diese Karte zeigt.</h2><p class="dialog-lead"><b id="dialog-count">—</b> Unternehmen mit Börseneintrag und verortbarem Hauptsitz aus Wikidata. Abgerufen am 5. September 2026.</p><div class="data-note"><strong>Das Ziel: alle 2026 gehandelten Unternehmen.</strong><p>Dieser offene Datenbestand erreicht dieses Ziel noch nicht. Er ist keine vollständige oder durchgehend für 2026 verifizierte Börsenliste. Börsengänge, Delistings und kleine Unternehmen können fehlen oder veraltet erfasst sein.</p></div><dl class="source-details"><div><dt>Auswahl für 2026</dt><dd>Börseneinträge ohne erfasstes Ende vor dem 1. Januar 2026 oder erfassten Beginn nach dem 5. September 2026. Fehlende Datumsangaben belegen keinen Handel im Jahr 2026.</dd></div><div><dt>Standorte</dt><dd>Koordinaten des Hauptsitzes, soweit vorhanden. Andernfalls wird der in der Quelle angegebene Ort verwendet. Hineinzoomen erhöht die Darstellungsdichte, nicht die Genauigkeit der Quelldaten.</dd></div><div><dt>Unternehmen zählen</dt><dd>Ein Punkt je Wikidata-Unternehmenseintrag, auch bei mehreren Börsennotierungen. Bei mehreren Hauptsitzen wird ein belegter Standort angezeigt; weitere stehen in den Details. Juristisch getrennte Gesellschaften können separat vorkommen.</dd></div><div><dt>Gleicher Standort</dt><dd>Ein Bündel zeigt die Anzahl enthaltener Unternehmen. Am selben Ort öffnet sich eine Liste; kleine Gruppen lassen sich mit Verbindungslinien auffächern. Aufgefächerte Pfeile sind keine zusätzlichen Standorte.</dd></div><div><dt>Bedeutung der Pfeile</dt><dd>Die Pfeile markieren Orte. Farbe und Richtung geben keine Kursentwicklung oder Kaufempfehlung an.</dd></div></dl><div class="source-links"><a href="https://www.wikidata.org/" target="_blank" rel="noopener noreferrer">Unternehmensdaten · Wikidata (CC0) ${external}</a><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener noreferrer">Länderumrisse · Natural Earth ${external}</a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">Kartendetails · OpenStreetMap ${external}</a><a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer">Basiskarte · CARTO ${external}</a></div></dialog>`;

let companies = [], markersById = new Map(), clusters, selectedId, selectedMarker, currentGroup = null;
let dataReady = false, lastFocusedElement = null;
const detail = document.getElementById('detail-panel');
const dialog = document.getElementById('sources-dialog');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const map = L.map('map', {zoomControl:false, minZoom:0.5, maxZoom:16, zoomSnap:0.25, zoomDelta:1, worldCopyJump:false, maxBounds:[[-85,-200],[85,200]], maxBoundsViscosity:0.9, preferCanvas:true, zoomAnimation:!reducedMotion, fadeAnimation:!reducedMotion, markerZoomAnimation:!reducedMotion});
map.attributionControl.setPrefix(false);
map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>');
map.createPane('countries');
map.getPane('countries').style.zIndex = 150;
map.getPane('countries').style.pointerEvents = 'none';
map.createPane('grid');
map.getPane('grid').style.zIndex = 160;
map.getPane('grid').style.pointerEvents = 'none';
for(let lng=-180; lng<=180; lng+=30) L.polyline([[-80,lng],[80,lng]],{pane:'grid',color:'#587074',weight:0.6,opacity:0.12,interactive:false}).addTo(map);
for(let lat=-60; lat<=75; lat+=30) L.polyline([[lat,-180],[lat,180]],{pane:'grid',color:'#587074',weight:0.6,opacity:0.12,interactive:false}).addTo(map);
const tiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>', subdomains:'abcd', maxZoom:16, noWrap:true, opacity:0.78, bounds:[[-85,-180],[85,180]]}).addTo(map);
let tileErrors = 0, tileSuccess = 0;
tiles.on('tileerror',()=>{tileErrors++; if(tileErrors>=5 && !tileSuccess) showNotice('Kartendetails nicht erreichbar. Die Länderkarte und Unternehmensdaten bleiben nutzbar.');});
tiles.on('tileload',()=>{tileSuccess++; if(tileSuccess>5 && document.getElementById('map-notice').textContent.startsWith('Kartendetails')) document.getElementById('map-notice').hidden=true;});
const scale = L.control.scale({position:'bottomleft',imperial:false,maxWidth:110}).addTo(map);

function resetMap(){
  closeDetail(false);
  map.fitBounds([[-56,-172],[73,179]], {padding:[20,40], animate:false});
}
resetMap();
document.getElementById('zoom-in').addEventListener('click',()=>map.zoomIn());
document.getElementById('zoom-out').addEventListener('click',()=>map.zoomOut());
document.getElementById('reset-map').addEventListener('click',resetMap);
function showSources(){lastFocusedElement=document.activeElement; dialog.showModal();}
document.getElementById('sources-button').addEventListener('click',showSources);
document.getElementById('coverage-button').addEventListener('click',showSources);
document.getElementById('close-sources').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>lastFocusedElement?.focus());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) dialog.close();}});

function showNotice(message){const notice=document.getElementById('map-notice'); notice.textContent=message; notice.hidden=false;}
function markActive(marker){
  selectedMarker?.getElement()?.classList.remove('is-selected');
  selectedMarker=marker;
  marker?.getElement()?.classList.add('is-selected');
}
function closeDetail(restoreFocus=true){
  if(detail.hidden)return;
  detail.hidden=true;
  selectedId=null;
  markActive(null);
  currentGroup=null;
  clusters?.unspiderfy();
  document.querySelector('.workspace').classList.remove('has-detail');
  if(restoreFocus) document.getElementById('map').focus({preventScroll:true});
}
function showPanel(html){
  detail.innerHTML=html;
  detail.hidden=false;
  document.querySelector('.workspace').classList.add('has-detail');
  detail.querySelector('[data-close]')?.addEventListener('click',()=>closeDetail());
  detail.scrollTop=0;
  detail.focus({preventScroll:true});
}
function openCompany(company,fromGroup=false){
  selectedId=company.id;
  const location=company.location;
  if(!fromGroup)currentGroup=null;
  markActive(markersById.get(company.id));
  const precision=location.accuracy==='headquarters'?'Hauptsitz-Koordinate aus der Quelle':'Ortskoordinate · nicht gebäudegenau';
  const locationRows=company.locations.filter((l,i,list)=>list.findIndex(x=>x.id===l.id)===i);
  showPanel(`<div class="detail-header"><span class="eyebrow">Unternehmen</span><button data-close class="icon-button" aria-label="Unternehmensdetails schließen">${close}</button></div>${fromGroup?'<button class="text-button back-group" id="back-group">← Zur Standortliste</button>':''}<div class="company-monogram" aria-hidden="true">${esc(company.name.slice(0,2).toUpperCase())}</div><h2>${esc(company.name)}</h2><div class="company-location">${esc(location.name)}${location.country?' · '+esc(location.country):''}</div><div class="detail-divider"></div><p class="eyebrow">Börseneinträge laut Quelle</p><div class="listing-list">${company.listings.map(l=>`<div class="listing-row"><span>${esc(l.exchange)}</span><b>${esc(l.ticker||'—')}</b></div>`).join('')}</div><div class="detail-divider"></div><p class="eyebrow">Angezeigter Hauptsitz</p><p class="location-name">${esc(location.name)}</p><p class="coordinate">${Math.abs(location.lat).toFixed(4)}° ${location.lat>=0?'N':'S'} &nbsp; ${Math.abs(location.lon).toFixed(4)}° ${location.lon>=0?'O':'W'}</p><div class="precision-label">${info}<span>${precision}</span></div>${locationRows.length>1?`<div class="other-locations"><b>Weitere Hauptsitze in der Quelle</b><p>${locationRows.filter(l=>l.id!==location.id).map(l=>esc(l.name)).join(' · ')}</p></div>`:''}<a class="primary-link" href="https://www.wikidata.org/wiki/${esc(company.id)}" target="_blank" rel="noopener noreferrer">Datensatz prüfen ${external}</a><p class="detail-caveat">Börsenstatus und Handelbarkeit 2026 sind nicht abschließend bestätigt.</p>`);
  document.getElementById('back-group')?.addEventListener('click',()=>currentGroup&&openGroup(currentGroup,false));
}
function openGroup(group,allowFan=true){
  const records=group.getAllChildMarkers().map(m=>m.options.company).sort((a,b)=>a.name.localeCompare(b.name,'de'));
  currentGroup=group;
  selectedId=null;
  markActive(null);
  const places=new Set(records.map(c=>c.location.name));
  const title=places.size===1?records[0].location.name:'Unternehmen in diesem Bereich';
  if(allowFan && records.length<=14)group.spiderfy();
  showPanel(`<div class="detail-header"><span class="eyebrow">Standortliste</span><button data-close class="icon-button" aria-label="Standortliste schließen">${close}</button></div><h2 class="group-title">${esc(title)}</h2><p class="group-description">${fmt(records.length)} Unternehmen${places.size===1?' am selben erfassten Ort':''}.</p><p class="group-note">Gemeinsame Ortskoordinaten können mehrere Unternehmen bündeln. Wähle einen Eintrag aus.</p><div class="company-list">${records.map(c=>`<button class="company-row" data-company="${esc(c.id)}"><span><strong>${esc(c.name)}</strong><small>${esc(c.listings.find(l=>l.ticker)?.ticker||c.location.country||'Wikidata')}</small></span><span class="row-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>`);
  detail.querySelectorAll('[data-company]').forEach(button=>button.addEventListener('click',()=>{const c=markersById.get(button.dataset.company)?.options.company;if(c)openCompany(c,true);}));
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open)closeDetail();});

function updateView(){
  const zoom=map.getZoom();
  const root=document.documentElement;
  root.style.setProperty('--pin-size',`${pinSize(zoom)}px`);
  root.style.setProperty('--cluster-size',`${clusterSize(zoom)}px`);
  document.getElementById('view-label').textContent=zoomLabel(zoom);
  document.getElementById('zoom-in').disabled=zoom>=map.getMaxZoom();
  document.getElementById('zoom-out').disabled=zoom<=map.getMinZoom();
  const stage=zoom<3?0:zoom<6?1:zoom<10?2:3;
  document.querySelectorAll('[data-stage]').forEach(el=>el.classList.toggle('active',Number(el.dataset.stage)===stage));
  if(dataReady){
    const b=map.getBounds();
    const bounds={south:b.getSouth(),north:b.getNorth(),west:b.getWest(),east:b.getEast()};
    const count=companies.reduce((n,c)=>n+Number(inBounds(c.location,bounds)),0);
    document.getElementById('visible-count').textContent=fmt(count);
    document.getElementById('map-hint').textContent=count===0?'Keine erfassten Unternehmen in diesem Ausschnitt.':zoom>=10?'Gleicher Ort? Bündel öffnen und Unternehmen auswählen.':zoom>=5?'Kleinere Pfeile. Mehr einzelne Unternehmen.':'Hineinzoomen. Zusammenhänge entdecken.';
  }
  if(selectedMarker)selectedMarker.getElement()?.classList.add('is-selected');
  document.querySelectorAll('.cluster-marker').forEach(el=>{const n=el.querySelector('[data-count]')?.dataset.count; if(n)el.setAttribute('aria-label',`${fmt(Number(n))} Unternehmen. Region öffnen.`);});
}
map.on('zoomend moveend',updateView);
map.on('click',e=>{if(!e.originalEvent?.target?.closest('.leaflet-marker-icon'))closeDetail(false);});
const resizeObserver=new ResizeObserver(()=>{map.invalidateSize({pan:false});});
resizeObserver.observe(document.querySelector('.map-area'));

async function loadWorld(){
  try{
    const response=await fetch('/assets/world.json');
    if(!response.ok)throw new Error('world');
    const world=await response.json();
    L.geoJSON(topojson.feature(world,world.objects.countries),{pane:'countries',style:{fillColor:'#203236',fillOpacity:1,color:'#486065',weight:0.65,opacity:0.65},interactive:false}).addTo(map);
  }catch{showNotice('Die Länderumrisse konnten nicht geladen werden. Kartendetails werden online angefordert.');}
}
async function loadCompanies(){
  const status=document.getElementById('map-status');
  status.hidden=false;
  try{
    const response=await fetch('/assets/companies.json');
    if(!response.ok)throw new Error('data');
    const data=await response.json();
    companies=data.companies;
    if(!Array.isArray(companies)||!companies.length)throw new Error('empty');
    document.getElementById('company-count').textContent=fmt(companies.length);
    document.getElementById('country-count').textContent=fmt(data.meta.countryCount);
    document.getElementById('dialog-count').textContent=fmt(companies.length);
    clusters=L.markerClusterGroup({maxClusterRadius:clusterRadius,showCoverageOnHover:false,zoomToBoundsOnClick:false,spiderfyOnMaxZoom:false,removeOutsideVisibleBounds:true,animate:!reducedMotion,chunkedLoading:true,chunkInterval:100,chunkDelay:20,spiderfyDistanceMultiplier:1.5,spiderLegPolylineOptions:{weight:1.2,color:'#d5ee88',opacity:0.65,dashArray:'3 4'},iconCreateFunction:cluster=>{
      const n=cluster.getChildCount();
      return L.divIcon({html:`<span class="cluster-body ${n>=500?'is-dense':''}" data-count="${n}"><span>${fmt(n)}</span><svg viewBox="0 0 20 10" aria-hidden="true"><path d="m0 0 10 10L20 0Z"/></svg></span>`,className:'cluster-marker',iconSize:[56,64],iconAnchor:[28,60]});
    },chunkProgress:(processed,total)=>{if(processed===total){dataReady=true;status.hidden=true;updateView();}}});
    const markers=companies.map(company=>{
      const l=company.location;
      const marker=L.marker([l.lat,l.lon],{company,icon:L.divIcon({html:`<span class="company-pin">${arrow}</span>`,className:'company-marker',iconSize:[36,40],iconAnchor:[18,38]}),title:company.name,alt:`${company.name}, ${l.name}. Details öffnen.`,keyboard:true,riseOnHover:true});
      marker.bindTooltip(`${esc(company.name)}<small>${esc(l.name)}</small>`,{direction:'top',offset:[0,-28],className:'company-tooltip',opacity:1});
      marker.on('click',()=>openCompany(company));
      marker.on('add',()=>marker.getElement()?.setAttribute('aria-label',`${company.name}, ${l.name}. Details öffnen.`));
      markersById.set(company.id,marker);
      return marker;
    });
    clusters.on('clusterclick',event=>{
      const group=event.layer;
      const bounds=group.getBounds();
      const samePlace=Math.abs(bounds.getNorth()-bounds.getSouth())<0.005&&Math.abs(bounds.getEast()-bounds.getWest())<0.005;
      if(map.getZoom()>=12||(samePlace&&map.getZoom()>=7))openGroup(group);
      else{closeDetail(false); map.fitBounds(bounds,{padding:[65,80],maxZoom:Math.min(12,Math.max(map.getZoom()+2,7)),animate:!reducedMotion});}
    });
    clusters.on('animationend',updateView);
    map.addLayer(clusters);
    clusters.addLayers(markers);
    dataReady=true;
    updateView();
  }catch(error){
    status.innerHTML='<strong>Unternehmensdaten konnten nicht geladen werden.</strong><button id="retry-data" class="retry-button">Erneut versuchen</button>';
    document.getElementById('retry-data').addEventListener('click',()=>{status.innerHTML='<span class="loading-ring"></span>Unternehmensstandorte werden geladen …';loadCompanies();});
  }
}
updateView();
await Promise.allSettled([loadWorld(),loadCompanies()]);
