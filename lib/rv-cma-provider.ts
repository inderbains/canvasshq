/** Server-only adapter for explicitly licensed Repliers MLS sold data.
 * No scraping, no made-up sold records, no client API key, no persistent MLS cache.
 */
import 'server-only';

export type DiscoveredComparable = {
  mlsNumber:string; address:string; soldPrice:number; soldDate:string; areaSqft:number;
  bedrooms:number|null; bathrooms:number|null; propertyType:string|null; distanceKm:number|null;
};
export type ComparableSearch = {
  provider:'Repliers'; asOf:string; subject:{address:string; mlsNumber:string|null;
    areaSqft:number|null; bedrooms:number|null; bathrooms:number|null; propertyType:string|null;
    yearBuilt:number|null;};
  comparables:DiscoveredComparable[]; warnings:string[];
};
export class SoldDataError extends Error {
  constructor(message:string,public status=422){super(message);this.name='SoldDataError'}
}

type Listing = {
  mlsNumber?:unknown;status?:unknown;lastStatus?:unknown;type?:unknown;soldPrice?:unknown;soldDate?:unknown;
  updatedOn?:unknown;listDate?:unknown;
  address?:{streetNumber?:unknown;streetName?:unknown;streetSuffix?:unknown;streetDirection?:unknown;unitNumber?:unknown;city?:unknown;state?:unknown;zip?:unknown};
  map?:{latitude?:unknown;longitude?:unknown};
  details?:{sqft?:unknown;numBedrooms?:unknown;numBedroomsPlus?:unknown;numBathrooms?:unknown;propertyType?:unknown;yearBuilt?:unknown};
};
const text=(v:unknown)=>typeof v==='string'?v.trim():typeof v==='number'?String(v):'';
const positive=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>0?n:null};
const validId=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_-]{2,40}$/.test(v);
const date=(v:unknown)=>{const d=text(v).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))?d:''};
const daysAgo=(n:number)=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
const same=(a:unknown,b:unknown)=>text(a).toLowerCase().replace(/[^a-z0-9]/g,'')===text(b).toLowerCase().replace(/[^a-z0-9]/g,'');
const km=(a:number,b:number,c:number,d:number)=>{const r=Math.PI/180;const x=(c-a)*r,y=(d-b)*r,h=Math.sin(x/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin(y/2)**2;return Math.round(2*6371*Math.asin(Math.sqrt(h))*100)/100};

export function parseCivicAddress(value:string){
  const address=value.trim().slice(0,200);
  const [street,city,province]=address.split(',').map(x=>x.trim());
  if(!street||!city||street.length>100||city.length>65)throw new SoldDataError('Enter a full civic address including city, e.g. 5928 140A St, Surrey, BC.');
  const match=street.match(/^(?:#?([A-Za-z0-9-]{1,12})\s*[-,]\s*)?(\d{1,7})\s+(.+)$/);
  if(!match)throw new SoldDataError('Use street number and street name, followed by city.');
  let name=match[3].trim();
  const suffix=name.match(/\s+(St(?:reet)?|Ave(?:nue)?|Rd|Road|Dr(?:ive)?|Blvd|Boulevard|Cres(?:cent)?|Pl(?:ace)?|Ct|Court|Way|Lane|Ln|Terrace|Trail|Trl)$/i);
  if(suffix)name=name.slice(0,-suffix[0].length).trim();
  if(!name||!/[a-z0-9]/i.test(name))throw new SoldDataError('Enter a valid street name.');
  return {address,streetNumber:match[2],streetName:name,streetSuffix:suffix?suffix[1]:'',city,province:province||'',unit:match[1]||''};
}
export function cmaDataEnabled(userId:string,env:NodeJS.ProcessEnv=process.env){
  const allowed=(env.REALVOLT_CMA_ALLOWED_USER_IDS||'').split(',').map(s=>s.trim()).filter(Boolean);
  return env.REALVOLT_CMA_SOLD_DATA_APPROVED==='true'&&!!env.REPLIERS_API_KEY&&allowed.includes(userId);
}
export function ensureSoldDataAccess(userId:string){
  if(!cmaDataEnabled(userId))throw new SoldDataError('Automatic sold-data lookup is not active for this account. An authorized Repliers MLS feed and account approval are required. You can still enter verified sales manually.',403);
}
function addressOf(l:Listing){
  const a=l.address||{};
  return [ [text(a.unitNumber),text(a.streetNumber),text(a.streetName),text(a.streetSuffix),text(a.streetDirection)].filter(Boolean).join(' '),text(a.city),text(a.state)].filter(Boolean).join(', ').slice(0,200);
}
function acceptableSold(l:Listing){
  const p=positive(l.soldPrice),sq=positive(l.details?.sqft),d=date(l.soldDate);
  return text(l.status).toUpperCase()==='U'&&text(l.lastStatus).toLowerCase()==='sld'&&
    text(l.type).toLowerCase()==='sale'&&validId(l.mlsNumber)&&p!==null&&p>=10000&&p<=100000000&&
    sq!==null&&sq>=200&&sq<=30000&&!!d&&d<=daysAgo(0)&&d>=daysAgo(365);
}
function matchExactSubject(l:Listing,a:ReturnType<typeof parseCivicAddress>){
  const ad=l.address||{};
  return same(ad.streetNumber,a.streetNumber)&&same(ad.streetName,a.streetName)&&same(ad.city,a.city)&&
    (!a.streetSuffix||!ad.streetSuffix||same(ad.streetSuffix,a.streetSuffix)||same(text(ad.streetSuffix).slice(0,2),text(a.streetSuffix).slice(0,2)))&&
    (!a.unit||same(ad.unitNumber,a.unit));
}
function listToComparable(l:Listing,subjectLatitude:number,subjectLongitude:number):DiscoveredComparable{
  const lat=Number(l.map?.latitude),lon=Number(l.map?.longitude);
  const distance=Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lon)&&Math.abs(lon)<=180?km(subjectLatitude,subjectLongitude,lat,lon):null;
  return {mlsNumber:text(l.mlsNumber),address:addressOf(l),soldPrice:positive(l.soldPrice)!,soldDate:date(l.soldDate),
    areaSqft:positive(l.details?.sqft)!,bedrooms:positive(l.details?.numBedrooms)!==null?Number(l.details?.numBedrooms):null,
    bathrooms:positive(l.details?.numBathrooms)!==null?Number(l.details?.numBathrooms):null,
    propertyType:text(l.details?.propertyType)||null,distanceKm:distance};
}
async function search(params:URLSearchParams):Promise<Listing[]>{
  const url='https://api.repliers.io/listings?'+params.toString();
  let response:Response;
  try{response=await fetch(url,{headers:{'REPLIERS-API-KEY':process.env.REPLIERS_API_KEY!,'Accept':'application/json'},cache:'no-store',signal:AbortSignal.timeout(15000)});}catch{throw new SoldDataError('The authorized MLS provider did not respond. Try again later.',502)}
  if(response.status===401||response.status===403)throw new SoldDataError('Your sold-listing API key does not have the necessary authorization. Confirm MLS sold-data access with your provider.',503);
  if(!response.ok)throw new SoldDataError('MLS listing lookup is temporarily unavailable.',502);
  let data:unknown;try{data=await response.json()}catch{throw new SoldDataError('MLS provider returned an unreadable response.',502)}
  if(!data||typeof data!=='object'||!Array.isArray((data as {listings?:unknown}).listings))throw new SoldDataError('MLS provider returned an unexpected response format.',502);
  return ((data as {listings:unknown[]}).listings.slice(0,200).filter(x=>x&&typeof x==='object')) as Listing[];
}
export async function discoverSoldComparables(input:{address:string;bedrooms:number;bathrooms:number;areaSqft?:number}):Promise<ComparableSearch>{
  const a=parseCivicAddress(input.address);
  if(!Number.isInteger(input.bedrooms)||input.bedrooms<0||input.bedrooms>30||!Number.isFinite(input.bathrooms)||input.bathrooms<0||input.bathrooms>30)throw new SoldDataError('Enter valid bedroom and bathroom counts.');
  if(input.areaSqft!==undefined&&(!Number.isFinite(input.areaSqft)||input.areaSqft<200||input.areaSqft>30000))throw new SoldDataError('Enter valid finished square footage, or leave it blank.');
  const subjects=new URLSearchParams({streetNumber:a.streetNumber,streetName:a.streetName,city:a.city,resultsPerPage:'40',type:'sale'});
  subjects.append('status','A');subjects.append('status','U');
  const history=(await search(subjects)).filter(l=>matchExactSubject(l,a)).sort((x,y)=>(text(y.updatedOn)||text(y.listDate)||text(y.soldDate)).localeCompare(text(x.updatedOn)||text(x.listDate)||text(x.soldDate)));
  const subject=history.find(l=>Number.isFinite(Number(l.map?.latitude))&&Number.isFinite(Number(l.map?.longitude)))||history[0];
  if(!subject)throw new SoldDataError('No exact MLS history was found for that address. Confirm the civic address or use the manual comparable-entry option.');
  const latitude=Number(subject.map?.latitude),longitude=Number(subject.map?.longitude);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<=-90||latitude>=90||longitude<=-180||longitude>=180)throw new SoldDataError('MLS history was found, but it has no usable coordinates for searching nearby sales. Use manual comparables.');
  const propertyType=text(subject.details?.propertyType);
  const subjectAreaSqft=input.areaSqft||positive(subject.details?.sqft);
  const params=new URLSearchParams({status:'U',lastStatus:'Sld',lat:String(latitude),long:String(longitude),radius:'5',minSoldDate:daysAgo(365),maxSoldDate:daysAgo(0),type:'sale',resultsPerPage:'100',sortBy:'soldDateDesc'});
  const raw=await search(params);
  const seen=new Set<string>();
  const comps=raw.filter(l=>acceptableSold(l)&&!matchExactSubject(l,a)).map(l=>listToComparable(l,latitude,longitude))
   .filter(c=>{
     const key=c.address.toLowerCase().replace(/[^a-z0-9]/g,'')+c.soldDate;
     if(seen.has(key))return false;seen.add(key);return true;
   })
   .filter(c=>(!propertyType||!c.propertyType||same(c.propertyType,propertyType)) &&
     (!subjectAreaSqft||c.areaSqft>=subjectAreaSqft*.65&&c.areaSqft<=subjectAreaSqft*1.5)&&
     (c.bedrooms===null||Math.abs(c.bedrooms-input.bedrooms)<=2)&&
     (c.bathrooms===null||Math.abs(c.bathrooms-input.bathrooms)<=3))
   .sort((x,y)=>{
     const score=(c:DiscoveredComparable)=>{
       const age=(Date.now()-Date.parse(c.soldDate+'T00:00:00Z'))/86400000;
       return (c.distanceKm??10)*2+age/45+(c.bedrooms===null?2:Math.abs(c.bedrooms-input.bedrooms)*2)+
         (subjectAreaSqft?Math.abs(Math.log(c.areaSqft/subjectAreaSqft))*10:0);
     };
     return score(x)-score(y)
   }).slice(0,60);
  const warnings=[
    'MLS soldDate is the provider-reported sale/status date; it is not necessarily the legal completion date.',
    'Sold prices and dates require agent review and may be subject to MLS display/use restrictions.',
  ];
  if(!input.areaSqft&&subjectAreaSqft)warnings.push('Subject finished area came from historical MLS data. Verify it before preparing the CMA.');
  if(comps.length<3)warnings.push('Fewer than three comparable sold records match the filters; try manual MLS selection or broaden the search with agent judgment.');
  if(!subjectAreaSqft)warnings.push('Subject floor area is unavailable from the feed. Enter confirmed finished square footage to calculate a CMA.');
  return {provider:'Repliers',asOf:new Date().toISOString(),subject:{address:a.address,mlsNumber:validId(subject.mlsNumber)?text(subject.mlsNumber):null,
    areaSqft:subjectAreaSqft||null,bedrooms:positive(subject.details?.numBedrooms),bathrooms:positive(subject.details?.numBathrooms),
    propertyType:propertyType||null,yearBuilt:positive(subject.details?.yearBuilt)},comparables:comps,warnings};
}

/** Server-side re-query prevents clients from fabricating sale prices while claiming MLS provenance. */
export async function verifySelectedSales(input:{address:string;bedrooms:number;bathrooms:number;areaSqft?:number},ids:string[]){
  if(ids.length<3||ids.length>12||!ids.every(validId)||new Set(ids).size!==ids.length)throw new SoldDataError('Select 3–12 different comparable MLS listings.');
  const found=await discoverSoldComparables(input);
  const map=new Map(found.comparables.map(c=>[c.mlsNumber,c]));
  const selected=ids.map(id=>map.get(id));
  if(selected.some(c=>!c))throw new SoldDataError('Some selected MLS sales were not verified in the latest provider search. Search again and reselect.');
  return {discovery:found,sales:selected as DiscoveredComparable[]};
}
