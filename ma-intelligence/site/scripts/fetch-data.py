"""Build a source-attributed, deduplicated Wikidata map snapshot.

Listing statements overlapping 2026 through 2026-09-05 are retained. Missing
statement dates do NOT prove trading in 2026. No synthetic company locations.
"""
import collections
import concurrent.futures
import json
import pathlib
import re
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'dist' / 'assets'
UA = 'Marktatlas/1.0 (open company geography; Wikidata CC0 snapshot)'

def download(url, path):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=90) as r:
        data = r.read()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return f'{path.name}: {len(data)} bytes'

def assets():
    urls = {
        'leaflet.js':'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
        'leaflet.css':'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
        'markercluster.js':'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
        'markercluster.css':'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
        'topojson.js':'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/dist/topojson-client.min.js',
        'world.json':'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json',
        'images/marker-icon.png':'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
        'images/marker-icon-2x.png':'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        'images/marker-shadow.png':'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png',
        'images/layers.png':'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/layers.png',
        'images/layers-2x.png':'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/layers-2x.png',
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
        jobs=[pool.submit(download,u,ASSETS/n) for n,u in urls.items()]
        for job in jobs: print(job.result(),flush=True)

QUERY = '''
SELECT DISTINCT ?company ?companyLabel ?exchange ?exchangeLabel ?ticker ?directTicker
  ?hq ?hqLabel ?country ?countryLabel ?coord ?accuracy
WHERE {
  ?company p:P414 ?listing .
  ?listing ps:P414 ?exchange ; wikibase:rank ?listingRank .
  FILTER(?listingRank != wikibase:DeprecatedRank)
  FILTER NOT EXISTS { ?listing pq:P582 ?end . FILTER(?end < "2026-01-01T00:00:00Z"^^xsd:dateTime) }
  FILTER NOT EXISTS { ?listing pq:P580 ?start . FILTER(?start > "2026-09-05T23:59:59Z"^^xsd:dateTime) }
  FILTER NOT EXISTS { ?company wdt:P576 ?closed . FILTER(?closed < "2026-01-01T00:00:00Z"^^xsd:dateTime) }
  OPTIONAL { ?listing pq:P249 ?ticker }
  OPTIONAL { ?company wdt:P249 ?directTicker }
  ?company p:P159 ?hqStatement .
  ?hqStatement ps:P159 ?hq ; wikibase:rank ?hqRank .
  FILTER(?hqRank != wikibase:DeprecatedRank)
  FILTER NOT EXISTS { ?hqStatement pq:P582 ?hqEnd . FILTER(?hqEnd < "2026-09-05T00:00:00Z"^^xsd:dateTime) }
  FILTER NOT EXISTS { ?hqStatement pq:P580 ?hqStart . FILTER(?hqStart > "2026-09-05T23:59:59Z"^^xsd:dateTime) }
  OPTIONAL { ?hqStatement pq:P625 ?exactCoord }
  OPTIONAL { ?hqStatement pq:P276/wdt:P625 ?buildingCoord }
  OPTIONAL { ?hq wdt:P625 ?placeCoord }
  BIND(COALESCE(?exactCoord, ?buildingCoord, ?placeCoord) AS ?coord)
  FILTER(BOUND(?coord))
  BIND(IF(BOUND(?exactCoord) || BOUND(?buildingCoord), "headquarters", "locality") AS ?accuracy)
  OPTIONAL { ?hq wdt:P17 ?hqCountry }
  OPTIONAL { ?company wdt:P17 ?companyCountry }
  BIND(COALESCE(?hqCountry, ?companyCountry) AS ?country)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en" . }
}
'''

def companies():
    (ROOT/'data').mkdir(exist_ok=True)
    (ROOT/'data'/'companies.sparql').write_text(QUERY)
    url='https://query.wikidata.org/sparql?'+urllib.parse.urlencode({'query':QUERY, 'format':'json'})
    print('Fetching Wikidata company headquarters...',flush=True)
    download(url,ROOT/'data'/'wikidata-raw.json')
    raw=json.loads((ROOT/'data'/'wikidata-raw.json').read_text())['results']['bindings']
    found={}
    def val(r,k,default=''): return r.get(k,{}).get('value',default)
    for r in raw:
        qid=val(r,'company').rsplit('/',1)[-1]
        match=re.fullmatch(r'Point\(([-\d.eE]+) ([-\d.eE]+)\)', val(r,'coord'))
        if not match: continue
        lon,lat=map(float,match.groups())
        if not (-180 <= lon <= 180 and -85 <= lat <= 85): continue
        name=val(r,'companyLabel',qid)
        if name==qid: continue
        location={'name':val(r,'hqLabel'),'id':val(r,'hq').rsplit('/',1)[-1], 'lat':lat,'lon':lon,'accuracy':val(r,'accuracy'), 'country':val(r,'countryLabel'),'countryId':val(r,'country').rsplit('/',1)[-1]}
        record=found.setdefault(qid,{'id':qid,'name':name,'locations':[], 'listings':[]})
        if location not in record['locations']: record['locations'].append(location)
        listing={'exchange':val(r,'exchangeLabel'), 'exchangeId':val(r,'exchange').rsplit('/',1)[-1], 'ticker':val(r,'ticker') or val(r,'directTicker')}
        if listing not in record['listings']: record['listings'].append(listing)
    for rec in found.values():
        rec['locations'].sort(key=lambda l:(l['accuracy']!='headquarters',l['id'],l['lat'],l['lon']))
        rec['location']=rec['locations'][0]
    records=sorted(found.values(),key=lambda x:x['name'].casefold())
    output={'meta':{'requestedYear':2026,'retrievedAt':'2026-09-05','source':'Wikidata','sourceUrl':'https://www.wikidata.org/','license':'CC0','complete':False,'tradingIn2026Verified':False,'companyCount':len(records),'countryCount':len({r['location']['countryId'] for r in records if r['location']['countryId']}),'rawRowCount':len(raw),'selection':'Stock-exchange statements with no recorded end before 2026 and no recorded start after 2026-09-05; headquarters with coordinates. Dates and listing status may be missing or outdated. One primary mapped location per entity; alternative headquarters retained.'},'companies':records}
    (ASSETS/'companies.json').write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')))
    print(json.dumps(output['meta'],ensure_ascii=False),flush=True)
    print('Largest country groups:',collections.Counter(r['location']['country'] for r in records).most_common(12),flush=True)

if __name__=='__main__':
    import sys
    if '--assets' in sys.argv: assets()
    else: companies()
