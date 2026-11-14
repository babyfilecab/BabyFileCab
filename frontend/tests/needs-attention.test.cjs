const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
const chunk=source.slice(source.indexOf('const NEEDS_ATTENTION_RULES'),source.indexOf('function needsAttentionSnoozeKey'));
const labels={'waiting-for-signature':'Waiting for Signature','8879-sent':'8879 Sent','ready-to-e-file':'Ready to E-file','drafting':'Drafting','signed':'Signed'};
const box={firmCalendarStatusLabel:s=>labels[s]||''};vm.createContext(box);
vm.runInContext(chunk+';this.findNeedsAttention=findNeedsAttention;',box);
const today='2026-11-13';
const items=[
 {date:'2026-11-01',clientId:'1',clientName:'Waiting Long',status:'waiting-for-signature',statusSince:'2026-11-03',preparerUsername:'amy'},
 {date:'2026-11-01',clientId:'2',clientName:'Waiting Short',status:'waiting-for-signature',statusSince:'2026-11-10',preparerUsername:'amy'},
 {date:'2026-11-10',clientId:'3',clientName:'Overdue Unstarted',preparerUsername:''},
 {date:'2026-11-20',clientId:'4',clientName:'Future',preparerUsername:'amy'},
 {date:'2026-10-01',clientId:'5',clientName:'Done',status:'completed',preparerUsername:'amy'},
 {date:'2026-11-01',clientId:'6',clientName:'Other Preparer',status:'8879-sent',statusSince:'2026-11-01',preparerUsername:'bob'},
 {date:'2026-11-05',clientId:'7',clientName:'Legacy Ready',status:'ready-to-e-file',preparerUsername:'amy'},
];
const staff=box.findNeedsAttention(items,today,{username:'Amy',role:'staff'}).map(e=>e.item.clientName);
assert.deepEqual(Array.from(staff),['Waiting Long','Legacy Ready','Overdue Unstarted']);
const admin=box.findNeedsAttention(items,today,{username:'amy',role:'administrator'});
assert.ok(admin.some(e=>e.item.clientName==='Other Preparer'));
assert.equal(admin[0].item.clientName,'Other Preparer');
assert.match(admin.find(e=>e.item.clientId==='1').reason,/Waiting for Signature for 10 days/);
assert.match(admin.find(e=>e.item.clientId==='3').reason,/Scheduled 3 days ago/);
console.log('needs attention tests passed');
