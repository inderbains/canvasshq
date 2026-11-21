'use client';

import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {Activity,ArrowRight,Check,ChevronDown,ClipboardList,Clock3,Copy,Mail,Pause,Play,Plus,RefreshCcw,ShieldCheck,Trash2,Workflow,Zap} from 'lucide-react';
import {getSupabase} from '../lib/supabase';
import {actionLabels,defaultSteps,fillTemplate,type AutomationAction} from '../lib/rv-automation';
import MarketingAutomation from './marketing-automation';
import styles from './crm-automation-engine.module.css';

type Trigger='contact_created'|'stage_changed';
type WorkflowRow={id:string;user_id:string;name:string;enabled:boolean;trigger_type:Trigger;trigger_stage:string|null;trigger_contact_type:string|null;created_at:string};
type StepRow={id:string;workflow_id:string;position:number;delay_minutes:number;action_type:AutomationAction;config:Record<string,unknown>};
type JobRow={id:string;run_id:string;status:string;result_text:string;last_error:string|null;scheduled_for:string;created_at:string};
type RunRow={id:string;workflow_id:string;contact_id:string;status:string;started_at:string};
type DraftRow={id:string;contact_id:string;subject:string;body:string;status:string;created_at:string};
type ContactRow={id:string;full_name:string;contact_type:string;preferred_area:string;stage:string};
type EditableStep={key:number;action_type:AutomationAction;delay_minutes:number;config:Record<string,unknown>};
const delays=[{value:0,label:'Immediately'},{value:15,label:'15 minutes later'},{value:60,label:'1 hour later'},{value:1440,label:'1 day later'},{value:2880,label:'2 days later'},{value:4320,label:'3 days later'},{value:10080,label:'7 days later'}];
const stages=['New','Contacted','Qualified','Active','Under contract','Closed','Lost'];
let stepKey=100;
const buildDefaults=():EditableStep[]=>defaultSteps.map(s=>({key:++stepKey,...s,config:{...s.config}}));
const displayWhen=(n:number)=>delays.find(d=>d.value===n)?.label || `${n} minutes later`;
const showDate=(d:string)=>new Date(d).toLocaleString('en-CA',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const cleanSteps=(steps:EditableStep[])=>steps.map((s,i)=>({position:i+1,delay_minutes:s.delay_minutes,action_type:s.action_type,config:s.action_type==='create_task'?{title:String(s.config.title||'Follow up with {{full_name}}'),priority:s.config.priority==='High'?'High':'Normal'}:s.action_type==='add_note'?{body:String(s.config.body||'')}:s.action_type==='draft_email'?{subject:String(s.config.subject||''),body:String(s.config.body||'')}:{}}));

export default function CRMAutomationEngine({userId,notify}:{userId:string;notify:(s:string)=>void}){
  const [tab,setTab]=useState<'workflows'|'drafts'|'activity'|'listing'>('workflows');
  const [workflows,setWorkflows]=useState<WorkflowRow[]>([]);
  const [steps,setSteps]=useState<StepRow[]>([]);
  const [jobs,setJobs]=useState<JobRow[]>([]);
  const [runs,setRuns]=useState<RunRow[]>([]);
  const [drafts,setDrafts]=useState<DraftRow[]>([]);
  const [contacts,setContacts]=useState<ContactRow[]>([]);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [editing,setEditing]=useState(false);
  const [workflowName,setWorkflowName]=useState('New buyer inquiry follow-up');
  const [trigger,setTrigger]=useState<Trigger>('contact_created');
  const [stage,setStage]=useState('');
  const [contactType,setContactType]=useState('Buyer');
  const [editingSteps,setEditingSteps]=useState<EditableStep[]>(buildDefaults);
  const [preview,setPreview]=useState<string|null>(null);
  const [previewWorkflow,setPreviewWorkflow]=useState<WorkflowRow|null>(null);

  const load=useCallback(async()=>{
    const db=getSupabase();if(!db){setError('Supabase is not configured.');setLoading(false);return;}
    setLoading(true);
    const [a,b,c,d,e,f]=await Promise.all([
      db.from('rv_auto_workflows').select('id,user_id,name,enabled,trigger_type,trigger_stage,trigger_contact_type,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(100),
      db.from('rv_auto_steps').select('id,workflow_id,position,delay_minutes,action_type,config').eq('user_id',userId).order('position'),
      db.from('rv_auto_jobs').select('id,run_id,status,result_text,last_error,scheduled_for,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(60),
      db.from('rv_auto_runs').select('id,workflow_id,contact_id,status,started_at').eq('user_id',userId).order('started_at',{ascending:false}).limit(60),
      db.from('rv_auto_email_drafts').select('id,contact_id,subject,body,status,created_at').eq('user_id',userId).order('created_at',{ascending:false}).limit(60),
      db.from('crm_contacts').select('id,full_name,contact_type,preferred_area,stage').eq('user_id',userId).order('created_at',{ascending:false}).limit(100),
    ]);
    const failure=[a.error,b.error,c.error,d.error,e.error,f.error].find(Boolean);
    if(failure)setError(`${failure?.message} — Run the 023_crm_automation_engine.sql migration in your existing Supabase project.`);
    else{
      setError('');setWorkflows((a.data||[]) as WorkflowRow[]);setSteps((b.data||[]) as StepRow[]);
      setJobs((c.data||[]) as JobRow[]);setRuns((d.data||[]) as RunRow[]);
      setDrafts((e.data||[]) as DraftRow[]);setContacts((f.data||[]) as ContactRow[]);
    }
    setLoading(false);
  },[userId]);
  useEffect(()=>{void load()},[load]);
  const contactMap=useMemo(()=>new Map(contacts.map(c=>[c.id,c])),[contacts]);
  const runMap=useMemo(()=>new Map(runs.map(r=>[r.id,r])),[runs]);
  const workflowMap=useMemo(()=>new Map(workflows.map(w=>[w.id,w])),[workflows]);
  const counts={active:workflows.filter(w=>w.enabled).length,runs:runs.length,queued:jobs.filter(j=>j.status==='pending').length,drafts:drafts.filter(d=>d.status==='draft').length};

  function loadTemplate(kind:'buyer'|'qualified'|'seller'){
    if(kind==='buyer'){
      setWorkflowName('New buyer inquiry follow-up');setTrigger('contact_created');setStage('');setContactType('Buyer');setEditingSteps(buildDefaults());
    }else if(kind==='qualified'){
      setWorkflowName('Qualified lead – book appointment');setTrigger('stage_changed');setStage('Qualified');setContactType('');
      setEditingSteps([{key:++stepKey,action_type:'create_task',delay_minutes:0,config:{title:'Call {{full_name}} to arrange a consultation',priority:'High'}},
        {key:++stepKey,action_type:'draft_email',delay_minutes:0,config:{subject:'Next steps for your property search',body:'Hi {{first_name}},\n\nThank you for sharing your plans. I would be happy to arrange a conversation about your next steps. Please let me know a convenient time.\n\nBest regards'}}]);
    }else{
      setWorkflowName('New seller inquiry follow-up');setTrigger('contact_created');setStage('');setContactType('Seller');
      setEditingSteps([{key:++stepKey,action_type:'create_task',delay_minutes:0,config:{title:'Follow up on seller inquiry: {{full_name}}',priority:'High'}},
        {key:++stepKey,action_type:'draft_email',delay_minutes:0,config:{subject:'Your real estate plans, {{first_name}}',body:'Hi {{first_name}},\n\nThank you for reaching out about selling your property. I would be happy to discuss your goals and the next steps for a market evaluation. When would be a good time to connect?\n\nBest regards'}}]);
    }
    setPreview(null);setEditing(true);
  }

  function editStep(key:number,patch:Partial<EditableStep>){setEditingSteps(ss=>ss.map(s=>s.key===key?{...s,...patch}:s));}
  function editConfig(key:number,field:string,value:string){setEditingSteps(ss=>ss.map(s=>s.key===key?{...s,config:{...s.config,[field]:value}}:s));}
  async function createWorkflow(e:FormEvent){
    e.preventDefault();const db=getSupabase();if(!db||!editingSteps.length||busy)return;
    const name=workflowName.trim();if(name.length<3||name.length>100)return notify('Workflow name must contain 3–100 characters.');
    if(editingSteps.some(s=>s.action_type==='draft_email'&&(!String(s.config.subject||'').trim()||!String(s.config.body||'').trim())))return notify('Fill out the email subject and message.');
    if(editingSteps.some(s=>s.action_type==='create_task'&&!String(s.config.title||'').trim()))return notify('Fill out each task title.');
    if(editingSteps.some(s=>s.action_type==='add_note'&&!String(s.config.body||'').trim()))return notify('Fill out each note.');
    setBusy(true);
    const {data:w,error:workflowError}=await db.from('rv_auto_workflows').insert({user_id:userId,name,trigger_type:trigger,trigger_stage:trigger==='stage_changed'?(stage||null):null,trigger_contact_type:contactType||null,enabled:false}).select('id').single();
    if(workflowError||!w){notify(`Could not create workflow: ${workflowError?.message||'Unknown error'}`);setBusy(false);return;}
    const {error:stepError}=await db.from('rv_auto_steps').insert(cleanSteps(editingSteps).map(s=>({...s,workflow_id:w.id,user_id:userId})));
    if(stepError){notify(`Workflow saved disabled, but its steps failed: ${stepError.message}. Please check the SQL migration.`);}
    else{notify('Workflow saved OFF. Review and enable it when ready.');setEditing(false);setPreview(null);}
    await load();setBusy(false);
  }
  async function toggleWorkflow(w:WorkflowRow){
    if(busy)return;const db=getSupabase();if(!db)return;
    if(!steps.some(s=>s.workflow_id===w.id)){notify('Add at least one step before enabling.');return;}
    setBusy(true);
    const {error:saveError}=await db.from('rv_auto_workflows').update({enabled:!w.enabled,updated_at:new Date().toISOString()}).eq('id',w.id).eq('user_id',userId);
    notify(saveError?saveError.message:`${w.name} ${w.enabled?'paused':'enabled'}. Only new matching lead events enroll.`);
    await load();setBusy(false);
  }
  function showPreview(w:WorkflowRow){setPreviewWorkflow(w);setPreview(null);}
  function previewTextFor(w:WorkflowRow){
    const sample=contacts[0]||{id:'sample',full_name:'Alex Client',contact_type:'Buyer',stage:'New',preferred_area:'Surrey'};
    return steps.filter(s=>s.workflow_id===w.id).sort((a,b)=>a.position-b.position).map((s,i)=>{
      const head=`${i+1}. ${actionLabels[s.action_type]} — ${displayWhen(s.delay_minutes)}`;
      if(s.action_type==='create_task')return `${head}\n${fillTemplate(String(s.config.title||''),sample)}`;
      if(s.action_type==='add_note')return `${head}\n${fillTemplate(String(s.config.body||''),sample)}`;
      if(s.action_type==='draft_email')return `${head}\nSubject: ${fillTemplate(String(s.config.subject||''),sample)}\n${fillTemplate(String(s.config.body||''),sample)}`;
      return head;
    }).join('\n\n');
  }
  async function copyDraft(d:DraftRow){
    try{await navigator.clipboard.writeText(`Subject: ${d.subject}\n\n${d.body}`);notify('Email draft copied for review. Nothing was sent.');}
    catch{notify('Could not copy. Please copy the draft manually.');}
  }

  return <div className={styles.shell}>
    <div className={styles.heading}><div><p className={styles.eyebrow}>REALVOLT · CRM INTELLIGENCE</p><h1><Workflow size={25}/> Automation Studio</h1><p>Turn new inquiries and lead stages into reliable follow-ups, tasks and review-ready email drafts.</p></div><button className={styles.secondary} type="button" onClick={()=>void load()} disabled={loading}><RefreshCcw size={15}/> Refresh</button></div>
    <div className={styles.notice}><ShieldCheck size={20}/><span><b>Approval-first release.</b> Workflows create CRM tasks, notes and email <b>drafts only</b>. No emails, texts or social posts are sent automatically. A secure scheduled worker must be configured before live actions run.</span></div>
    <div className={styles.metrics}>
      {[['Active workflows',counts.active],['Recent enrollments',counts.runs],['Queued steps',counts.queued],['Email drafts',counts.drafts]].map(([name,count])=><div key={String(name)} className={styles.metric}><span>{name}</span><strong>{count}</strong></div>)}
    </div>
    <div className={styles.tabs} role="tablist" aria-label="Automation sections">
      {([['workflows','Workflows'],['drafts','Email drafts'],['activity','Activity log'],['listing','Listing rules']] as const).map(([key,title])=><button type="button" role="tab" aria-selected={tab===key} className={tab===key?styles.tabSelected:''} onClick={()=>{setTab(key);setEditing(false);setPreviewWorkflow(null)}} key={key}>{title}</button>)}
    </div>
    {error&&<div className={styles.error} role="alert">{error}</div>}
    {loading?<p className={styles.dim}>Loading automation data…</p>:tab==='listing'?<MarketingAutomation userId={userId} notify={notify}/>:tab==='workflows'?<>
      <div className={styles.toolbar}><div><h2>My workflows</h2><p className={styles.dim}>New automations are off until you explicitly enable them.</p></div><button className={styles.primary} type="button" onClick={()=>loadTemplate('buyer')} disabled={!!error}><Plus size={17}/> New workflow</button></div>
      {!workflows.length?<section className={styles.empty}><Zap size={32}/><h3>No CRM workflows yet</h3><p>Choose a starter template and customize every action before activating.</p><div className={styles.rowButtons}><button className={styles.primary} type="button" onClick={()=>loadTemplate('buyer')}>Buyer inquiry</button><button className={styles.secondary} type="button" onClick={()=>loadTemplate('qualified')}>Qualified lead</button><button className={styles.secondary} type="button" onClick={()=>loadTemplate('seller')}>Seller inquiry</button></div></section>:
        <div className={styles.workflowList}>{workflows.map(w=>{
          const ws=steps.filter(s=>s.workflow_id===w.id).sort((a,b)=>a.position-b.position);
          return <article className={styles.workflowCard} key={w.id}><div className={styles.cardTop}><div><div className={styles.cardTitle}><h3>{w.name}</h3><span className={w.enabled?styles.activeBadge:styles.inactiveBadge}>{w.enabled?'Active':'Paused'}</span></div><p>{w.trigger_type==='contact_created'?'New CRM contact':'Pipeline stage changed'}{w.trigger_stage?` → ${w.trigger_stage}`:''} · {w.trigger_contact_type||'All contact types'} · {ws.length} steps</p></div><div className={styles.rowButtons}><button className={styles.secondary} onClick={()=>showPreview(w)} type="button">Preview</button><button disabled={busy} className={w.enabled?styles.secondary:styles.primary} onClick={()=>void toggleWorkflow(w)} type="button">{w.enabled?<><Pause size={14}/> Pause</>:<><Play size={14}/> Enable</>}</button></div></div><div className={styles.stepSummary}>{ws.map((s,i)=><span key={s.id}>{i+1}. {actionLabels[s.action_type]} <small>{displayWhen(s.delay_minutes)}</small></span>)}</div></article>})}</div>}
      {previewWorkflow&&<section className={styles.preview}><div className={styles.toolbar}><h3>Preview: {previewWorkflow.name}</h3><button type="button" className={styles.secondary} onClick={()=>setPreviewWorkflow(null)}>Close</button></div><p>Sample data uses your most recent CRM contact, if available. Preview does not change any records or send email.</p><pre>{previewTextFor(previewWorkflow)||'No steps'}</pre></section>}
      {!editing&&workflows.length>0&&<div className={styles.templates}><span>Quick start:</span><button onClick={()=>loadTemplate('buyer')}>Buyer follow-up</button><button onClick={()=>loadTemplate('seller')}>Seller follow-up</button><button onClick={()=>loadTemplate('qualified')}>Qualified lead</button></div>}
      {editing&&<section className={styles.editor}><div className={styles.toolbar}><div><p className={styles.eyebrow}>NEW WORKFLOW</p><h2>Build your sequence</h2></div><button type="button" className={styles.secondary} onClick={()=>setEditing(false)}>Cancel</button></div>
        <form onSubmit={e=>void createWorkflow(e)}>
          <div className={styles.formTwo}><label>Workflow name<input required minLength={3} maxLength={100} value={workflowName} onChange={e=>setWorkflowName(e.target.value)}/></label><label>Run when<select value={trigger} onChange={e=>{setTrigger(e.target.value as Trigger);setStage('')}}><option value="contact_created">New CRM contact created</option><option value="stage_changed">Pipeline stage changes</option></select></label></div>
          {trigger==='stage_changed'&&<div className={styles.formTwo}><label>Only when new stage is<select value={stage} onChange={e=>setStage(e.target.value)}><option value="">Any stage</option>{stages.map(s=><option key={s} value={s}>{s}</option>)}</select></label></div>}
          <div className={styles.formTwo}><label>Contact type<select value={contactType} onChange={e=>setContactType(e.target.value)}><option value="">All contacts</option>{['Buyer','Seller','Buyer & seller','Agent','Service provider','Other'].map(t=><option value={t} key={t}>{t}</option>)}</select></label></div>
          <h3>Automation steps</h3><p className={styles.dim}>Delays are counted from the previous step; the first delay is counted from when the lead event occurs.</p>
          {editingSteps.map((s,i)=><div className={styles.editStep} key={s.key}>
            <div className={styles.editStepTop}><strong>Step {i+1}</strong><button type="button" aria-label={`Remove step ${i+1}`} disabled={editingSteps.length===1} onClick={()=>setEditingSteps(ss=>ss.filter(x=>x.key!==s.key))}><Trash2 size={15}/> Remove</button></div>
            <div className={styles.formTwo}><label>Action<select value={s.action_type} onChange={e=>{const action=e.target.value as AutomationAction;editStep(s.key,{action_type:action,config:action==='create_task'?{title:'Follow up with {{full_name}}',priority:'Normal'}:action==='draft_email'?{subject:'Hello {{first_name}}',body:'Hi {{first_name}},\n\nThank you for your inquiry. Let me know how I can help.\n\nBest regards'}:action==='add_note'?{body:'Automated note for {{full_name}}'}:{}})}}>{(Object.keys(actionLabels) as AutomationAction[]).map(key=><option key={key} value={key}>{actionLabels[key]}</option>)}</select></label><label>Timing<select value={s.delay_minutes} onChange={e=>editStep(s.key,{delay_minutes:Number(e.target.value)})}>{delays.map(d=><option key={d.value} value={d.value}>{d.label}</option>)}</select></label></div>
            {s.action_type==='create_task'&&<div className={styles.formTwo}><label>Task title<input required maxLength={250} value={String(s.config.title||'')} onChange={e=>editConfig(s.key,'title',e.target.value)}/></label><label>Priority<select value={String(s.config.priority||'Normal')} onChange={e=>editConfig(s.key,'priority',e.target.value)}><option>Normal</option><option>High</option></select></label></div>}
            {s.action_type==='add_note'&&<label>CRM note<textarea required maxLength={9500} rows={3} value={String(s.config.body||'')} onChange={e=>editConfig(s.key,'body',e.target.value)}/></label>}
            {s.action_type==='draft_email'&&<><label>Email subject<input required maxLength={250} value={String(s.config.subject||'')} onChange={e=>editConfig(s.key,'subject',e.target.value)}/></label><label>Email draft body<textarea required rows={5} maxLength={5000} value={String(s.config.body||'')} onChange={e=>editConfig(s.key,'body',e.target.value)}/></label><p className={styles.dim}><Mail size={13}/> Draft only — agent reviews and sends manually after consent and email connection checks.</p></>}
          </div>)}
          <button type="button" className={styles.secondary} disabled={editingSteps.length>=10} onClick={()=>setEditingSteps(ss=>[...ss,{key:++stepKey,action_type:'create_task',delay_minutes:1440,config:{title:'Follow up with {{full_name}}',priority:'Normal'}}])}><Plus size={15}/> Add step</button>
          <p className={styles.tokens}>Available placeholders: <code>{'{{first_name}}'}</code> <code>{'{{full_name}}'}</code> <code>{'{{preferred_area}}'}</code> <code>{'{{contact_type}}'}</code> <code>{'{{stage}}'}</code></p>
          <div className={styles.footerActions}><button type="submit" disabled={busy} className={styles.primary}><Check size={16}/> {busy?'Saving…':'Save workflow (OFF)'}</button></div>
        </form>
      </section>}
    </>:tab==='drafts'?<section className={styles.content}><div className={styles.toolbar}><div><h2>Review-ready email drafts</h2><p>Nothing below was sent automatically. Copy, review, and send using your approved mail account.</p></div></div>{!drafts.length?<div className={styles.empty}><Mail size={30}/><h3>No email drafts yet</h3><p>Enable a workflow, create a matching test lead, and run the secured worker.</p></div>:<div className={styles.draftList}>{drafts.map(d=><article className={styles.draftCard} key={d.id}><div className={styles.cardTop}><div><h3>{d.subject}</h3><p>{contactMap.get(d.contact_id)?.full_name||'Client'} · {showDate(d.created_at)} · Draft only</p></div><button type="button" className={styles.secondary} onClick={()=>void copyDraft(d)}><Copy size={14}/> Copy</button></div><pre>{d.body}</pre></article>)}</div>}</section>:<section className={styles.content}><h2>Recent automation activity</h2><p className={styles.dim}>Queued jobs execute only when your server scheduler calls the protected automation worker.</p>{!jobs.length?<div className={styles.empty}><Activity size={30}/><h3>No actions yet</h3><p>New contacts and stage changes will create run records once a workflow is enabled.</p></div>:<div className={styles.activityList}>{jobs.map(j=>{const r=runMap.get(j.run_id);return <div className={styles.activityRow} key={j.id}><Clock3 size={18}/><div><b>{workflowMap.get(r?.workflow_id||'')?.name||'Workflow'}</b><p>{r?contactMap.get(r.contact_id)?.full_name||'CRM contact':'Lead'} · {j.result_text||j.last_error||'Scheduled '+showDate(j.scheduled_for)}</p></div><span className={styles[j.status==='completed'?'activeBadge':'inactiveBadge']}>{j.status}</span></div>})}</div>}</section>}
    {preview&&<p className={styles.dim}>{preview}</p>}
    <p className={styles.footerNote}><ShieldCheck size={15}/> Agent-private workflow data. Current release does not provide brokerage-wide workflow sharing, incoming-email tracking or automatic delivery.</p>
  </div>;
}
