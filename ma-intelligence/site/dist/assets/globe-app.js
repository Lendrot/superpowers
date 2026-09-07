import {escapeHtml as esc,formatNumber as fmt} from './map-logic.mjs';
import {displayDate} from './globe-math.mjs';
const icons={globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',external:'<path d="M14 4h6v6M20 4 10 14M11 5H5v14h14v-6"/>',pause:'<path d="M9 5v14M15 5v14"/>',play:'<path d="m8 5 11 7-11 7Z"/>',rotate:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',list:'<path d="M8 6h12M8 12h12M8 18h12M4 6h.1M4 12h.1M4 18h.1"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
let engine,data,companies=[],selectedId=null,regionFilter='all';
const app=document.getElementById('app');
app.innerHTML=`<header class="topbar"><a class="brand" href="/" aria-label="Marktatlas Startseite"><span class="brand-icon">${icon('globe')}</span>marktatlas<span class="brand-dot">.</span><span class="orbit-badge">ORBIT</span></a><nav aria-label="Kartenansicht"><span aria-current="page">3D-Globus</span><a href="/deutschland/">Deutschland</a><a href="/karte/">2D-Karte</a></nav><button id="sources" class="sources-button">${icon('info')}<span>Daten & Quellen</span></button></header>
<div class="workspace"><aside class="sidebar"><div class="overview"><p class="eyebrow">Unternehmensübernahmen · 2026</p><h1>Wer kauft <em>wen?</em></h1><p class="intro">Die Verbindungen hinter der Weltwirtschaft.</p><div class="stats-line"><strong id="deal-count">—</strong><span>belegte Abschlüsse<br><small>01.01.–06.09.2026</small></span><button id="open-deals" class="mobile-deals" aria-label="Übernahmeliste öffnen">${icon('list')}</button></div><div class="region-control"><label for="region-filter">Region erkunden</label><select id="region-filter"><option value="all">Weltweit</option></select><span id="coverage-summary"></span></div></div><div class="list-heading"><span>KAUFABSCHLÜSSE</span><span>NEUESTE ZUERST</span></div><div class="deal-list" id="deal-list" aria-label="Bestätigte Übernahmen"></div><div class="sidebar-note"><span class="coverage-mark">◐</span><p>Belegte Auswahl, keine vollständige weltweite Übernahmeliste.</p></div></aside>
<section class="space" aria-label="Erde und Übernahmeverbindungen"><div id="globe"></div><div class="space-top"><div class="direction-key"><span class="key-dot buyer"></span><span>Käufer</span><span class="key-arrow">${icon('arrow')}</span><span class="key-dot target"></span><span>Übernommenes Unternehmen</span></div><span class="view-badge">ERDE / 2026</span></div><div class="loading" id="loading" role="status"><span class="spinner"></span>Der Globus wird geladen …</div><div class="scene-notice" id="scene-notice" role="status" hidden></div><div class="endpoint-label buyer-label" id="buyer-label" hidden></div><div class="endpoint-label target-label" id="target-label" hidden></div><div class="hover-tooltip" id="hover-tooltip" hidden></div><section class="selection-card" id="selection-card" aria-label="Ausgewählte Übernahme" tabindex="-1" hidden></section><div class="space-caption"><p class="eyebrow">Eine Welt. Neue Verbindungen.</p><p>Globus drehen. Pfeil auswählen.</p></div><label class="companies-toggle"><input id="companies-toggle" type="checkbox" checked><span class="checkbox-ui"></span><span><b id="site-count">9.868</b> Unternehmensstandorte</span></label><div class="globe-controls"><button id="zoom-in" aria-label="Hineinzoomen" title="Hineinzoomen">${icon('plus')}</button><button id="zoom-out" aria-label="Herauszoomen" title="Herauszoomen">${icon('minus')}</button><span class="control-separator"></span><button id="home" aria-label="Zur Weltansicht" title="Zur Weltansicht">${icon('globe')}</button><button id="rotation" aria-pressed="true" aria-label="Globusrotation pausieren" title="Globusrotation pausieren">${icon('pause')}</button></div><div class="touch-hint">Ziehen zum Drehen · zwei Finger zum Zoomen</div></section></div><footer><span>Datenstand 06.09.2026 <i></i> Belegte Auswahl · weltweit unvollständig</span><span>Standorte: Wikidata & Unternehmensquellen <i></i> Erde: NASA Earth 3D</span></footer>
<dialog id="sources-dialog" aria-labelledby="sources-title"><div class="dialog-top"><p class="eyebrow">Daten & Quellen</p><button class="icon-button" data-close-dialog aria-label="Dateninformationen schließen">${icon('close')}</button></div><h2 id="sources-title">Was die Pfeile bedeuten.</h2><p class="dialog-lead">Ein Pfeil beginnt beim <b class="buyer-text">Käufer</b> und zeigt zum <b class="target-text">übernommenen Unternehmen</b>. Die Bewegung läuft in derselben Richtung.</p><div class="source-note"><strong id="source-summary">Belegte Abschlüsse im Jahr 2026.</strong><p>Die Übernahmen wurden zusätzlich recherchiert. Im ursprünglichen Standortdatensatz waren keine Kaufbeziehungen enthalten. Die Auswahl umfasst alle sechs bewohnten Kontinente, ist aber keine vollständige Weltliste. Fehlende Pfeile bedeuten nicht, dass dort keine Übernahmen stattfanden. Die Zahlen beschreiben nur diesen belegten Bestand; es besteht keine automatische Anbindung an eine vollständige M&A-Datenbank.</p></div><dl><div><dt>Abschluss statt Ankündigung</dt><dd>Aufgenommen sind nur durch Unternehmensmeldungen oder Emittentenunterlagen bestätigte Kaufabschlüsse zwischen dem 1. Januar und dem 6. September 2026. Das Datum am Pfeil ist der Abschluss, auch wenn die Ankündigung aus 2025 stammt. Mehrheitsbeteiligungen und Käufe operativer Geschäfte sind eigens gekennzeichnet.</dd></div><div><dt>Geografische Bedeutung</dt><dd>Die Bögen verbinden die erfassten Hauptsitze oder Ortskoordinaten. Sie sind keine Transportwege. Bogenhöhe und Pfeilgröße haben keine finanzielle Bedeutung. Ein Regionsfilter zeigt Käufe mit Käufer oder Ziel in der gewählten Region. Bei Käufen über Tochtergesellschaften kann der Hauptsitz der ausdrücklich bezeichneten Käufergruppe dargestellt sein. Der Verkäufer früherer Anteile wird nicht als Ziel dargestellt.</dd></div><div><dt>Genauigkeit der Standorte</dt><dd>Die bisherigen 9.868 Unternehmenseinträge bleiben erhalten. Für fehlende Käufer und Ziele wurden belegte Orte ergänzt und vorhandenen Ortskoordinaten zugeordnet. Die Standorte sind teils nur ortsgenau; sie sind keine Prüfung des juristischen Sitzes zum Kaufzeitpunkt.</dd></div><div><dt>Hintergrundpunkte</dt><dd>Helle Punkte zeigen den ursprünglichen Unternehmensbestand aus Wikidata. Ein Punkt allein bedeutet keine Übernahme. Die Börsenabdeckung und der Börsenstatus für 2026 bleiben unvollständig geprüft.</dd></div><div><dt>Die Erde</dt><dd>NASA Earth 3D von VTAD – das Modell aus deinem NASA-Link, keine Live-Aufnahme. Das ursprüngliche Blue-Marble-Mosaik dient nur als Ersatz, falls das Modell nicht lädt. Beleuchtung und Sternhintergrund dienen der räumlichen Darstellung.</dd></div></dl><div class="source-links"><a href="https://science.nasa.gov/resource/earth-3d-model/" target="_blank" rel="noopener noreferrer">NASA · Earth 3D Model ${icon('external')}</a><a href="https://www.wikidata.org/" target="_blank" rel="noopener noreferrer">Wikidata · Unternehmensstandorte ${icon('external')}</a><a href="/karte/">Bisherige 2D-Karte öffnen ${icon('arrow')}</a></div><h3>Quellen zu den Kaufabschlüssen</h3><div id="deal-sources" class="source-links"></div></dialog>
<dialog id="deals-dialog" aria-labelledby="deals-title"><div class="dialog-top"><h2 id="deals-title">Übernahmen 2026</h2><button class="icon-button" data-close-dialog aria-label="Übernahmeliste schließen">${icon('close')}</button></div><div id="mobile-deal-list" class="deal-list"></div></dialog>
<dialog id="companies-dialog" aria-labelledby="companies-title"><div class="dialog-top"><h2 id="companies-title">Unternehmen am selben Ort</h2><button class="icon-button" data-close-dialog aria-label="Unternehmensliste schließen">${icon('close')}</button></div><div id="company-list"></div></dialog>`;

const $=id=>document.getElementById(id);
const card=$('selection-card');
document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
$('sources').addEventListener('click',()=>$('sources-dialog').showModal());
$('open-deals').addEventListener('click',()=>$('deals-dialog').showModal());
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}));
function notice(message){$('scene-notice').textContent=message;$('scene-notice').hidden=false;}
function sceneError(message){$('loading').hidden=true;notice(message);$('globe').classList.add('unavailable');}
function rotationState(rotating){const button=$('rotation');button.innerHTML=icon(rotating?'pause':'play');button.setAttribute('aria-pressed',String(rotating));button.setAttribute('aria-label',rotating?'Globusrotation pausieren':'Globusrotation starten');button.title=button.getAttribute('aria-label');}
$('zoom-in').addEventListener('click',()=>engine?.zoom(.84));
$('zoom-out').addEventListener('click',()=>engine?.zoom(1.19));
$('home').addEventListener('click',()=>{regionFilter='all';$('region-filter').value='all';clearSelection();if(data)renderDeals();engine?.home();});
$('rotation').addEventListener('click',()=>engine?.toggleRotation());
$('companies-toggle').addEventListener('change',event=>engine?.showCompanies(event.target.checked));

const kindLabel=deal=>({majority:'Mehrheitsbeteiligung',business:'Operatives Geschäft',company:'Unternehmensübernahme'}[deal.kind||'company']);
function dealRow(deal){const buyer=data.entities[deal.buyerId],target=data.entities[deal.targetId];return `<button class="deal-row" data-deal="${esc(deal.id)}" aria-label="${esc(buyer.name)} → ${esc(target.name)}. ${kindLabel(deal)}. Abschluss ${displayDate(deal.completedOn)}."><span class="deal-route"><strong>${esc(buyer.name)}</strong><span>${icon('arrow')}${esc(target.name)}</span><small class="deal-geography">${esc(buyer.country)} → ${esc(target.country)}${deal.kind!=='company'?' · '+kindLabel(deal):''}</small></span><span class="deal-meta">${displayDate(deal.completedOn)}<span class="deal-arrow">↗</span></span></button>`;}
function connectDealRows(root){root.querySelectorAll('[data-deal]').forEach(button=>button.addEventListener('click',()=>{$('deals-dialog').close();selectDeal(button.dataset.deal);}));}
function renderData(){
  $('deal-count').textContent=data.deals.length;
  $('site-count').textContent=fmt(companies.length||data.meta.sourceCompanyCount);
  $('source-summary').textContent=`${data.deals.length} belegte Kaufabschlüsse im Jahr 2026.`;
  const names=['Europa','Nordamerika','Südamerika','Afrika','Asien','Ozeanien'];
  $('region-filter').innerHTML='<option value="all">Weltweit · '+data.deals.length+'</option>'+names.map(r=>`<option value="${esc(r)}">${esc(r)} · ${data.deals.filter(d=>d.regions.includes(r)).length}</option>`).join('');
  $('coverage-summary').textContent=`${data.meta.countryCount} Länder · ${data.meta.regionCount} Kontinente · Auswahl`;
  renderDeals();
  $('deal-sources').innerHTML=data.deals.map(d=>`<a href="${esc(d.sourceUrl)}" target="_blank" rel="noopener noreferrer"><span>${esc(data.entities[d.buyerId].name)} → ${esc(data.entities[d.targetId].name)}<small>${displayDate(d.completedOn)}</small></span>${icon('external')}</a>`).join('');
}
function renderDeals(){
  const visible=data.deals.filter(d=>regionFilter==='all'||d.regions.includes(regionFilter));
  const html=visible.map(dealRow).join('')||'<p class="empty-note">Für diese Region sind keine belegten Abschlüsse im Datenbestand.</p>';
  $('deal-list').innerHTML=html;$('mobile-deal-list').innerHTML=html;
  $('deal-count').textContent=visible.length;
  $('deals-title').textContent=regionFilter==='all'?'Übernahmen weltweit':regionFilter;
  connectDealRows($('deal-list'));connectDealRows($('mobile-deal-list'));
  engine?.filterDeals(visible.map(d=>d.id));
}
$('region-filter').addEventListener('change',event=>{
  regionFilter=event.target.value;clearSelection();renderDeals();
  const centers={Europa:[50,12],Nordamerika:[35,-100],Südamerika:[-15,-60],Afrika:[-5,25],Asien:[25,100],Ozeanien:[-25,135]};
  if(regionFilter==='all')engine?.home();else engine?.focusLocation(...centers[regionFilter],255);
});
function clearSelection(){selectedId=null;card.hidden=true;engine?.selectDeal(null,false);document.querySelector('.space').classList.remove('has-selection');document.querySelectorAll('.deal-row').forEach(el=>el.classList.remove('selected'));$('buyer-label').hidden=true;$('target-label').hidden=true;}
function selectDeal(id){
  const deal=data?.deals.find(d=>d.id===id);if(!deal)return;
  selectedId=id;engine?.selectDeal(id);
  const buyer=data.entities[deal.buyerId],target=data.entities[deal.targetId];
  card.innerHTML=`<div class="card-top"><span class="complete-badge">${kindLabel(deal)} · ${displayDate(deal.completedOn)}</span><button class="icon-button" id="close-selection" aria-label="Details schließen">${icon('close')}</button></div><div class="deal-relationship"><div><span class="endpoint-role buyer-text">KÄUFER</span><h2>${esc(buyer.name)}</h2><a class="place-link" href="${esc(buyer.locationSourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(buyer.place)} · ${esc(buyer.country)}</a></div><span class="relationship-arrow">${icon('arrow')}</span><div><span class="endpoint-role target-text">ÜBERNOMMEN</span><h2>${esc(target.name)}</h2><a class="place-link" href="${esc(target.locationSourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(target.place)} · ${esc(target.country)}</a></div></div>${deal.note?`<p class="deal-note">${esc(deal.note)}</p>`:''}<div class="card-bottom"><span>Standorte teils nur ortsgenau</span><a href="${esc(deal.sourceUrl)}" target="_blank" rel="noopener noreferrer">Abschluss belegen ${icon('external')}</a></div>`;
  card.hidden=false;document.querySelector('.space').classList.add('has-selection');
  $('close-selection').addEventListener('click',clearSelection);
  document.querySelectorAll('[data-deal]').forEach(el=>{el.classList.toggle('selected',el.dataset.deal===id);el.setAttribute('aria-pressed',String(el.dataset.deal===id));});
  card.focus({preventScroll:true});
}
function showCompany(company){
  clearSelection();const location=company.location;
  card.innerHTML=`<div class="card-top"><span class="eyebrow">Unternehmensstandort</span><button class="icon-button" id="close-selection" aria-label="Unternehmensdetails schließen">${icon('close')}</button></div><h2 class="company-name">${esc(company.name)}</h2><p class="company-place">${esc(location.name)} · ${esc(location.country)}</p><div class="company-listings">${company.listings.map(l=>`<span>${esc(l.exchange)}${l.ticker?' · '+esc(l.ticker):''}</span>`).join('')}</div><p class="deal-note">Der Standort allein belegt keine Übernahme. ${location.accuracy==='headquarters'?'Hauptsitz-Koordinate laut Quelle.':'Ortskoordinate, nicht gebäudegenau.'}</p><div class="card-bottom"><span>Börsenstatus 2026 ungeprüft</span><a href="https://www.wikidata.org/wiki/${esc(company.id)}" target="_blank" rel="noopener noreferrer">Wikidata ${icon('external')}</a></div>`;
  card.hidden=false;document.querySelector('.space').classList.add('has-selection');$('close-selection').addEventListener('click',clearSelection);card.focus({preventScroll:true});
}
function companyClick(records){
  if(records.length===1){showCompany(records[0]);return;}
  const title=`${records[0].location.name}: ${fmt(records.length)} Unternehmen`;
  $('companies-title').textContent=title;
  $('company-list').innerHTML=records.sort((a,b)=>a.name.localeCompare(b.name,'de')).map(c=>`<button class="company-option" data-company="${esc(c.id)}"><span>${esc(c.name)}</span>↗</button>`).join('');
  $('company-list').querySelectorAll('[data-company]').forEach(button=>button.addEventListener('click',()=>{$('companies-dialog').close();showCompany(records.find(c=>c.id===button.dataset.company));}));
  $('companies-dialog').showModal();
}
function labels(items){
  for(const role of ['buyer','target']){
    const element=$(role+'-label'),item=items.find(i=>i.role===role);
    if(!item?.visible||!selectedId){element.hidden=true;continue;}
    element.hidden=false;const name=item.entity.name;
    if(element.dataset.name!==name){element.innerHTML=`<small>${role==='buyer'?'KÄUFER':'ÜBERNOMMEN'}</small><b>${esc(name)}</b>`;element.dataset.name=name;}
    const width=element.offsetWidth;const left=Math.max(12,Math.min($('globe').clientWidth-width-12,item.x+(role==='buyer'?-width-16:16)));
    element.style.transform=`translate(${left}px,${Math.max(60,item.y+(role==='buyer'?-40:12))}px)`;
  }
}
function hover(deal,x,y){const el=$('hover-tooltip');if(!deal){el.hidden=true;return;}const rect=$('globe').getBoundingClientRect();el.innerHTML=`<strong>${esc(data.entities[deal.buyerId].name)} → ${esc(data.entities[deal.targetId].name)}</strong><span>Abgeschlossen am ${displayDate(deal.completedOn)}</span>`;el.hidden=false;el.style.left=`${Math.max(12,Math.min(rect.width-280,x-rect.left+16))}px`;el.style.top=`${Math.max(60,y-rect.top-60)}px`;}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.querySelector('dialog[open]'))clearSelection();});
async function load(){
  const jobs=await Promise.allSettled([fetch('/assets/acquisitions.json').then(r=>{if(!r.ok)throw new Error('deals');return r.json();}),fetch('/assets/companies.json').then(r=>{if(!r.ok)throw new Error('companies');return r.json();}),import('./globe-scene.js')]);
  if(jobs[0].status!=='fulfilled'){$('loading').innerHTML='<strong>Übernahmedaten konnten nicht geladen werden.</strong><button onclick="location.reload()">Erneut laden</button>';$('deal-list').innerHTML='<p class="empty-note">Daten nicht erreichbar. Bitte lade die Seite erneut.</p>';return;}
  data=jobs[0].value;
  if(jobs[1].status==='fulfilled')companies=jobs[1].value.companies;else notice('Die zusätzlichen Unternehmensstandorte konnten nicht geladen werden. Die belegten Übernahmen bleiben verfügbar.');
  renderData();
  try{
    if(jobs[2].status!=='fulfilled')throw jobs[2].reason;
    engine=jobs[2].value.createGlobe($('globe'),{onDealClick:selectDeal,onCompanyClick:companyClick,onNotice:notice,onError:sceneError,onRotation:rotationState,onLabels:labels,onHover:hover,onView:distance=>{$('zoom-in').disabled=distance<=101.51;$('zoom-out').disabled=distance>=589.9;}});
    engine.setCompanies(companies);engine.setDeals(data.deals,data.entities);renderDeals();rotationState(engine.isRotating());$('loading').hidden=true;
  }catch(error){$('loading').innerHTML=`<strong>3D ist auf diesem Gerät gerade nicht verfügbar.</strong><span>Alle Übernahmen bleiben in der Liste erreichbar.</span><a href="/karte/">2D-Karte öffnen ${icon('arrow')}</a>`;document.querySelectorAll('.globe-controls button').forEach(b=>b.disabled=true);}
}
await load();
