'use client';
import {useCallback,useEffect,useMemo,useState,type FormEvent} from 'react';
import {getSupabase} from './supabase-client';
import styles from './real-estate-crm.module.css';
import {ArrowLeft,ArrowRight,BrainCircuit,Building2,CalendarDays,Check,ClipboardList,Copy,FileText,House,Plus,RefreshCcw,Search,Users,X} from 'lucide-react';

type Stage='New'|'Contacted'|'Qualified'|'Active'|'Under contract'|'Closed'|'Lost';
const stages:Stage[]=['New','Contacted','Qualified','Active','Under contract','Closed','Lost'];
type Contact={id:string;user_id:string;full_name:string;email:string;phone:string;contact_type:string;stage:Stage;source:string;preferred_area:string;budget:number|null;assigned_to:string;tags:string[];communication_consent:string;updated_at:string;created_at:string};
type Profile={contact_id:string;user_id:string;property_type:string;preferred_areas:string[];bedrooms_min:number|null;bathrooms_min:number|null;budget_min:number|null;purchase_timeline:string;financing_status:string;motivation:string;ai_draft_enabled:boolean;followup_cadence_days:number};
type Task={id:string;user_id:string;contact_id:string|null;title:string;due_date:string|null;completed:boolean;priority:string};
type Note={id:string;user_id:string;contact_id:string;body:string;activity_type:string;created_at:string};
type Deal={id:string;user_id:string;kind:string;address:string;client_name:string;review_status:string;created_at:string};
type DealLink={id:string;contact_id:string;deal_id:string;relationship:string;user_id:string};
type Tab='Overview'|'Contacts'|'Pipeline'|'Follow-ups';
const initialProfile=(c:Contact):Profile=>({contact_id:c.id,user_id:c.user_id,property_type:'',preferred_areas:[],bedrooms_min:null,bathrooms_min:null,budget_min:null,purchase_timeline:'',financing_status:'',motivation:'',ai_draft_enabled:false,followup_cadence_days:7});
const money=(v:number|null)=>v===null?'—':new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',maximumFractionDigits:0}).format(v);
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
async function fetchRows<T>(table:string,userId:string):Promise<T[]>{
  const db=getSupabase();if(!db)throw new Error('Supabase is not configured');
  const out:T[]=[];
  for(let from=0;from<50000;from+=500){
    const {data,error}=await db.from(table).select('*').eq('user_id',userId).order('created_at',{ascending:false}).range(from,from+499);
    if(error)throw error;
    out.push(...(data as T[]));
    if(data.length<500)return out;
  }
  throw new Error('More than 50,000 records found. Server pagination is required for this account.');
}
function Blank({children}:{children:React.ReactNode}){return <div className={styles.blank}>{children}</div>}
export default function RealEstateCRM({userId}:{userId:string}){
 const [tab,setTab]=useState<Tab>('Overview');
 const [contacts,setContacts]=useState<Contact[]>([]);
 const [profiles,setProfiles]=useState<Profile[]>([]);
 const [notes,setNotes]=useState<Note[]>([]);
 const [tasks,setTasks]=useState<Task[]>([]);
 const [deals,setDeals]=useState<Deal[]>([]);
 const [links,setLinks]=useState<DealLink[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [filter,setFilter]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [addContact,setAddContact]=useState(false),[contactSaving,setContactSaving]=useState(false);
 const [contactInput,setContactInput]=useState({full_name:'',email:'',phone:'',contact_type:'Buyer',source:'',preferred_area:'',budget:''});
 const [profileEdit,setProfileEdit]=useState<Profile|null>(null);
 const [noteInput,setNoteInput]=useState(''),[noteType,setNoteType]=useState<'Note'|'Call'|'Email'|'Meeting'>('Note'),[taskInput,setTaskInput]=useState(''),[due,setDue]=useState(today());
 const [dealAddress,setDealAddress]=useState(''),[createDeal,setCreateDeal]=useState(false),[linkDeal,setLinkDeal]=useState('');
 const [purpose,setPurpose]=useState('Follow up with this client'),[channel,setChannel]=useState<'Email'|'SMS'>('Email'),[draft,setDraft]=useState('');
 const [draftBusy,setDraftBusy]=useState(false);
 const active=contacts.find(c=>c.id===selected)||null;
 const currentProfile=active?(profileEdit?.contact_id===active.id?profileEdit:profiles.find(p=>p.contact_id===active.id)||initialProfile(active)):null;
 const openTasks=tasks.filter(t=>!t.completed),dueTasks=openTasks.filter(t=>t.due_date&&t.due_date<=today());
 const filtered=useMemo(()=>contacts.filter(c=>[c.full_name,c.email,c.phone,c.preferred_area,c.source,...(c.tags||[])].join(' ').toLowerCase().includes(filter.trim().toLowerCase())),[contacts,filter]);
 const activeDeals=active?links.filter(l=>l.contact_id===active.id).map(l=>({link:l,deal:deals.find(d=>d.id===l.deal_id)})).filter(x=>x.deal):[];
 const availableDeals=active?deals.filter(d=>!links.some(l=>l.contact_id===active.id&&l.deal_id===d.id)):[];
 const notify=(msg:string)=>{setNotice(msg);setTimeout(()=>setNotice(''),6500)};
 const load=useCallback(async()=>{
   setLoading(true);setError('');
   try{
     const [c,p,n,t,d,l]=await Promise.all([
       fetchRows<Contact>('crm_contacts',userId),fetchRows<Profile>('rvcrm_real_estate_profiles',userId),
       fetchRows<Note>('crm_notes',userId),fetchRows<Task>('crm_tasks',userId),
       fetchRows<Deal>('deal_files',userId),fetchRows<DealLink>('rvcrm_contact_deals',userId)
     ]);
     setContacts(c);setProfiles(p);setNotes(n);setTasks(t);setDeals(d);setLinks(l);
   }catch(e){setError((e as Error).message)}finally{setLoading(false)}
 },[userId]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{setDraft('');setNoteInput('');setNoteType('Note');setTaskInput('');setProfileEdit(null);setCreateDeal(false);setDealAddress('');setLinkDeal('')},[selected]);
 async function run(task:()=>Promise<void>){setBusy(true);try{await task()}catch(e){notify((e as Error).message)}finally{setBusy(false)}}
 async function newContact(e:FormEvent){
   e.preventDefault();setContactSaving(true);
   try{
     if(!contactInput.full_name.trim())throw new Error('Contact name is required.');
     const db=getSupabase()!;
     const {data,error}=await db.from('crm_contacts').insert({
       user_id:userId,full_name:contactInput.full_name.trim(),email:contactInput.email.trim().toLowerCase(),phone:contactInput.phone.trim(),
       contact_type:contactInput.contact_type,source:contactInput.source.trim(),preferred_area:contactInput.preferred_area.trim(),
       budget:contactInput.budget===''?null:Number(contactInput.budget)
     }).select().single();
     if(error)throw error;
     setContacts(x=>[data as Contact,...x]);setSelected(data.id);setAddContact(false);
     setContactInput({full_name:'',email:'',phone:'',contact_type:'Buyer',source:'',preferred_area:'',budget:''});notify('Contact added to the existing RealVolt CRM.');
   }catch(e){notify((e as Error).message)}finally{setContactSaving(false)}
 }
 async function stageChange(c:Contact,stage:Stage){await run(async()=>{
   const {data,error}=await getSupabase()!.from('crm_contacts').update({stage}).eq('id',c.id).eq('user_id',userId).select().single();
   if(error)throw error;setContacts(xs=>xs.map(x=>x.id===c.id?data as Contact:x));notify('Pipeline updated.');
 })}
 async function saveProfile(e:FormEvent){e.preventDefault();if(!currentProfile)return;
   await run(async()=>{
     const value={...currentProfile,preferred_areas:currentProfile.preferred_areas.map(x=>x.trim()).filter(Boolean)};
     const {data,error}=await getSupabase()!.from('rvcrm_real_estate_profiles').upsert(value,{onConflict:'contact_id'}).select().single();
     if(error)throw error;setProfiles(xs=>[...xs.filter(x=>x.contact_id!==value.contact_id),data as Profile]);setProfileEdit(null);notify('Buyer / seller preferences saved.');
   });
 }
 async function addNote(e:FormEvent){e.preventDefault();if(!active||!noteInput.trim())return;
   await run(async()=>{
     const {data,error}=await getSupabase()!.from('crm_notes').insert({user_id:userId,contact_id:active.id,body:noteInput.trim(),activity_type:noteType}).select().single();
     if(error)throw error;setNotes(xs=>[data as Note,...xs]);setNoteInput('');if(noteType!=='Note'){const updated=await getSupabase()!.from('crm_contacts').select('id,stage').eq('id',active.id).eq('user_id',userId).single();if(!updated.error&&updated.data)setContacts(xs=>xs.map(x=>x.id===active.id?{...x,stage:updated.data.stage as Stage}:x))}notify(noteType==='Note'?'Note saved to CRM.':'Activity logged; pipeline updated when eligible.');
   });
 }
 async function addTask(e:FormEvent){e.preventDefault();if(!active||!taskInput.trim())return;
   await run(async()=>{
     const {data,error}=await getSupabase()!.from('crm_tasks').insert({user_id:userId,contact_id:active.id,title:taskInput.trim(),due_date:due||null,priority:'Normal'}).select().single();
     if(error)throw error;setTasks(xs=>[data as Task,...xs]);setTaskInput('');notify('Follow-up task created.');
   });
 }
 async function completeTask(t:Task){await run(async()=>{
   const {data,error}=await getSupabase()!.from('crm_tasks').update({completed:!t.completed}).eq('id',t.id).eq('user_id',userId).select().single();
   if(error)throw error;setTasks(xs=>xs.map(x=>x.id===t.id?data as Task:x));
 })}
 async function createTransaction(e:FormEvent){e.preventDefault();if(!active||!dealAddress.trim())return;
   await run(async()=>{
     const db=getSupabase()!;
     const side=active.contact_type==='Seller'?'Seller':'Buyer';
     const {data,error}=await db.from('deal_files').insert({user_id:userId,kind:side==='Seller'?'Listing':'Sale',
       address:dealAddress.trim(),client_name:active.full_name,
       ...(side==='Seller'?{seller_name:active.full_name}:{buyer_name:active.full_name})}).select().single();
     if(error)throw error;
     const relation=await db.from('rvcrm_contact_deals').insert({user_id:userId,contact_id:active.id,deal_id:data.id,relationship:side}).select().single();
     if(relation.error){notify('Draft transaction created but CRM link failed: '+relation.error.message);setDeals(xs=>[data as Deal,...xs]);return}
     setDeals(xs=>[data as Deal,...xs]);setLinks(xs=>[relation.data as DealLink,...xs]);setCreateDeal(false);setDealAddress('');notify('Draft transaction created and linked. Complete it in Transactions.');
   });
 }
 async function attachDeal(e:FormEvent){e.preventDefault();if(!active||!linkDeal)return;
   await run(async()=>{
     const {data,error}=await getSupabase()!.from('rvcrm_contact_deals').insert({user_id:userId,contact_id:active.id,deal_id:linkDeal,relationship:active.contact_type==='Seller'?'Seller':'Buyer'}).select().single();
     if(error)throw error;setLinks(xs=>[data as DealLink,...xs]);setLinkDeal('');notify('Transaction linked to client profile.');
   });
 }
 async function generateDraft(){if(!active)return;
   if(active.communication_consent==='Opted out'){notify('This contact has opted out of marketing communications.');return}
   if(!currentProfile?.ai_draft_enabled){notify('Enable AI drafts in this client’s profile first.');return}
   setDraftBusy(true);setDraft('');
   try{
     const {data:{session}}=await getSupabase()!.auth.getSession();
     if(!session)throw new Error('Your session has expired. Please sign in again.');
     const r=await fetch('/api/rvcrm/ai-draft',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({contactId:active.id,channel,purpose})});
     const res=await r.json() as {content?:string;error?:string};if(!r.ok)throw new Error(res.error||'AI draft failed');
     setDraft(res.content||'');notify('AI draft prepared for your review. Nothing was sent.');
   }catch(e){notify((e as Error).message)}finally{setDraftBusy(false)}
 }
 async function copyDraft(){if(!draft)return;try{await navigator.clipboard.writeText(draft);notify('Draft copied. Review before sending.')}catch{notify('Copy failed; select and copy the text manually.')}}
 return <div className={styles.shell}>
  <aside className={styles.sidebar}>
    <a className={styles.brand} href="/"><span className={styles.brandIcon}>ϟ</span><span>realvolt<span className={styles.dot}>.</span></span></a>
    <div className={styles.sectionTag}>REAL ESTATE OS</div>
    <nav className={styles.nav} aria-label="CRM navigation">
      {(['Overview','Contacts','Pipeline','Follow-ups'] as Tab[]).map((x,i)=>{
        const Icon=[House,Users,Building2,ClipboardList][i];
        return <button key={x} className={tab===x?styles.activeNav:styles.navItem} onClick={()=>{setTab(x);setSelected(null)}}><Icon size={17}/>{x}{x==='Follow-ups'&&dueTasks.length>0&&<span className={styles.navCount}>{dueTasks.length}</span>}</button>
      })}
      <a className={styles.navItem} href="/crm-automations" style={{textDecoration:'none'}}>⚡ Automation Studio</a>
    </nav>
    <div className={styles.sideBottom}><a href="/"><ArrowLeft size={15}/> Back to RealVolt workspace</a><small>Existing CRM records • Owner-private</small></div>
  </aside>
  <main className={styles.main}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>CLIENT INTELLIGENCE</span><h1>Real Estate CRM</h1><p>Your clients, opportunities and transactions in one place.</p></div>
      <div className={styles.headerActions}><button className={styles.secondaryButton} onClick={()=>void load()} disabled={loading}><RefreshCcw size={15}/> Refresh</button><button className={styles.primaryButton} onClick={()=>{setAddContact(true);setSelected(null)}}><Plus size={17}/> New contact</button></div>
    </header>
    {error&&<div className={styles.error}><b>Could not load CRM:</b> {error}<p>Check that the additive SQL migration was applied in your staging Supabase project.</p></div>}
    {notice&&<div role="status" className={styles.notice}>{notice}</div>}
    {loading?<div className={styles.loading}>Loading CRM data…</div>:
      active?<section className={styles.details}>
       <button className={styles.textButton} onClick={()=>setSelected(null)}><ArrowLeft size={16}/> Back to {tab.toLowerCase()}</button>
       <div className={styles.clientTitle}><div className={styles.avatar}>{active.full_name.trim().charAt(0).toUpperCase()}</div><div><h2>{active.full_name}</h2><p>{active.contact_type} · {active.email||active.phone||'No contact details yet'}</p></div><select aria-label="Pipeline stage" value={active.stage} onChange={e=>void stageChange(active,e.target.value as Stage)}>{stages.map(s=><option key={s}>{s}</option>)}</select></div>
       <div className={styles.detailsGrid}>
        <div className={styles.detailColumn}>
         <article className={styles.panel}>
          <div className={styles.panelHeader}><h3>Buyer / seller preferences</h3><span className={styles.tag}>{active.contact_type}</span></div>
          <form onSubmit={saveProfile} className={styles.formGrid}>
            <label>Property type<input value={currentProfile?.property_type||''} onChange={e=>setProfileEdit({...currentProfile!,property_type:e.target.value})} placeholder="Townhouse, detached, condo"/></label>
            <label>Preferred areas<input value={currentProfile?.preferred_areas.join(', ')||''} onChange={e=>setProfileEdit({...currentProfile!,preferred_areas:e.target.value.split(',')})} placeholder="Surrey, Langley"/></label>
            <label>Minimum bedrooms<input type="number" min="0" max="30" value={currentProfile?.bedrooms_min??''} onChange={e=>setProfileEdit({...currentProfile!,bedrooms_min:e.target.value===''?null:Number(e.target.value)})}/></label>
            <label>Minimum bathrooms<input type="number" step="0.5" min="0" max="30" value={currentProfile?.bathrooms_min??''} onChange={e=>setProfileEdit({...currentProfile!,bathrooms_min:e.target.value===''?null:Number(e.target.value)})}/></label>
            <label>Minimum budget (CAD)<input type="number" min="0" value={currentProfile?.budget_min??''} onChange={e=>setProfileEdit({...currentProfile!,budget_min:e.target.value===''?null:Number(e.target.value)})}/></label>
            <label>Budget ceiling (existing CRM)<span className={styles.readOnly}>{money(active.budget)}</span></label>
            <label>Timeline<input value={currentProfile?.purchase_timeline||''} onChange={e=>setProfileEdit({...currentProfile!,purchase_timeline:e.target.value})} placeholder="Within 90 days"/></label>
            <label>Financing<input value={currentProfile?.financing_status||''} onChange={e=>setProfileEdit({...currentProfile!,financing_status:e.target.value})} placeholder="Pre-approved / cash / unknown"/></label>
            <label className={styles.wide}>Motivation / special requirements<textarea rows={2} maxLength={2000} value={currentProfile?.motivation||''} onChange={e=>setProfileEdit({...currentProfile!,motivation:e.target.value})}/></label>
            <label className={styles.inlineCheck}><input type="checkbox" checked={!!currentProfile?.ai_draft_enabled} onChange={e=>setProfileEdit({...currentProfile!,ai_draft_enabled:e.target.checked})}/> Enable AI drafting for this contact</label>
            <label>Follow-up interval (days)<input type="number" min="1" max="365" value={currentProfile?.followup_cadence_days||7} onChange={e=>setProfileEdit({...currentProfile!,followup_cadence_days:Number(e.target.value)||7})}/></label>
            <div className={styles.wide}><button className={styles.primaryButton} type="submit" disabled={busy}>Save preferences</button></div>
          </form>
         </article>
         <article className={styles.panel}><div className={styles.panelHeader}><h3>Transactions</h3><span className={styles.subtle}>{activeDeals.length} linked</span></div>
          {activeDeals.length===0?<p className={styles.subtle}>No linked transactions yet.</p>:<div className={styles.itemList}>{activeDeals.map(({deal,link})=>deal&&<div className={styles.listItem} key={link.id}><FileText size={18}/><div><b>{deal.address}</b><p>{deal.kind} · {deal.review_status}</p></div></div>)}</div>}
          <form className={styles.oneLine} onSubmit={attachDeal}><select aria-label="Select existing transaction" value={linkDeal} onChange={e=>setLinkDeal(e.target.value)}><option value="">Link existing transaction…</option>{availableDeals.map(d=><option key={d.id} value={d.id}>{d.address} ({d.kind})</option>)}</select><button className={styles.secondaryButton} disabled={!linkDeal||busy}>Link</button></form>
          {!createDeal?<button className={styles.textButton} onClick={()=>setCreateDeal(true)}><Plus size={15}/> Start a new draft transaction</button>:<form className={styles.oneLine} onSubmit={createTransaction}><input aria-label="Property address" placeholder="Enter property address" required value={dealAddress} onChange={e=>setDealAddress(e.target.value)}/><button className={styles.primaryButton} disabled={busy}>Create draft</button><button type="button" className={styles.iconButton} onClick={()=>setCreateDeal(false)} aria-label="Cancel"><X size={16}/></button></form>}
          <p className={styles.helper}>Creates a draft in your existing Transactions module. Brokerage review, commission and trust handling stay there.</p>
         </article>
        </div>
        <div className={styles.detailColumn}>
          <article className={styles.panel}><div className={styles.panelHeader}><h3><BrainCircuit size={18}/> AI follow-up draft</h3><span className={styles.tag}>Review only</span></div>
            <p className={styles.subtle}>Prepares a personalized draft. No email or text message is sent automatically.</p>
            <div className={styles.formGrid}><label>Channel<select value={channel} onChange={e=>setChannel(e.target.value as 'Email'|'SMS')}><option>Email</option><option>SMS</option></select></label><label>Purpose<input maxLength={160} value={purpose} onChange={e=>setPurpose(e.target.value)}/></label></div>
            <button className={styles.primaryButton} onClick={()=>void generateDraft()} disabled={draftBusy||!currentProfile?.ai_draft_enabled||active.communication_consent==='Opted out'}><BrainCircuit size={16}/>{draftBusy?'Preparing draft…':'Generate AI draft'}</button>
            {active.communication_consent==='Opted out'&&<p className={styles.errorLine}>This client opted out of marketing communication.</p>}
            {draft&&<div className={styles.draft}><pre>{draft}</pre><button className={styles.secondaryButton} onClick={()=>void copyDraft()}><Copy size={15}/> Copy draft</button></div>}
          </article>
          <article className={styles.panel}><div className={styles.panelHeader}><h3>Follow-ups</h3><CalendarDays size={18}/></div>
            <form className={styles.taskForm} onSubmit={addTask}><input aria-label="New follow-up" required placeholder="Call about financing, book showing…" value={taskInput} onChange={e=>setTaskInput(e.target.value)}/><input aria-label="Task due date" type="date" value={due} onChange={e=>setDue(e.target.value)}/><button className={styles.primaryButton} disabled={busy}>Add task</button></form>
            <div className={styles.itemList}>{tasks.filter(t=>t.contact_id===active.id).map(t=><div className={styles.listItem} key={t.id}><button className={styles.taskCheck} onClick={()=>void completeTask(t)} aria-label={t.completed?'Reopen task':'Complete task'}>{t.completed?<Check size={15}/>:null}</button><div><b className={t.completed?styles.done:''}>{t.title}</b><p>{t.due_date||'No due date'} · {t.completed?'Complete':'Pending'}</p></div></div>)}{tasks.every(t=>t.contact_id!==active.id)&&<p className={styles.subtle}>No tasks for this contact.</p>}</div>
          </article>
          <article className={styles.panel}><div className={styles.panelHeader}><h3>Activity & notes</h3><span className={styles.subtle}>{notes.filter(n=>n.contact_id===active.id).length} entries</span></div>
            <form onSubmit={addNote}><label>Activity type <select aria-label="Activity type" value={noteType} onChange={e=>setNoteType(e.target.value as typeof noteType)}><option>Note</option><option>Call</option><option>Email</option><option>Meeting</option></select></label><textarea className={styles.fullWidth} rows={3} required maxLength={10000} placeholder="Describe the activity or add a private note…" value={noteInput} onChange={e=>setNoteInput(e.target.value)}/><button className={styles.secondaryButton} disabled={busy}>Save note</button></form>
            <div className={styles.itemList}>{notes.filter(n=>n.contact_id===active.id).slice(0,20).map(n=><div className={styles.noteItem} key={n.id}><span>{new Date(n.created_at).toLocaleDateString('en-CA')} · {n.activity_type}</span><p>{n.body}</p></div>)}</div>
          </article>
        </div>
       </div>
      </section>:
      <section>
       {tab==='Overview'&&<><div className={styles.statGrid}>{[
         ['Total contacts',contacts.length,Users],['Active opportunities',contacts.filter(c=>['Qualified','Active','Under contract'].includes(c.stage)).length,Building2],['Follow-ups due',dueTasks.length,CalendarDays],['Linked transactions',links.length,FileText]
       ].map(([label,num,Icon])=>{const I=Icon as typeof Users;return <div className={styles.stat} key={label as string}><div className={styles.statIcon}><I size={20}/></div><small>{label as string}</small><strong>{num as number}</strong></div>})}</div>
       <div className={styles.twoCol}><article className={styles.panel}><div className={styles.panelHeader}><h3>Pipeline snapshot</h3><button className={styles.textButton} onClick={()=>setTab('Pipeline')}>View pipeline <ArrowRight size={14}/></button></div>{stages.filter(s=>s!=='Lost').map(s=><div className={styles.progressRow} key={s}><div><span>{s}</span><b>{contacts.filter(c=>c.stage===s).length}</b></div><div className={styles.progress}><span style={{width:`${contacts.length?100*contacts.filter(c=>c.stage===s).length/contacts.length:0}%`}}/></div></div>)}</article><article className={styles.panel}><div className={styles.panelHeader}><h3>Upcoming activity</h3><button className={styles.textButton} onClick={()=>setTab('Follow-ups')}>See all <ArrowRight size={14}/></button></div>{openTasks.slice().sort((a,b)=>(a.due_date||'9999').localeCompare(b.due_date||'9999')).slice(0,7).map(t=><div key={t.id} className={styles.listItem}><CalendarDays size={17}/><div><b>{t.title}</b><p>{t.due_date||'No date'} · {contacts.find(c=>c.id===t.contact_id)?.full_name||'General'}</p></div></div>)}{!openTasks.length&&<Blank>No upcoming tasks.</Blank>}</article></div>
       <article className={styles.panel}><div className={styles.panelHeader}><h3>Recently updated clients</h3><button className={styles.textButton} onClick={()=>setTab('Contacts')}>All contacts <ArrowRight size={14}/></button></div><div className={styles.contactGrid}>{contacts.slice().sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,6).map(c=><button key={c.id} className={styles.miniContact} onClick={()=>setSelected(c.id)}><div className={styles.avatarSmall}>{c.full_name.charAt(0)}</div><span><b>{c.full_name}</b><small>{c.stage} · {c.contact_type}</small></span><ArrowRight size={16}/></button>)}{!contacts.length&&<Blank>Start by adding your first real estate contact.</Blank>}</div></article></>}
       {tab==='Contacts'&&<><div className={styles.listHeading}><h2>All clients <span>{contacts.length}</span></h2><div className={styles.search}><Search size={17}/><input placeholder="Search name, area, email, phone or source" value={filter} onChange={e=>setFilter(e.target.value)}/></div></div><div className={styles.contactTable}><div className={styles.tableHead}><span>Client</span><span>Type</span><span>Stage</span><span>Budget</span><span>Next</span></div>{filtered.map(c=><button key={c.id} className={styles.tableRow} onClick={()=>setSelected(c.id)}><span className={styles.person}><span className={styles.avatarSmall}>{c.full_name.charAt(0)}</span><span><b>{c.full_name}</b><small>{c.preferred_area||c.email||'No location'}</small></span></span><span>{c.contact_type}</span><span><span className={styles.tag}>{c.stage}</span></span><span>{money(c.budget)}</span><span><ArrowRight size={16}/></span></button>)}{!filtered.length&&<Blank>No matching contacts.</Blank>}</div></>}
       {tab==='Pipeline'&&<><div className={styles.listHeading}><h2>Sales pipeline</h2><p className={styles.subtle}>Select a client to update their stage and create a transaction.</p></div><div className={styles.pipeline}>{stages.map(s=><div className={styles.pipelineCol} key={s}><div className={styles.pipelineHeading}><span>{s}</span><b>{contacts.filter(c=>c.stage===s).length}</b></div>{contacts.filter(c=>c.stage===s).map(c=><button className={styles.pipelineCard} key={c.id} onClick={()=>setSelected(c.id)}><b>{c.full_name}</b><small>{c.contact_type} · {c.preferred_area||'Area not set'}</small><strong>{money(c.budget)}</strong></button>)}{contacts.every(c=>c.stage!==s)&&<span className={styles.emptyColumn}>No contacts</span>}</div>)}</div></>}
       {tab==='Follow-ups'&&<><div className={styles.listHeading}><h2>Tasks & follow-ups</h2><p className={styles.subtle}>All tasks come from the existing CRM table.</p></div><article className={styles.panel}>{tasks.slice().sort((a,b)=>(a.completed===b.completed?0:a.completed?1:-1)||(a.due_date||'9999').localeCompare(b.due_date||'9999')).map(t=><div className={styles.listItem} key={t.id}><button className={styles.taskCheck} onClick={()=>void completeTask(t)} aria-label={t.completed?'Reopen task':'Complete task'}>{t.completed?<Check size={14}/>:null}</button><div><b className={t.completed?styles.done:''}>{t.title}</b><p>{t.due_date||'No date'} · {contacts.find(c=>c.id===t.contact_id)?.full_name||'General'} · {t.completed?'Done':'Open'}</p></div>{t.contact_id&&<button className={styles.textButton} onClick={()=>{setSelected(t.contact_id);setTab('Follow-ups')}}>Client <ArrowRight size={14}/></button>}</div>)}{!tasks.length&&<Blank>No tasks yet. Open a client profile to add one.</Blank>}</article></>}
      </section>}
  </main>
  {addContact&&<div className={styles.overlay} role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setAddContact(false)}}><div className={styles.modal} role="dialog" aria-modal="true" aria-label="New CRM contact"><div className={styles.panelHeader}><div><span className={styles.eyebrow}>NEW CONTACT</span><h2>Client details</h2></div><button className={styles.iconButton} onClick={()=>setAddContact(false)} aria-label="Close"><X size={18}/></button></div><form className={styles.formGrid} onSubmit={newContact}><label className={styles.wide}>Full name<input autoFocus required maxLength={150} value={contactInput.full_name} onChange={e=>setContactInput(x=>({...x,full_name:e.target.value}))}/></label><label>Email<input type="email" value={contactInput.email} onChange={e=>setContactInput(x=>({...x,email:e.target.value}))}/></label><label>Phone<input value={contactInput.phone} onChange={e=>setContactInput(x=>({...x,phone:e.target.value}))}/></label><label>Client type<select value={contactInput.contact_type} onChange={e=>setContactInput(x=>({...x,contact_type:e.target.value}))}>{['Buyer','Seller','Buyer & seller','Agent','Service provider','Other'].map(s=><option key={s}>{s}</option>)}</select></label><label>Budget ceiling (CAD)<input type="number" min="0" value={contactInput.budget} onChange={e=>setContactInput(x=>({...x,budget:e.target.value}))}/></label><label>Preferred area<input value={contactInput.preferred_area} onChange={e=>setContactInput(x=>({...x,preferred_area:e.target.value}))}/></label><label>Lead source<input placeholder="Website, referral, open house" value={contactInput.source} onChange={e=>setContactInput(x=>({...x,source:e.target.value}))}/></label><div className={styles.wide}><button className={styles.primaryButton} disabled={contactSaving}>{contactSaving?'Saving…':'Add contact'}</button></div></form></div></div>}
 </div>;
}
