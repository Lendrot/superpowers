"""Curated completed-2026 transactions, with separate deal and location evidence.
The original company snapshot is reused unchanged; absent targets are added only
to the acquisition layer using source-confirmed places and Wikidata coordinates.
"""
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
companies=json.loads((ROOT/'dist/assets/companies.json').read_text())['companies']
by_id={c['id']:c for c in companies}
entities={}

def existing(qid,name=None):
    c=by_id[qid];l=c['location']
    entities[qid]={'id':qid,'name':name or c['name'],'lat':l['lat'],'lon':l['lon'],'place':l['name'],'country':l['country'],'accuracy':l['accuracy'],'existingCompanyId':qid,'locationSourceUrl':f'https://www.wikidata.org/wiki/{qid}','coordinateSourceUrl':f"https://www.wikidata.org/wiki/{l['id']}"}
    return qid

def city(name):
    matches=[l for c in companies for l in c['locations'] if l['name'].casefold()==name.casefold() and l['accuracy']=='locality']
    assert matches, f'No sourced locality coordinates for {name}'
    return matches[0]

def addition(key,name,place,source):
    l=city(place)
    entities[key]={'id':key,'name':name,'lat':l['lat'],'lon':l['lon'],'place':l['name'],'country':l['country'],'accuracy':'locality','existingCompanyId':None,'locationSourceUrl':source,'coordinateSourceUrl':f"https://www.wikidata.org/wiki/{l['id']}"}
    return key

for qid,name in [('Q7128508',None),('Q7455653',None),('Q1034654',None),('Q507154',None),('Q16466481','Holcim'),('Q52825',None),('Q212322',None),('Q306764','Abbott'),('Q22121866',None),('Q1347782','Marvell')]:existing(qid,name)

raw=json.loads((ROOT/'data/acquisition-locations-raw.json').read_text())['results']['bindings']
for qid,name,place_id in [('Q95','Google','Q694178'),('Q535956','Xella','Q2100'),('Q5197666','CyberArk','Q49196'),('Q60741065','Brex','Q62')]:
    matches=[r for r in raw if r['company']['value'].endswith('/'+qid) and r.get('hq',{}).get('value','').endswith('/'+place_id)]
    assert matches,(qid,place_id)
    r=matches[0]
    lon,lat=map(float,r['coord']['value'][6:-1].split())
    entities[qid]={'id':qid,'name':name,'lat':lat,'lon':lon,'place':r['hqLabel']['value'],'country':r['countryLabel']['value'],'accuracy':'headquarters' if place_id=='Q694178' else 'locality','existingCompanyId':None,'locationSourceUrl':f'https://www.wikidata.org/wiki/{qid}','coordinateSourceUrl':f'https://www.wikidata.org/wiki/{place_id}'}

google_source='https://blog.google/innovation-and-ai/infrastructure-and-cloud/google-cloud/wiz-acquisition/'
netcontrol_source='https://www.netcontrol.com/abb-completes-netcontrol-acquisition/'
addition('wiz','Wiz','New York City',google_source)
addition('armis','Armis','San Francisco','https://www.linkedin.com/company/armis-security')
addition('avidity','Avidity Biosciences','San Diego','https://www.sec.gov/Archives/edgar/data/1599901/000119312525202371/d25770dex991.htm')
addition('netcontrol','Netcontrol','Helsinki',netcontrol_source)
addition('rapt','RAPT Therapeutics','South San Francisco','https://www.sec.gov/Archives/edgar/data/1673772/000119312526086530/0001193125-26-086530-index.htm')
addition('celestial','Celestial AI','Santa Clara','https://www.linkedin.com/company/celestial-ai')

rows=[
('google-wiz','Q95','wiz','2026-03-11',google_source,'Google · Abschluss der Wiz-Übernahme','Google gehört zu Alphabet. Als Käufer wird Google selbst angezeigt.'),
('paloalto-cyberark','Q7128508','Q5197666','2026-02-11','https://www.paloaltonetworks.com/company/press/2026/palo-alto-networks-completes-acquisition-of-cyberark-to-secure-the-ai-era','Palo Alto Networks · CyberArk-Übernahme abgeschlossen','CyberArk wird am in Wikidata erfassten Standort Newton gezeigt. Das Unternehmen hat auch Standorte in Israel.'),
('servicenow-armis','Q7455653','armis','2026-04-20','https://www.sec.gov/Archives/edgar/data/1373715/000137371526000054/erq1fy26.htm','ServiceNow · Quartalsmitteilung bei der SEC',None),
('capitalone-brex','Q1034654','Q60741065','2026-04-07','https://www.capitalone.com/about/newsroom/capital-one-completes-acquisition-of-brex/','Capital One · Brex-Übernahme abgeschlossen',None),
('novartis-avidity','Q507154','avidity','2026-02-27','https://www.novartis.com/news/media-releases/novartis-successfully-completes-acquisition-avidity-biosciences-strengthening-late-stage-neuroscience-pipeline-and-advancing-xrna-strategy','Novartis · Avidity-Übernahme abgeschlossen',None),
('holcim-xella','Q16466481','Q535956','2026-06-19','https://www.holcim.com/media/media-releases/holcim-completes-acquisition-xella','Holcim · Xella-Übernahme abgeschlossen',None),
('abb-netcontrol','Q52825','netcontrol','2026-05-05','https://new.abb.com/news/detail/134832/abb-completes-netcontrol-acquisition-expanding-grid-automation-offering-for-utilities','ABB · Netcontrol-Übernahme abgeschlossen',None),
('gsk-rapt','Q212322','rapt','2026-03-03','https://www.gsk.com/en-gb/media/press-releases/gsk-completes-acquisition-of-rapt-therapeutics/','GSK · RAPT-Übernahme abgeschlossen',None),
('abbott-exact','Q306764','Q22121866','2026-03-23','https://abbott.mediaroom.com/2026-03-23-Abbott-completes-acquisition-of-Exact-Sciences','Abbott · Exact-Sciences-Übernahme abgeschlossen',None),
('marvell-celestial','Q1347782','celestial','2026-02-02','https://www.marvell.com/company/newsroom/marvell-completes-acquisition-of-celestial-ai.html','Marvell · Celestial-AI-Übernahme abgeschlossen',None)
]
deals=[{'id':r[0],'buyerId':r[1],'targetId':r[2],'completedOn':r[3],'status':'completed','sourceUrl':r[4],'sourceTitle':r[5],'note':r[6]} for r in rows]
# Worldwide supplement, reviewed on 2026-09-06. No inferred relationships.
world=json.loads((ROOT/'data/world-acquisitions.json').read_text())
for e in world['entities']:
    if 'existing' in e:existing(e['existing'],e.get('name'))
    else:addition(e['id'],e['name'],e['place'],e['locationSourceUrl'])
deals.extend(world['deals'])
regions={'Europa':['Schweiz','Deutschland','Finnland','Vereinigtes Königreich','Irland','Schweden'],
         'Nordamerika':['Vereinigte Staaten','Kanada'],
         'Südamerika':['Brasilien','Kolumbien','Peru'],
         'Afrika':['Südafrika','Kenia'],
         'Asien':['Japan','Indien','Volksrepublik China','Singapur'],
         'Ozeanien':['Australien']}
for e in entities.values():
    e['region']=next(k for k,v in regions.items() if e['country'] in v)
for d in deals:
    d.setdefault('kind','company')
    d['regions']=sorted({entities[d[k]]['region'] for k in ['buyerId','targetId']})
deals.sort(key=lambda d:d['completedOn'],reverse=True)
for d in deals:
    assert d['buyerId'] in entities and d['targetId'] in entities
    assert '2026-01-01'<=d['completedOn']<='2026-09-06'
output={'meta':{'year':2026,'asOf':'2026-09-06','complete':False,'verifiedDealCount':len(deals),'sourceCompanyCount':len(companies),'regionCount':len(set(e['region'] for e in entities.values())),'countryCount':len(set(e['country'] for e in entities.values())),'scope':'Curated worldwide selection of completed acquisitions, confirmed by buyer releases or issuer SEC filings. Not an exhaustive global M&A database. Arrows show buyer to acquired company, not seller or physical routes. Headquarters/locality coordinates are geographic reference points, not a historical legal-domicile audit.'},'entities':entities,'deals':deals}
(ROOT/'dist/assets/acquisitions.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print(f"Built {len(deals)} sourced completed acquisitions; {len(entities)} endpoints; reused {len(companies)} company records unchanged.")
