import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {discoverSoldComparables,ensureSoldDataAccess,SoldDataError} from '../../../../lib/rv-cma-provider';
export const runtime='nodejs';
const fail=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:NextRequest){
 const auth=request.headers.get('authorization')||'';
 if(!/^Bearer \S{20,}$/.test(auth))return fail('Sign in required',401);
 if(Number(request.headers.get('content-length')||0)>4000)return fail('Request too large',413);
 let body:Record<string,unknown>;
 try{const raw=await request.text();if(raw.length>4000)return fail('Request too large',413);body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))return fail('Invalid input',400)}
 catch{return fail('Invalid JSON',400)}
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!url||!anon)return fail('Supabase is not configured',503);
 const token=auth.slice(7);
 const db=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
 const {data:{user},error}=await db.auth.getUser(token);
 if(error||!user)return fail('Session expired',401);
 try{
  ensureSoldDataAccess(user.id);
  // Best-effort quota using existing SQL 032 usage ledger; protect paid upstream lookups.
  const {count,error:quotaError}=await db.from('rv_ai_generations').select('id',{count:'exact',head:true}).eq('user_id',user.id).gte('created_at',new Date(Date.now()-3600000).toISOString());
  if(quotaError)throw new SoldDataError('SQL 032 usage table is not accessible.',503);
  if((count||0)>=15)throw new SoldDataError('CMA lookup/report quota reached (15 requests per hour).',429);
  const address=typeof body.address==='string'?body.address.trim():'';
  if(address.length>200)return fail('Address is too long',400);
  const result=await discoverSoldComparables({address,bedrooms:Number(body.bedrooms),bathrooms:Number(body.bathrooms),areaSqft:body.areaSqft===null||body.areaSqft===undefined||body.areaSqft===''?undefined:Number(body.areaSqft)});
  const {error:saveError}=await db.from('rv_ai_generations').insert({user_id:user.id,mode:'cma'});
  if(saveError)throw new SoldDataError('MLS search succeeded but usage could not be recorded. Check SQL 032.',503);
  return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return fail(e instanceof SoldDataError?e.message:'Could not search MLS sold data.',e instanceof SoldDataError?e.status:500)}
}
