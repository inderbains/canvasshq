import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=fs.readFileSync(new URL('../lib/rv-cma-provider.ts',import.meta.url),'utf8');
const transpiled=ts.transpileModule(code,{fileName:'rv-cma-provider.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('module','exports','require',transpiled)(mod,mod.exports,(name)=>{if(name==='server-only')return {};throw new Error(`Unexpected dependency ${name}`)});
const {parseCivicAddress,cmaDataEnabled,discoverSoldComparables,verifySelectedSales,SoldDataError}=mod.exports;
const dateAgo=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
const subject={mlsNumber:'R123123',status:'U',lastStatus:'Sld',type:'Sale',updatedOn:'2026-06-21',address:{streetNumber:'5928',streetName:'140A',streetSuffix:'St',city:'Surrey',state:'BC'},map:{latitude:49.111,longitude:-122.833},details:{sqft:'3745',numBedrooms:'9',numBathrooms:'6',propertyType:'Detached',yearBuilt:'2020'}};
const sold=(id,num,price,area,days,props={})=>({mlsNumber:id,status:'U',lastStatus:'Sld',type:'Sale',soldPrice:price,soldDate:dateAgo(days),address:{streetNumber:String(num),streetName:'140',streetSuffix:'St',city:'Surrey',state:'BC'},map:{latitude:49.109,longitude:-122.832},details:{sqft:String(area),numBedrooms:8,numBathrooms:6,propertyType:'Detached'},...props});
const good=[sold('R100001',6176,1565000,3887,30),sold('R100002',5906,1498000,4019,45),sold('R100003',5808,1530000,3596,80),sold('R100004',6100,1700000,4000,90)];
const originalFetch=globalThis.fetch;
function stubFetch(){
 const queries=[];
 globalThis.fetch=async url=>{
  const params=new URL(url).searchParams;queries.push(params);
  const isSubject=params.has('streetNumber');
  return {ok:true,status:200,json:async()=>({listings:isSubject?[subject]:[
   ...good,
   sold('R_UNSOLD',6500,1200000,3700,5,{lastStatus:'Sc'}),
   sold('R_NO_AREA',6501,1200000,3700,5,{details:{sqft:null}}),
   sold('R_OLD',6502,1200000,3700,420),
   sold('R_WRONGTYPE',6503,1200000,3700,25,{details:{sqft:'3700',numBedrooms:9,numBathrooms:5,propertyType:'Condo'}}),
   sold('R_SAME',5928,1500000,3745,10,{address:{streetNumber:'5928',streetName:'140A',streetSuffix:'St',city:'Surrey',state:'BC'}}),
  ]})};
 };
 return queries;
}
test.after(()=>{globalThis.fetch=originalFetch});
test('Parses civic addresses but requires city',()=>{
 assert.deepEqual(parseCivicAddress('5928 140A St, Surrey, BC').streetName,'140A');
 assert.equal(parseCivicAddress('#310 - 14356 60 Ave, Surrey, BC').unit,'310');
 assert.throws(()=>parseCivicAddress('5928 140A St'),SoldDataError);
});
test('Sold data stays disabled without authorization and user allowlist',()=>{
 assert.equal(cmaDataEnabled('userA',{REPLIERS_API_KEY:'key',REALVOLT_CMA_SOLD_DATA_APPROVED:'true',REALVOLT_CMA_ALLOWED_USER_IDS:'userB'}),false);
 assert.equal(cmaDataEnabled('userA',{REPLIERS_API_KEY:'key',REALVOLT_CMA_SOLD_DATA_APPROVED:'true',REALVOLT_CMA_ALLOWED_USER_IDS:'userA,userB'}),true);
});
test('Finds subject area from its own MLS history, excludes fake / wrong / old listings',async()=>{
 const queries=stubFetch();
 const found=await discoverSoldComparables({address:'5928 140A St, Surrey, BC',bedrooms:9,bathrooms:6});
 assert.equal(found.subject.areaSqft,3745);
 assert.equal(found.subject.propertyType,'Detached');
 assert.equal(found.comparables.length,4);
 assert.deepEqual(new Set(found.comparables.map(c=>c.mlsNumber)),new Set(good.map(c=>c.mlsNumber)));
 assert.equal(queries.length,2);
 assert.equal(queries[1].get('status'),'U');
 assert.equal(queries[1].get('lastStatus'),'Sld');
 assert.ok(found.warnings.some(w=>w.includes('not necessarily the legal completion date')));
});
test('Selected comparables reverified, unknown and duplicate IDs rejected',async()=>{
 stubFetch();
 const input={address:'5928 140A St, Surrey, BC',bedrooms:9,bathrooms:6};
 const verified=await verifySelectedSales(input,['R100001','R100002','R100003']);
 assert.equal(verified.sales[0].soldPrice,1565000);
 await assert.rejects(verifySelectedSales(input,['R100001','FAKE111','R100003']),SoldDataError);
 await assert.rejects(verifySelectedSales(input,['R100001','R100001','R100003']),SoldDataError);
});
test('Provider does not silently continue when no exact address matches',async()=>{
 globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({listings:[]})});
 await assert.rejects(discoverSoldComparables({address:'5928 140A St, Surrey, BC',bedrooms:9,bathrooms:6}),/No exact MLS history/);
});
