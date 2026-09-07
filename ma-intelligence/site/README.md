# Marktatlas Orbit

The root page is a Three.js Earth globe using the NASA VTAD Earth 3D model
from the requested NASA embed, an atmosphere, surface-grab touch controls and
directed acquisition arcs. The old NASA Blue Marble sphere is a loading fallback. Arrowheads and
animated flow point **from buyer to acquired company**. Every one of the 22
curated transactions has a primary completion source and a 2026 completion date.
Announcements alone are excluded. The selection covers six inhabited continents;
regional filters match either endpoint. Majority stakes and operating-business
purchases are labeled separately. This is not an exhaustive global M&A feed.

The original map is retained at `/karte/`. Its 9,868-company snapshot is unchanged
and also appears as a selectable background point layer on the globe. Selecting
an acquisition exposes both parties, completion date, source and location links.
Small local arcs can use a display loop; no endpoint coordinates are shifted.

`scripts/build-acquisitions.py` reproduces `dist/assets/acquisitions.json` from
the retained company dataset, the checked-in supplemental Wikidata location
response, data/world-acquisitions.json and explicitly sourced completion records. Location accuracy is kept
separate from transaction verification. Additional companies are in the
acquisition layer only. Site assets include pinned Three.js 0.179.1 modules.

On unsupported WebGL devices, the acquisition list remains available and the
2D map is offered. Reduced-motion settings suppress automatic globe rotation
and traveling dots; hidden tabs suspend rendering. Desktop and mobile controls
include keyboard rotation and zoom. No browser QA was requested.

## Original 2D map

A German, mobile-friendly interactive map of stock-exchange-linked companies.
Static site in `dist/`, with bundled Leaflet, MarkerCluster, company snapshot and
Natural Earth world geometry. Optional CARTO / OpenStreetMap tiles add detail;
the bundled country map and records do not depend on those tiles being available.

## Data boundaries

Snapshot retrieved 2026-09-05. Wikidata P414 listing statements with recorded
dates outside the requested 2026 interval are excluded. Missing dates do not
verify current trading. This is partial open-data coverage, not an exhaustive
or verified global 2026 securities master. The interface discloses this at all
screen sizes and links each company's source.

One marker per Wikidata entity, with multiple listings deduplicated. Coordinates
come from source headquarters statements, referenced headquarters buildings,
or headquarters localities. No geographic coordinates are fabricated. Multiple
headquarters are retained, with one deterministically chosen primary map point.
High zoom reduces marker size; clustering splits geographically separated
records. Same-place groups open a company list and small groups can spiderfy
with connecting lines. Spiderfied positions are display offsets only.

## Refresh

`python3 scripts/fetch-data.py` rebuilds the snapshot from the checked-in SPARQL
query definition. The date bounds in the script and interface must be changed
together for a new snapshot. `python3 scripts/fetch-data.py --assets` refreshes
the pinned map dependencies. There are no API secrets or build requirements.

## Validation

JavaScript syntax, local asset references, dataset integrity, geographic range,
unique company identifiers, and zoom-scaling / viewport-counting invariants are
checked before deployment. No browser test was requested or performed.

## Close navigation

Camera rotation anchors the touched surface point. Zoom uses altitude above the
Earth and anchors the cursor or pinch centroid. Finger-count transitions retain
current positions and pinches cannot select a deal. No swipe inertia is applied.
`node scripts/check-navigation.mjs` checks projected anchor positions at four
altitudes, zoom limits, pinch-to-drag continuity and click isolation with real
Three.js camera mathematics. Physical mobile-device behavior is not tested.
The NASA model is a fixed-resolution Earth asset, not streamed building imagery.
