'use client';
import {useEffect,useState} from 'react';
import type {AuthChangeEvent,Session} from '@supabase/supabase-js';
import {getSupabase} from '../../lib/supabase';
import CRMAutomationEngine from '../crm-automation-engine';
export default function AutomationPage(){
  const [userId,setUserId]=useState<string|null>(null);
  const [loaded,setLoaded]=useState(false);
  const [notice,setNotice]=useState('');
  useEffect(()=>{
    const db=getSupabase();if(!db){setLoaded(true);return;}
    let active=true;
    void db.auth.getUser().then(({data})=>{if(active){setUserId(data.user?.id||null);setLoaded(true)}})
      .catch(()=>{if(active)setLoaded(true)});
    const {data}=db.auth.onAuthStateChange((_event:AuthChangeEvent,session:Session|null)=>{if(active){setUserId(session?.user.id||null);setLoaded(true)}});
    return ()=>{active=false;data.subscription.unsubscribe()};
  },[]);
  if(!loaded)return <main style={{padding:35}}>Opening RealVolt Automation Studio…</main>;
  if(!userId)return <main style={{padding:35}}><h1>RealVolt Automation Studio</h1><p>Sign in to your RealVolt workspace to manage automations.</p><a href="/">Return to sign in</a></main>;
  return <div style={{padding:'25px clamp(12px,4vw,50px)',background:'#f6f8f4',minHeight:'100vh'}}>
    <p><a href="/real-estate-crm" style={{color:'#315f47',fontWeight:700,textDecoration:'none'}}>← Real Estate CRM</a></p>
    <CRMAutomationEngine userId={userId} notify={setNotice}/>
    {notice&&<p role="status" style={{padding:13,background:'#eaf5e8',borderRadius:8,color:'#23583e'}}>{notice}</p>}
  </div>;
}
