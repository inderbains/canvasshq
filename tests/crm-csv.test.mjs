import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../lib/crm.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {parseCSV,importContacts,exportContacts,csvCell}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('CSV handles BOM, CRLF, embedded comma/newline and escaped quotes',()=>{
 assert.deepEqual(parseCSV('\uFEFFfull_name,email\r\n"Bains, Inder",inder@example.com\r\n"A ""quoted""\nname",other@example.com'),[['full_name','email'],['Bains, Inder','inder@example.com'],['A "quoted"\nname','other@example.com']]);
});
test('Import skips existing and within-file duplicates case-insensitively',()=>{
 const r=importContacts('full_name,email\nOne,EXISTING@EXAMPLE.COM\nTwo,new@example.com\nThree,NEW@example.com',new Set(['existing@example.com']));
 assert.equal(r.skipped,2);assert.equal(r.contacts.length,1);assert.equal(r.contacts[0].full_name,'Two');
});
test('Import rejects malformed rows and negative budget without silently importing them',()=>{
 const r=importContacts('full_name,email,budget,stage\nBad,email,1,New\nDebt,debt@example.com,-1,New\nStage,stage@example.com,100,NotAStage\nWrong,wrong@example.com',new Set());
 assert.equal(r.contacts.length,0);assert.equal(r.problems.length,4);
});
test('Import requires named headers and bounds batch size',()=>{
 assert.throws(()=>importContacts('name,email\nA,a@example.com',new Set()),/full_name/);
 assert.throws(()=>importContacts('full_name\n'+Array.from({length:501},(_,i)=>'Person '+i).join('\n'),new Set()),/500/);
 assert.throws(()=>parseCSV('full_name\n"unclosed'),/unclosed/);
});
test('Export guards spreadsheet formula execution and correctly quotes fields',()=>{
 assert.equal(csvCell('=HYPERLINK("bad")'),'"\'=HYPERLINK(""bad"")"');
 assert.equal(csvCell(' +123'),'"\' +123"');
 assert.equal(csvCell('A, B'),'"A, B"');
});
test('Contact export/import round trips normal marketing fields',()=>{
 const r=importContacts('full_name,email,budget,tags,stage,communication_consent\n"Bains, Inder",inder@example.com,900000,Surrey;Buyer,Qualified,Opted in',new Set());
 const csv=exportContacts(r.contacts);const again=importContacts(csv,new Set());
 assert.equal(again.problems.length,0);assert.deepEqual(again.contacts,r.contacts);
});
