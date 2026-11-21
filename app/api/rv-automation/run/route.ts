import {NextRequest,NextResponse} from 'next/server';
import {createClient} from '@supabase/supabase-js';
import {createHash,timingSafeEqual} from 'node:crypto';
import {fillTemplate,type AutomationAction} from '../../../../lib/rv-automation';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(body:Record<string,unknown>,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
const sameSecret=(actual:string,expected:string)=>{
  const a=createHash('sha256').update(actual).digest();
  const b=createHash('sha256').update(expected).digest();
  return timingSafeEqual(a,b);
};

type Step={id:string;workflow_id:string;action_type:AutomationAction;config:Record<string,unknown>;position:number};
type Run={id:string;user_id:string;workflow_id:string;contact_id:string;trigger_type:string;status:string};
type Contact={id:string;user_id:string;full_name:string;contact_type:string;preferred_area:string;stage:string;communication_consent:string};
function prop(config:Record<string,unknown>,key:string,max:number){
  const value=config[key];return typeof value==='string'?value.slice(0,max):'';
}

export async function POST(request:NextRequest){
  const secret=process.env.REALVOLT_AUTOMATION_CRON_SECRET;
  const supplied=request.headers.get('authorization')||'';
  if(!secret || secret.length < 24)return reply({error:'Automation cron secret is not configured (minimum 24 characters)'},503);
  if(!supplied.startsWith('Bearer ')||!sameSecret(supplied.slice(7),secret))return reply({error:'Not authorized'},401);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url || !key)return reply({error:'Server-side Supabase credentials are not configured'},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:claimed,error:claimError}=await db.rpc('rv_auto_claim_due_jobs',{p_limit:10});
  if(claimError)return reply({error:'Could not claim jobs. Check migration and server configuration.',detail:claimError.message},503);
  const completed:string[]=[];const failed:string[]=[];const stopped:string[]=[];
  for(const claimedJob of (claimed||[]) as Array<{job_id:string}>){
    const id=claimedJob.job_id;
    try{
      const {data:job,error:jobError}=await db.from('rv_auto_jobs').select('id,run_id,step_id,status').eq('id',id).single();
      if(jobError||!job||job.status!=='processing')throw new Error('Job not found or not locked');
      const [{data:run,error:runError},{data:step,error:stepError}]=await Promise.all([
        db.from('rv_auto_runs').select('id,user_id,workflow_id,contact_id,trigger_type,status').eq('id',job.run_id).single(),
        db.from('rv_auto_steps').select('id,workflow_id,action_type,config,position').eq('id',job.step_id).single(),
      ]);
      if(runError||stepError||!run||!step)throw new Error('Workflow steps or run missing');
      const safeRun=run as Run; const safeStep=step as Step;
      const [{data:workflow,error:workflowError},{data:contact,error:contactError}]=await Promise.all([
        db.from('rv_auto_workflows').select('id,user_id,enabled').eq('id',safeRun.workflow_id).single(),
        db.from('crm_contacts').select('id,user_id,full_name,contact_type,preferred_area,stage,communication_consent').eq('id',safeRun.contact_id).single(),
      ]);
      if(workflowError||contactError||!workflow||!contact)throw new Error('Workflow or contact not accessible');
      const c=contact as Contact;
      if(workflow.user_id!==safeRun.user_id||safeStep.workflow_id!==safeRun.workflow_id||c.user_id!==safeRun.user_id)
        throw new Error('Workflow/contact ownership mismatch');
      if(!workflow.enabled || safeRun.status!=='running' || c.stage==='Lost' || (c.stage==='Closed' && safeRun.trigger_type==='contact_created')){
        const {error}=await db.rpc('rv_auto_abort_job',{p_job_id:id,p_reason:'Workflow paused, stopped or contact no longer active',p_permanent:true});
        if(error)throw error;
        stopped.push(id);continue;
      }
      let result='';
      if(safeStep.action_type==='create_task'){
        const title=fillTemplate(prop(safeStep.config,'title',250),c).trim().slice(0,250);
        if(!title)throw new Error('Task title missing');
        const priority=safeStep.config.priority==='High'?'High':'Normal';
        const {error}=await db.from('crm_tasks').upsert({rv_auto_job_id:id,user_id:c.user_id,contact_id:c.id,title,
          priority,due_date:new Date().toISOString().slice(0,10),completed:false},{onConflict:'rv_auto_job_id',ignoreDuplicates:true});
        if(error)throw error;
        result='Created follow-up task';
      }else if(safeStep.action_type==='add_note'){
        const body=fillTemplate(prop(safeStep.config,'body',9500),c).trim().slice(0,10000);
        if(!body)throw new Error('Note body missing');
        const {error}=await db.from('crm_notes').upsert({rv_auto_job_id:id,user_id:c.user_id,contact_id:c.id,body,activity_type:'Note'},
          {onConflict:'rv_auto_job_id',ignoreDuplicates:true});
        if(error)throw error;
        result='Added CRM note';
      }else if(safeStep.action_type==='draft_email'){
        if(c.communication_consent==='Opted out'){
          result='Email draft skipped: contact opted out';
        }else{
          const subject=fillTemplate(prop(safeStep.config,'subject',250),c).trim().slice(0,250);
          const body=fillTemplate(prop(safeStep.config,'body',5000),c).trim().slice(0,5000);
          if(!subject||!body)throw new Error('Email subject or body missing');
          const {error}=await db.from('rv_auto_email_drafts').upsert({user_id:c.user_id,contact_id:c.id,job_id:id,subject,body,status:'draft'},
            {onConflict:'job_id',ignoreDuplicates:true});
          if(error)throw error;
          result='Email draft created; no message sent';
        }
      }else if(safeStep.action_type==='wait'){
        result='Delay complete';
      }else throw new Error('Unsupported step type');
      const {error:finishError}=await db.rpc('rv_auto_finish_job',{p_job_id:id,p_result:result});
      if(finishError)throw finishError;
      completed.push(id);
    }catch(e){
      const reason=(e instanceof Error?e.message:String(e)).slice(0,600);
      const {error:failError}=await db.rpc('rv_auto_abort_job',{p_job_id:id,p_reason:reason,p_permanent:false});
      failed.push(id);
      if(failError)console.error('Could not reschedule automation job',id,failError.message);
    }
  }
  return reply({claimed:(claimed||[]).length,completed:completed.length,retryScheduled:failed.length,stopped:stopped.length});
}
