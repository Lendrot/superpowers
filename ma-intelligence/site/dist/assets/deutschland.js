/**
 * Deutschland-M&A-Ansicht.
 *
 * Die Seite rechnet nichts aus. Sie zeigt, was in deutschland-ma.json steht —
 * erzeugt aus der geprueften Datenbank (`pnpm build:map`). Kein Nachladen von
 * fremden Servern, keine Kartenkacheln: die Laenderumrisse kommen aus dem
 * mitgelieferten world.json, wie auf der Weltkarte auch.
 */

const app = document.getElementById('app');

const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const nf = new Intl.NumberFormat('de-DE');
const dateFormat = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('de-DE', { timeZone: 'UTC' }) : null);

/** Bestaetigt, laufend oder unbestaetigt — bestimmt Farbe UND Form. */
function tone(deal) {
  if (deal.unconfirmed) return 'unconfirmed';
  return deal.status === 'completed' ? 'confirmed' : 'pending';
}

function money(value, currency) {
  if (value === null || currency === null) return null;
  if (value >= 1e9) return `${nf.format(Math.round((value / 1e9) * 100) / 100)} Mrd. ${currency}`;
  if (value >= 1e6) return `${nf.format(Math.round(value / 1e6))} Mio. ${currency}`;
  return `${nf.format(value)} ${currency}`;
}

app.innerHTML = `
  <header class="topbar">
    <div class="brand">marktatlas<span class="brand-dot">.</span></div>
    <span style="color:var(--muted);font-size:13px">Deutschland · M&amp;A</span>
    <nav>
      <a href="/karte/">Weltkarte</a>
      <a href="/">3D-Globus</a>
    </nav>
  </header>
  <div class="workspace">
    <aside class="sidebar">
      <h1>Übernahmen in Deutschland</h1>
      <p class="lead" id="lead">Wird geladen …</p>

      <fieldset>
        <legend>Dealstatus</legend>
        <div class="chips" id="status-filter"></div>
      </fieldset>

      <fieldset>
        <legend>Branche</legend>
        <div class="chips" id="industry-filter"></div>
      </fieldset>

      <fieldset>
        <legend>Zeitraum</legend>
        <div class="dates">
          <label>von <input type="date" id="from"></label>
          <label>bis <input type="date" id="to"></label>
        </div>
      </fieldset>

      <p class="result-count"><span id="result-count">—</span> · <button class="reset" id="reset">Filter zurücksetzen</button></p>
      <ul class="deal-list" id="deal-list"></ul>
      <div class="no-location" id="no-location"></div>
      <p class="disclaimer" id="disclaimer"></p>
    </aside>
    <div class="map-area">
      <div id="map"></div>
      <div class="legend">
        <b>Lesart</b>
        <div><i class="confirmed"></i> vollzogen</div>
        <div><i class="pending"></i> angekündigt, unterzeichnet, in Prüfung</div>
        <div><i class="unconfirmed"></i> Gerücht, Verkaufsprozess oder Kaufabsicht — nicht bestätigt</div>
      </div>
      <section class="detail" id="detail" hidden aria-live="polite"></section>
    </div>
  </div>
`;

/** Deutschland grob umschlossen — der Ausschnitt, mit dem die Seite oeffnet. */
const GERMANY_BOUNDS = L.latLngBounds([47.2, 5.8], [55.1, 15.1]);

const map = L.map('map', { zoomControl: true, minZoom: 4, maxZoom: 12, worldCopyJump: false });
map.fitBounds(GERMANY_BOUNDS, { paddingTopLeft: [20, 20], paddingBottomRight: [20, 20] });
map.createPane('countries');
map.getPane('countries').style.zIndex = 200;

const state = { data: null, statuses: new Set(), industries: new Set(), from: '', to: '', selected: null };
const markers = new Map();

async function loadCountries() {
  try {
    const response = await fetch('/assets/world.json');
    if (!response.ok) throw new Error('world');
    const world = await response.json();
    // Deutschland wird hervorgehoben: die Nachbarlaender geben nur Orientierung.
    L.geoJSON(topojson.feature(world, world.objects.countries), {
      pane: 'countries',
      style: (feature) =>
        feature.properties?.name === 'Germany'
          ? { fillColor: '#1d4550', fillOpacity: 1, color: '#5c8592', weight: 1.1, opacity: 1 }
          : { fillColor: '#122a31', fillOpacity: 1, color: '#2d4a53', weight: 0.5, opacity: 0.6 },
      interactive: false,
    }).addTo(map);
  } catch {
    document.getElementById('lead').textContent += ' Die Länderumrisse konnten nicht geladen werden.';
  }
}

function matches(deal) {
  if (state.statuses.size > 0 && !state.statuses.has(deal.status)) return false;
  if (state.industries.size > 0 && !state.industries.has(deal.target.industry)) return false;
  if (state.from || state.to) {
    if (deal.date === null) return false;
    if (state.from && deal.date < state.from) return false;
    if (state.to && deal.date > state.to) return false;
  }
  return true;
}

function renderFilters() {
  const statusHtml = state.data.filters.statuses
    .map((entry) => {
      const unconfirmed = entry.key === 'rumored' || entry.key === 'sale_process' || entry.key === 'intent';
      return `<label class="chip${unconfirmed ? ' is-unconfirmed' : ''}">
        <input type="checkbox" name="status" value="${esc(entry.key)}">
        ${esc(entry.label)} <span class="count">${entry.count}</span>
      </label>`;
    })
    .join('');
  document.getElementById('status-filter').innerHTML = statusHtml;

  document.getElementById('industry-filter').innerHTML = state.data.filters.industries
    .map(
      (entry) => `<label class="chip">
        <input type="checkbox" name="industry" value="${esc(entry.key)}">
        ${esc(entry.label)} <span class="count">${entry.count}</span>
      </label>`,
    )
    .join('');

  const range = state.data.filters.date_range;
  const from = document.getElementById('from');
  const to = document.getElementById('to');
  if (range.from) { from.min = range.from; to.min = range.from; }
  if (range.to) { from.max = range.to; to.max = range.to; }

  document.getElementById('status-filter').addEventListener('change', (event) => {
    toggle(state.statuses, event.target.value, event.target.checked);
    render();
  });
  document.getElementById('industry-filter').addEventListener('change', (event) => {
    toggle(state.industries, event.target.value, event.target.checked);
    render();
  });
  from.addEventListener('change', () => { state.from = from.value; render(); });
  to.addEventListener('change', () => { state.to = to.value; render(); });
  document.getElementById('reset').addEventListener('click', () => {
    state.statuses.clear();
    state.industries.clear();
    state.from = '';
    state.to = '';
    from.value = '';
    to.value = '';
    for (const input of document.querySelectorAll('.chip input')) input.checked = false;
    render();
  });
}

function toggle(set, value, on) {
  if (on) set.add(value);
  else set.delete(value);
}

function renderMarkers(visible) {
  for (const [id, marker] of markers) {
    if (!visible.some((deal) => deal.id === id)) {
      map.removeLayer(marker);
      markers.delete(id);
    }
  }
  for (const deal of visible) {
    if (deal.target.latitude === null || markers.has(deal.id)) continue;
    const kind = tone(deal);
    const marker = L.marker([deal.target.latitude, deal.target.longitude], {
      icon: L.divIcon({
        className: '',
        html: `<span class="pin ${kind}" style="width:18px;height:18px"></span>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      keyboard: true,
      title: `${deal.target.name} — ${deal.status_label}`,
      alt: `${deal.target.name}, ${deal.status_label}`,
    });
    marker.on('click', () => select(deal.id));
    marker.addTo(map);
    markers.set(deal.id, marker);
  }
  for (const [id, marker] of markers) {
    marker.getElement()?.querySelector('.pin')?.classList.toggle('is-selected', id === state.selected);
  }
}

function renderList(visible) {
  document.getElementById('deal-list').innerHTML = visible
    .map((deal) => {
      const date = dateFormat(deal.date);
      const parties = deal.buyers.length > 0 ? deal.buyers.join(', ') : 'Käufer offen';
      return `<li><button class="deal-item ${tone(deal)}" data-id="${esc(deal.id)}" aria-current="${deal.id === state.selected}">
        <span class="name">${esc(deal.target.name)}</span>
        <span class="meta">${esc(deal.status_label)}${date ? ` · ${esc(date)}` : ' · ohne Datum'} · ${esc(parties)}</span>
      </button></li>`;
    })
    .join('');

  for (const button of document.querySelectorAll('.deal-item')) {
    button.addEventListener('click', () => select(button.dataset.id));
  }

  const missing = visible.filter((deal) => deal.target.latitude === null);
  document.getElementById('no-location').textContent =
    missing.length === 0
      ? ''
      : `${missing.length} Transaktion${missing.length === 1 ? '' : 'en'} ohne belegten Standort: ${missing
          .map((deal) => deal.target.name)
          .join(', ')}. Sie stehen in der Liste, aber nicht auf der Karte — eine Koordinate wird nicht geschätzt.`;
}

function renderDetail(deal) {
  const panel = document.getElementById('detail');
  if (!deal) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }

  const rows = [
    ['Status', `<span class="badge ${tone(deal)}">${esc(deal.status_label)}</span>${deal.unconfirmed ? 'nicht bestätigt' : ''}`],
    ['Käufer', deal.buyers.length > 0 ? deal.buyers.map(esc).join(', ') : 'offen'],
    ['Verkäufer', deal.sellers.length > 0 ? deal.sellers.map(esc).join(', ') : 'nicht belegt'],
    ['Angekündigt', dateFormat(deal.announcement_date) ?? 'nicht belegt'],
    ['Vollzogen', dateFormat(deal.completion_date) ?? (deal.status === 'completed' ? 'Datum nicht belegt' : '—')],
    ['Wert', money(deal.deal_value, deal.currency) ?? 'nicht offengelegt'],
    ['Anteil erworben', deal.stake_acquired_percentage === null ? 'nicht belegt' : `${nf.format(deal.stake_acquired_percentage)} %`],
    ['Anteil danach', deal.stake_after_percentage === null ? 'nicht belegt' : `${nf.format(deal.stake_after_percentage)} %`],
    ['Branche', esc(deal.target.industry_label)],
    ['Sitz', deal.target.city ? `${esc(deal.target.city)}${deal.target.region ? `, ${esc(deal.target.region)}` : ''}` : 'nicht belegt'],
    ['Koordinate', deal.target.coordinate_accuracy === 'headquarters' ? 'Firmensitz' : deal.target.coordinate_accuracy === 'locality' ? 'Ortsmittelpunkt' : 'keine'],
    ['Belegstatus', `${esc(deal.evidence)} · Konfidenz ${deal.confidence}`],
  ];

  panel.innerHTML = `
    <button class="close" id="close-detail" aria-label="Details schließen">✕</button>
    <h2>${esc(deal.target.name)}</h2>
    <p class="sub">${esc(deal.target.legal_name ?? deal.target.name)}</p>
    <dl>${rows.map(([term, value]) => `<dt>${esc(term)}</dt><dd>${value}</dd>`).join('')}</dl>
    ${deal.notes ? `<h3>Anmerkung</h3><p class="note">${esc(deal.notes)}</p>` : ''}
    ${
      deal.claims.length > 0
        ? `<h3>Belegte Einzelaussagen</h3><ul>${deal.claims
            .map(
              (claim) => `<li class="claim">${claim.field ? `<span class="field">${esc(claim.field)}</span><br>` : ''}${esc(claim.statement)}${
                claim.source_url ? `<br><a href="${esc(claim.source_url)}" target="_blank" rel="noopener noreferrer">Quelle öffnen</a>` : ''
              }</li>`,
            )
            .join('')}</ul>`
        : ''
    }
    <h3>Quellen (${deal.sources.length})</h3>
    <ul>${deal.sources
      .map(
        (source) => `<li class="source">
          ${source.url ? `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a>` : esc(source.title)}
          <br><span class="pub">${esc(source.publisher)}${source.publication_date ? ` · ${esc(dateFormat(source.publication_date))}` : ''} · ${esc(source.source_type)}</span>
        </li>`,
      )
      .join('')}</ul>
  `;
  panel.hidden = false;
  document.getElementById('close-detail').addEventListener('click', () => select(null));
}

function select(id) {
  state.selected = state.selected === id ? null : id;
  const deal = state.data.deals.find((entry) => entry.id === state.selected) ?? null;
  renderDetail(deal);
  render();
  if (deal && deal.target.latitude !== null) {
    map.setView([deal.target.latitude, deal.target.longitude], Math.max(map.getZoom(), 8), { animate: true });
  } else if (!deal) {
    // Ohne Auswahl zurueck auf den Deutschland-Ausschnitt, statt im letzten
    // Zoom stehen zu bleiben.
    map.fitBounds(GERMANY_BOUNDS, { animate: true });
  }
}

function render() {
  const visible = state.data.deals.filter(matches);
  document.getElementById('result-count').textContent =
    visible.length === state.data.deals.length
      ? `${nf.format(visible.length)} Transaktionen`
      : `${nf.format(visible.length)} von ${nf.format(state.data.deals.length)} Transaktionen`;
  renderMarkers(visible);
  renderList(visible);
  if (state.selected && !visible.some((deal) => deal.id === state.selected)) {
    state.selected = null;
    renderDetail(null);
  }
}

async function start() {
  await loadCountries();
  try {
    const response = await fetch('/assets/deutschland-ma.json');
    if (!response.ok) throw new Error('data');
    state.data = await response.json();
  } catch {
    document.getElementById('lead').textContent = 'Die Transaktionsdaten konnten nicht geladen werden.';
    return;
  }

  const meta = state.data.meta;
  // Deals mit deutschem Kaeufer und auslaendischem Ziel haengen nicht an dieser
  // Karte. Sie werden benannt, statt still zu fehlen.
  const buyerSide =
    meta.buyer_side_count > 0
      ? ` Dazu ${nf.format(meta.buyer_side_count)} Transaktionen mit deutschem Käufer und Ziel im Ausland, die diese Karte nicht zeigt.`
      : '';
  document.getElementById('lead').textContent =
    `${nf.format(meta.deal_count)} erfasste Transaktionen mit deutschem Zielunternehmen, ` +
    `${nf.format(meta.located_count)} davon mit belegtem Standort. Datenstand ${dateFormat(meta.data_as_of.slice(0, 10))}.` +
    buyerSide;
  document.getElementById('disclaimer').textContent = meta.disclaimer;

  renderFilters();
  render();
  // Nach dem ersten Rendern steht die Containergroesse fest; erst dann passt
  // der Ausschnitt wirklich.
  map.invalidateSize({ pan: false });
  map.fitBounds(GERMANY_BOUNDS);
}

start();
