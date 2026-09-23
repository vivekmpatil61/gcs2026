import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
let saved;
const seed = [
  {id:'naUyVYZzo2Y',number:'Episode 01',title:'Tools',libraries:['core-studio']},
  {id:'snltJhqqrb0',number:'Episode 02',title:'Grid',libraries:['core-studio']},
  {id:'private0001',number:'Episode 03',title:'Private lesson',libraries:['young-artists']}
];
saved=JSON.stringify(seed);
const ctx=vm.createContext({console, PropertiesService:{getScriptProperties:()=>({getProperty:()=>saved,setProperty:(_,value)=>{saved=value;}})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})}});
vm.runInContext(readFileSync('google-apps-script/Code.gs','utf8'),ctx);
vm.runInContext('jsonResponse_ = value => value; adminDashboardResponse_ = (user,tutorials) => ({approved:true,admin:true,tutorials});',ctx);
let previews=ctx.doPost({parameter:{action:'public_previews'}}).previews;
assert.equal(previews.length,2);
assert.equal(previews[0].id,'naUyVYZzo2Y');
assert.equal(previews[1].id,undefined);
assert.ok(!JSON.stringify(previews).includes('private0001'));
assert.equal(ctx.doPost({parameter:{action:'admin_preview'}}).code,'missing_token');
const update={videoId:'naUyVYZzo2Y',visibility:'private',title:'Tools',label:'Materials',order:'1'};
assert.equal(ctx.handleAdminAction_('admin_preview',update,{}).approved,true);
assert.equal(ctx.publicPreviews_().length,1);
ctx.handleAdminAction_('admin_refresh',{videoId:'missing0001'},{});
assert.equal(ctx.publicPreviews_().length,1);
ctx.handleAdminAction_('admin_preview',{...update,videoId:'private0001',visibility:'teaser'},{});
assert.equal(ctx.publicPreviews_().length,1);
assert.equal(ctx.publicPreviews_()[0].title,'Tools');
ctx.handleAdminAction_('admin_delete',{videoId:'private0001'},{});
assert.equal(ctx.publicPreviews_().length,0);
assert.equal(ctx.handleAdminAction_('admin_preview',{...update,order:'0'},{}).code,'invalid_preview');
const form={participantName:'Test Artist',age:'18',guardianName:'',whatsapp:'1234567890',programme:'Studio Access - Video Library',experience:'None at all - complete beginner',consentFees:'true',consentAccuracy:'true',consentContentUse:'true',contentUseAgreementVersion:'GCS-CONTENT-USE-2026-08-06-v2'};
assert.equal(ctx.validateRegistration_(form).ok,true);
assert.equal(ctx.validateRegistration_({...form,age:'17'}).ok,false);
assert.equal(ctx.validateRegistration_({...form,age:'17',guardianName:'Test Guardian'}).ok,true);
assert.equal(ctx.validateRegistration_({...form,age:'18.5'}).ok,false);
console.log('✓ Preview filtering, anonymous access boundary, metadata persistence, teaser replacement, deletion and adult/minor validation verified');

// Exercise admin rendering and save requests without contacting the live service.
class Element {
  constructor(tag='div') { this.tagName=tag; this.children=[]; this.value=''; this.textContent=''; this.style={}; this.dataset={}; this.listeners={}; this.classList={toggle(){},add(){},remove(){}}; }
  append(...items){this.children.push(...items)}
  replaceChildren(...items){this.children=items}
  setAttribute(name,value){this[name]=value}
  addEventListener(name,fn){this.listeners[name]=fn}
  focus(){}
  reportValidity(){return true}
}
const nodes=new Map();
const doc={getElementById(id){if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)},querySelectorAll(){return []},createElement(tag){return new Element(tag)}};
const admin=vm.createContext({document:doc,window:{location:{protocol:'http:'}},console,URLSearchParams,Date,setTimeout(){},clearTimeout(){}});
vm.runInContext(readFileSync('gcs-website/assets/admin.js','utf8'),admin);
const data=[{id:'core0000001',number:'Episode 01',title:'Core One',libraries:['core-studio'],preview:{visibility:'private',title:'One',label:'Drawing',order:1}}, {id:'young000001',number:'Episode 02',title:'Young',libraries:['young-artists']}, {id:'core0000002',number:'Episode 03',title:'Core Two',libraries:['core-studio']}];
admin.data=data;
vm.runInContext('currentTutorials = data; libraryFilter.value = "core-studio"; renderTutorials();',admin);
let rows=doc.getElementById('tutorialList').children;
assert.equal(rows.length,2);
assert.equal(rows[1].children[1].children[0].textContent,'Episode 02');
vm.runInContext('libraryFilter.value = "all"; renderTutorials();',admin);
rows=doc.getElementById('tutorialList').children;
assert.equal(rows.length,3);
assert.equal(rows[2].children[1].children[0].textContent,'Catalogue Episode 03');
const editor=admin.createPreviewEditor(data[0]);
const inputs=editor.children.filter(x=>x.tagName==='label').map(x=>x.children[0]);
inputs[0].value='free'; inputs[1].value='New public title'; inputs[2].value='Materials'; inputs[3].value='4';
vm.runInContext('adminRequest = async (action, payload) => { globalThis.request = {action,payload}; return {tutorials:data}; };',admin);
await editor.children.at(-1).listeners.click();
assert.equal(admin.request.action,'admin_preview');
assert.equal(admin.request.payload.visibility,'free');
assert.equal(admin.request.payload.title,'New public title');
assert.equal(admin.request.payload.order,'4');
console.log('✓ Admin library numbering, filters and preview editor save payload verified without live writes');
