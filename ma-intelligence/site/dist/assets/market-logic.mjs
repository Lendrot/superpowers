export const statuses={completed:{label:'Abgeschlossen',color:0xd6f391,css:'#d6f391'},pending:{label:'Angebot / vereinbart',color:0xffb65c,css:'#ffb65c'},interest:{label:'Kaufabsicht',color:0xc4a1ff,css:'#c4a1ff'}};
export const regionCountries={Europa:['Deutschland','Schweiz','Frankreich','Niederlande','Italien','Finnland','Schweden','Irland','Vereinigtes Königreich','Österreich','Spanien','Polen','Belgien','Dänemark','Norwegen','Portugal'],Nordamerika:['Vereinigte Staaten','Kanada','Mexiko'],Südamerika:['Brasilien','Kolumbien','Peru','Chile','Argentinien'],Afrika:['Südafrika','Kenia','Ägypten','Nigeria','Marokko'],Asien:['Indien','Japan','Volksrepublik China','China','Singapur','Taiwan','Südkorea','Israel','Hongkong'],Ozeanien:['Australien','Neuseeland']};
const contains=(s,q)=>String(s||'').toLocaleLowerCase('de').includes(q.toLocaleLowerCase('de'));
export function companyRegion(c,region){if(region==='all')return true;if(region==='Deutschland')return c.location?.country==='Deutschland'||(!c.location&&c.deIsin);return (regionCountries[region]||[]).includes(c.location?.country);}
export function filterMarket(data,filter){
 const {region='Deutschland',sector='all',status='all',query=''}=filter;
 const deals=data.deals.filter(d=>(region==='all'||(region==='Deutschland'?d.countries.includes('Deutschland'):d.regions.includes(region)))&&(sector==='all'||d.sectors.includes(sector))&&(status==='all'||d.status===status)&&(!query||[data.entities[d.buyerId].name,data.entities[d.targetId].name].some(n=>contains(n,query))));
 const related=new Set(deals.flatMap(d=>[d.buyerId,d.targetId]));
 const companies=data.companies.filter(c=>companyRegion(c,region)&&(sector==='all'||c.sectors.includes(sector))&&(!query||contains(c.name,query)||c.isins?.some(i=>contains(i,query)))&&(status==='all'||status==='listed'&&['reference','reported','unverified'].includes(c.listingStatus)||related.has(c.id)));
 return {deals,companies};
}
