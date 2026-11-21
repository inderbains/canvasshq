import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(path)=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('automatic pipeline advances only on recorded activities and confirmed showings',()=>{
  const sql=read('supabase/030_crm_funnel_auto_stages.sql');
  assert.match(sql,/NEW\.activity_type NOT IN \('Call','Email','Meeting'\)/);
  assert.match(sql,/NEW\.status NOT IN \('Confirmed','Completed'\)/);
  assert.match(sql,/v_before NOT IN \('New','Contacted','Qualified'\)/);
  assert.match(sql,/c\.id=NEW\.contact_id AND c\.user_id=NEW\.user_id FOR UPDATE/);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/ON CONFLICT \(contact_id,origin,source_id\) DO NOTHING/);
  assert.doesNotMatch(sql,/stage='Closed'/);
  assert.doesNotMatch(sql,/DROP TABLE/i);
});
test('new and repeat website inquiries and manually imported Meta leads get follow-up tasks, not emails',()=>{
  const sql=read('supabase/030_crm_funnel_auto_stages.sql');
  assert.match(sql,/NEW\.body LIKE 'Website contact inquiry%'/);
  assert.match(sql,/NEW\.source NOT LIKE 'Meta Lead Ads%'/);
  assert.match(sql,/INSERT INTO public\.crm_tasks/);
  assert.doesNotMatch(sql,/INSERT INTO public\.rv_auto_email_drafts/);
});
test('existing listing workflows remain available and CRM exposes automation without duplicate funnel',()=>{
  const workspace=read('app/realvolt-workspace.tsx');
  const crm=read('app/real-estate-crm/real-estate-crm.tsx');
  assert.ok(workspace.includes("{page==='Automations'&&<MarketingAutomation"));
  assert.ok(workspace.includes("sectionView==='Automations'&&<CRMAutomationEngine"));
  assert.ok(crm.includes('href="/crm-automations"'));
  assert.ok(crm.includes('Activity type'));
  assert.ok(crm.includes("activity_type:noteType"));
});
