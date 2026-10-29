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

// Age remains authoritative even when a teen chooses “Myself” or a parent enrols an adult.
const registrationSource = readFileSync('gcs-website/assets/site-access.js', 'utf8');
const guardianFunction = registrationSource.slice(registrationSource.indexOf('  function syncGuardianField() {'), registrationSource.indexOf("  document.getElementById('participantAge').addEventListener"));
const registrationNodes = Object.fromEntries(['participantAge','learnerType','guardianField','guardianName','guardianRequired','guardianHint'].map(id => [id, {}]));
const registrationLabels = {};
const registrationContext = vm.createContext({document:{getElementById:id=>registrationNodes[id],querySelector:selector=>registrationLabels[selector] ||= {}}});
vm.runInContext(guardianFunction, registrationContext);
for (const [age, type, visible, required] of [['','self',false,false],['','child',true,false],['17','self',true,true],['17','child',true,true],['18','self',false,false],['24','child',false,false],['','self',false,false]]) {
  registrationNodes.participantAge.value = age;
  registrationNodes.learnerType.value = type;
  registrationContext.syncGuardianField();
  assert.equal(registrationNodes.guardianField.hidden, !visible);
  assert.equal(registrationNodes.guardianName.required, required);
}
assert.equal(ctx.validateRegistration_({...form,experience:'Some hobby experience',requests:'Returning to drawing after a break.'}).ok,true);
console.log('✓ Adult, teen, parent and reset guardian-field states verified');

// Admin enhancements: exercise owner-only routing, sheet writes, library ordering and UI state.
assert.equal(ctx.doPost({parameter:{action:'admin_registration_followup',rowNumber:2}}).code,'missing_token');
assert.equal(ctx.doPost({parameter:{action:'admin_position',videoId:'naUyVYZzo2Y',position:2}}).code,'missing_token');
const ordered = [
  {id:'core0000001',title:'One',libraries:['core-studio']},
  {id:'young000001',title:'Young',libraries:['young-artists']},
  {id:'shared00001',title:'Shared',libraries:['core-studio','young-artists']},
  {id:'core0000002',title:'Two',libraries:['core-studio']}
];
saved=JSON.stringify(ordered.map((t,index)=>({...t,number:`Episode ${index+1}`})));
assert.equal(ctx.handleAdminAction_('admin_position',{videoId:'core0000001',position:3,library:'core-studio'},{}).approved,true);
assert.deepEqual(JSON.parse(saved).filter(t=>t.libraries.includes('core-studio')).map(t=>t.id),['shared00001','core0000002','core0000001']);
assert.ok(JSON.parse(saved).find(t=>t.id==='shared00001').libraries.includes('young-artists'));
ctx.handleAdminAction_('admin_position',{videoId:'core0000001',position:1,library:'core-studio'},{});
assert.equal(JSON.parse(saved).filter(t=>t.libraries.includes('core-studio'))[0].id,'core0000001');
const beforeInvalid=saved;
for (const position of [0,4,1.5]) assert.equal(ctx.handleAdminAction_('admin_position',{videoId:'core0000001',position,library:'core-studio'},{}).code,'invalid_tutorial_position');
assert.equal(saved,beforeInvalid);
assert.equal(ctx.handleAdminAction_('admin_position',{videoId:'core0000001',position:1,library:'young-artists'},{}).code,'video_not_found');

const sheetRows=[['Timestamp','Student name','Email','Follow-up status'],['2026-10-01','Artist','artist@example.com','New']];
const sheet={
  getLastRow:()=>sheetRows.length,getLastColumn:()=>sheetRows[0].length,
  getDataRange:()=>({getValues:()=>sheetRows}),
  getRange(row,col,count=1,width=1){return {
    getDisplayValues:()=>sheetRows.slice(row-1,row-1+count).map(r=>r.slice(col-1,col-1+width)),
    setNumberFormat(){return this},setValue(value){sheetRows[row-1][col-1]=String(value).replace(/^'(?==)/,'');return this}
  }}
};
ctx.testSheet=sheet;
vm.runInContext('getRegistrationSheet_ = () => testSheet;',ctx);
let followup=ctx.handleAdminAction_('admin_registration_followup',{rowNumber:2,adminNotes:'=literal owner note',followupDate:'2026-10-30'},{});
assert.equal(followup.approved,true);
assert.equal(followup.registrations[0].adminNotes,'=literal owner note');
assert.equal(followup.registrations[0].followupDate,'2026-10-30');
assert.equal(sheetRows[0].length,6);
ctx.handleAdminAction_('admin_registration_followup',{rowNumber:2,adminNotes:'Revised',followupDate:''},{});
assert.equal(sheetRows[0].length,6);
assert.equal(ctx.getRegistrations_()[0].followupDate,'');
for(const date of ['2026-02-30','wrong']) assert.equal(ctx.handleAdminAction_('admin_registration_followup',{rowNumber:2,followupDate:date},{}).code,'invalid_followup');
assert.equal(ctx.handleAdminAction_('admin_registration_followup',{rowNumber:2,adminNotes:'a'.repeat(3001)},{}).code,'invalid_followup');
assert.equal(ctx.handleAdminAction_('admin_registration_followup',{rowNumber:99},{}).code,'registration_not_found');

admin.progressData=[
  {email:'none@example.com',name:'Zoe',completedCount:0,totalCount:3,percent:0,lastActivity:''},
  {email:'some@example.com',name:'Amy',completedCount:1,totalCount:3,percent:33,lastActivity:'2026-10-01',completedVideoIds:['core0000001']},
  {email:'all@example.com',name:'Ben',completedCount:3,totalCount:3,percent:100,lastActivity:'2026-10-20'}
];
admin.regData=[{rowNumber:2,email:'some@example.com',participantName:'Amy',status:'New',followupDate:'2020-01-01',adminNotes:'Call parent'}];
vm.runInContext('currentProgress = progressData; currentStudents = progressData.map(s=>s.email); currentStudentProfiles = progressData; currentRegistrations = regData; registrationsLoaded = true; enhancementsAvailable = true; progressFilter.value="all"; progressSort.value="recent"; renderProgress(); renderOverview();',admin);
let progressRows=doc.getElementById('progressList').children;
assert.equal(progressRows[0].children[0].children[0].children[0].textContent,'Ben');
assert.equal(doc.getElementById('overviewNoCompletionsCount').textContent,'1');
assert.equal(doc.getElementById('overviewNewCount').textContent,'1');
assert.equal(doc.getElementById('overviewFollowupsCount').textContent,'1');
for(const [filter,email] of [['none','none@example.com'],['progress','some@example.com'],['completed','all@example.com']]) {
  doc.getElementById('progressFilter').value=filter; admin.renderProgress();
  progressRows=doc.getElementById('progressList').children; assert.equal(progressRows.length,1);
  assert.equal(progressRows[0].children[0].children[0].children[1].textContent,email);
}
vm.runInContext('progressFilter.value="all"; progressSort.value="name"; renderProgress();',admin);
assert.equal(doc.getElementById('progressList').children[0].children[0].children[0].children[0].textContent,'Amy');
doc.getElementById('overviewNoCompletions').listeners.click();
assert.equal(doc.getElementById('progressFilter').value,'none');
doc.getElementById('overviewFollowups').listeners.click();
assert.equal(doc.getElementById('registrationFilter').value,'Due');
assert.equal(doc.getElementById('registrationList').children.length,1);
assert.equal(admin.followupDue({...admin.regData[0],status:'Closed'}),false);
assert.equal(admin.followupDue({...admin.regData[0],status:'Enrolled'}),false);
vm.runInContext('detailEmail="some@example.com"; renderStudentDetail();',admin);
assert.equal(doc.getElementById('studentDetail').hidden,false);
assert.equal(doc.getElementById('studentDetailTitle').textContent,'Amy');
const detailInfo=doc.getElementById('studentDetailContent').children[0];
assert.equal(detailInfo.children[1].children[1].textContent,'Approved');
assert.equal(detailInfo.children[2].children[1].textContent,'1 of 3 lessons');
admin.closeStudentDetail(); assert.equal(doc.getElementById('studentDetail').hidden,true);

const noteEditor=admin.createFollowupEditor(admin.regData[0]);
const noteForm=noteEditor.children[1];
noteForm.children[0].children[0].value='Follow up next week'; noteForm.children[1].children[0].value='2026-11-06';
vm.runInContext('adminRequest = async (action,payload) => {globalThis.request={action,payload};return {registrations:regData};};',admin);
await noteForm.listeners.submit({preventDefault(){}});
assert.equal(admin.request.action,'admin_registration_followup');
assert.equal(admin.request.payload.adminNotes,'Follow up next week');
assert.equal(admin.request.payload.followupDate,'2026-11-06');
vm.runInContext('libraryFilter.value="core-studio"; adminRequest=async(action,payload)=>{globalThis.request={action,payload};return {tutorials:data};};',admin);
const positionEditor=admin.createPositionEditor(data[0],1,2);
positionEditor.children[0].children[0].value=2;
await positionEditor.listeners.submit({preventDefault(){}});
assert.equal(admin.request.action,'admin_position');assert.equal(admin.request.payload.position,2);assert.equal(admin.request.payload.library,'core-studio');
vm.runInContext('enhancementsAvailable=false;',admin);
assert.equal(admin.createPositionEditor(data[0],1,2).children[1].disabled,true);
assert.equal(admin.createFollowupEditor(admin.regData[0]).children[1].children[2].disabled,true);
console.log('✓ Admin shortcuts, progress filters/sort, combined details, private follow-up persistence, date validation, direct lesson positioning and deployment compatibility verified without live writes');
