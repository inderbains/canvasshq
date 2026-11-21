import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import vm from 'node:vm';

const root=path.resolve(import.meta.dirname,'..');
const source=(rel)=>fs.readFileSync(path.join(root,rel),'utf8');
function compile(rel){
 const r=ts.transpileModule(source(rel),{fileName:rel,reportDiagnostics:true,
  compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});
 const errors=(r.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,rel+' '+errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join(' '));
 return r.outputText;
}

test('source files transpile and are located only in their intended nested folders',()=>{
 for(const p of [
  'lib/rv-automation.ts','app/crm-automation-engine.tsx','app/crm-automations/page.tsx',
  'app/api/rv-automation/run/route.ts', 'app/realvolt-workspace.tsx',
  'app/real-estate-crm/real-estate-crm.tsx'])compile(p);
 assert.ok(fs.existsSync(path.join(root,'app/crm-automation-engine.module.css')));
 assert.ok(!fs.existsSync(path.join(root,'real-estate-crm.tsx')));
 assert.ok(!fs.existsSync(path.join(root,'page.tsx')));
});

test('template substitution is literal and never evaluates code',()=>{
 const sandbox={exports:{}};
 vm.runInNewContext(compile('lib/rv-automation.ts'),sandbox);
 const {fillTemplate,defaultSteps}=sandbox.exports;
 const c={full_name:'Alex Smith',contact_type:'Buyer',preferred_area:'Surrey',stage:'New'};
 assert.equal(fillTemplate('Hi {{first_name}} – {{full_name}} in {{preferred_area}}',c),'Hi Alex – Alex Smith in Surrey');
 assert.equal(fillTemplate('{{constructor}} and {{unknown}}',c),'{{constructor}} and {{unknown}}');
 assert.equal(fillTemplate('{{contact_type}} {{stage}}',c),'Buyer New');
 assert.equal(defaultSteps.length,3);
});

test('SQL migration has owner-bound RLS, durable queue, automatic enrollment, and service-only RPCs',()=>{
 const sql=source('supabase/023_crm_automation_engine.sql');
 for(const required of ['create table if not exists public.rv_auto_workflows','create table if not exists public.rv_auto_steps',
  'create table if not exists public.rv_auto_runs','create table if not exists public.rv_auto_jobs',
  'create table if not exists public.rv_auto_email_drafts',
  'after insert or update of stage on public.crm_contacts',
  'for update skip locked', 'user_id=(select auth.uid())',
  'grant execute on function public.rv_auto_claim_due_jobs(integer) to service_role',
  'trigger_contact_type','rv_auto_job_id'])assert.ok(sql.includes(required),required);
 assert.equal((sql.match(/\$\$/g)||[]).length%2,0);
 assert.ok(!sql.includes('drop table public.crm_'));
});

test('automations never auto-send email, SMS, or touch trust balances',()=>{
 const worker=source('app/api/rv-automation/run/route.ts');
 assert.ok(worker.includes("action_type==='draft_email'"));
 assert.ok(worker.includes("communication_consent==='Opted out'"));
 assert.ok(worker.includes("'rv_auto_email_drafts'"));
 assert.ok(worker.includes('REALVOLT_AUTOMATION_CRON_SECRET'));
 assert.ok(worker.includes('SUPABASE_SERVICE_ROLE_KEY'));
 assert.ok(!worker.includes("fetch('https://"));
 assert.ok(!worker.includes("from('deposits')"));
 assert.ok(!worker.includes("from('trust_"));
});

test('Automation Studio is linked from main CRM and standalone CRM',()=>{
 const workspace=source('app/realvolt-workspace.tsx');
 const crm=source('app/real-estate-crm/real-estate-crm.tsx');
 assert.ok(workspace.includes('CRMAutomationEngine userId={user.id}'));
 assert.ok(workspace.includes("'Follow-ups','Automations'"));
 assert.ok(crm.includes('href="/crm-automations"'));
});
