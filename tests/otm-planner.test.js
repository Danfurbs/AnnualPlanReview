const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const otm = require('../otm-forecast');
const periods = value => Object.fromEntries(Array.from({length:13},(_,i)=>['P'+(i+1),value]));
function fixture() {
 const nodes=new Map(),tabs=['shifts','rates','review'].map(t=>({dataset:{otmTab:t},classList:{toggle(){}},setAttribute(){}}));
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',hidden:false,disabled:false,dataset:{},classList:{toggle(){}},focus(){},scrollIntoView(){},querySelectorAll:()=>[],addEventListener(name,fn){this[name]=fn}});return nodes.get(id)};
 let dialog,source=new Map(),fail=false,readFail=false,saveCalls=0,loadCalls=0,importRows=[],saveArgs;
 const document={getElementById:node,body:{appendChild(){}},createElement:()=>{
  dialog={open:false,innerHTML:'',setAttribute(){},querySelectorAll:()=>tabs,addEventListener(name,fn){this[name]=fn},showModal(){this.open=true},close(){this.open=false}};return dialog;
 }};
 const window={OtmForecast:otm,ForecastModel:require('../forecast-model'),workGroupSets:new Map([['A','Track A'],['B','Track B'],['OTHER','Other Engineer']]),resolveWorkGroupCode:v=>v,
  STANDARD_JOBS:otm.JOBS.map(standardJobNo=>({standardJobNo,standardJobDescription:'OTM '+standardJobNo,unitOfMeasure:'Miles'})),confirm:()=>true,addEventListener(){},Toast:{success(){}},
  XLSX:{read:()=>({Sheets:{Data:{}},SheetNames:['Data']}),utils:{sheet_to_json:()=>importRows}}
 };
 vm.runInNewContext(fs.readFileSync('otm-planner.js','utf8'),{window,document,structuredClone,Map,Set,setTimeout,URL,Blob,console});
 const config={year:'FY27',engineerId:'eng-a',engineers:[{id:'eng-a',name:'Engineer A',workGroupSets:['A','B']},{id:'eng-b',name:'Engineer B',workGroupSets:['OTHER']}],
  load:async()=>{loadCalls++;if(readFail)throw Error('Read failed');return {data:structuredClone(source)}},
  save:async(...args)=>{saveCalls++;saveArgs=args;if(fail)return false;source=structuredClone(args[0]);return true},onSaved(){}};
 const event=dataset=>({target:{closest:()=>({dataset})}});
 return {window,node,config,tabs,event,source:()=>source,setSource:s=>source=s,dialog:()=>dialog,fail:v=>fail=v,readFail:v=>readFail=v,saves:()=>saveCalls,loads:()=>loadCalls,saveArgs:()=>saveArgs,importRows:r=>importRows=r,
  open:()=>window.OtmPlanner.open(config),
  clickTab:t=>tabs.find(b=>b.dataset.otmTab===t).onclick(),
  shifts:async values=>{importRows=values;await node('otmFile').onchange({target:{files:[{name:'shifts.csv',arrayBuffer:async()=>new ArrayBuffer(0)}]}})},
  rate:(value,index=0)=>node('otmRateCards').change({target:{closest:()=>({dataset:{otmRate:String(index)},value:String(value),validity:{valid:true}})}})
 };
}
const shiftRows=n=>Array.from({length:13},(_,p)=>({sjn:9112,period:p+1,shifts:n}));

test('unused template jobs stay excluded and supplied Engineer/FY identifiers are validated',async()=>{
 const f=fixture();await f.open();
 const rows=otm.JOBS.flatMap(sjn=>Array.from({length:13},(_,p)=>({fy:'FY27',engineer:'eng-a',sjn,period:p+1,shifts:sjn==='009112'?2:''})));
 await f.shifts(rows);f.rate(.5);f.clickTab('review');assert.equal(f.node('otmApply').disabled,false);
 assert.doesNotMatch(f.node('otmReviewRows').innerHTML,/009113/);
 await f.shifts([{fy:'FY28',engineer:'eng-b',sjn:9112,period:1,shifts:99}]);assert.match(f.node('otmImportStatus').textContent,/different Engineer or FY/);
 await f.node('otmApply').onclick();assert.equal(f.source().get('009112').wgs.A.P1,1);assert.equal(f.source().has('009113'),false);
});

test('planner opens in the selected Engineer/FY with no invented rates and only useful summary cards',async()=>{
 const f=fixture();await f.open();assert.equal(f.dialog().open,true);assert.equal(f.node('otmYear').textContent,'FY27 · V0');
 assert.match(f.node('otmStats').innerHTML,/Allocated shifts/);assert.match(f.node('otmStats').innerHTML,/Missing shift inputs/);
 assert.doesNotMatch(f.node('otmStats').innerHTML,/Forecast basis|Review status|priority/i);
 assert.equal(f.node('otmRateValue').textContent,'—');assert.match(f.node('otmRateCards').innerHTML,/value=""/);
 assert.doesNotMatch(f.dialog().innerHTML,/precedence|TAKES PRIORITY/);
 assert.match(f.dialog().innerHTML,/overwrite existing V0 volumes/);
});
test('import, rate edits, WG selection and apply save to the selected destination, with reloadable inputs',async()=>{
 const f=fixture();await f.open();await f.shifts(shiftRows(2));f.rate(.5);
 f.node('otmWorkGroup').onchange({target:{value:'B'}});f.clickTab('review');
 assert.equal(f.node('otmApply').disabled,false);assert.match(f.node('otmReviewRows').innerHTML,/Track B/);
 await f.node('otmApply').onclick();assert.equal(f.saves(),1);
 assert.equal(f.source().get('009112').wgs.B.P1,1);assert.equal(f.source().get('009112').sources.B.otmPlan.rate,.5);
 assert.equal(f.window.OtmPlanner.hasDirtyChanges(),false);assert.equal(f.saveArgs()[1],'FY27');
 f.node('otmClose').onclick();await f.open();assert.equal(f.node('otmRateValue').textContent,'0.5');
 assert.match(f.node('otmPeriods').innerHTML,/value="2"/);
});
test('failed saves retain draft and retry; unresolved periods cannot apply',async()=>{
 const f=fixture();await f.open();await f.shifts([{sjn:9112,period:1,shifts:0}]);f.rate(.5);f.clickTab('review');
 assert.equal(f.node('otmApply').disabled,true);assert.match(f.node('otmReviewRows').innerHTML,/Missing inputs/);
 await f.shifts(shiftRows(0));f.fail(true);await f.node('otmApply').onclick();
 assert.equal(f.source().size,0);assert.equal(f.window.OtmPlanner.hasDirtyChanges(),true);assert.match(f.node('otmStatus').textContent,/not confirmed/);
 f.fail(false);await f.node('otmApply').onclick();assert.equal(f.source().get('009112').wgs.A.P1,0);
});
test('concurrent edits in the Engineer scope block application, while unrelated changes survive',async()=>{
 const f=fixture();await f.open();await f.shifts(shiftRows(2));f.rate(.5);f.clickTab('review');
 f.setSource(new Map([['009112',{wgs:{A:{P1:99}}}]]));await f.node('otmApply').onclick();
 assert.equal(f.saves(),0);assert.equal(f.window.OtmPlanner.hasDirtyChanges(),true);assert.match(f.node('otmStatus').textContent,/another session/);
 f.setSource(new Map([['009112',{wgs:{OTHER:{P1:99}}}],['009144',{wgs:{A:{P1:50}}}]]));await f.node('otmApply').onclick();
 assert.equal(f.saves(),1);assert.equal(f.source().get('009112').wgs.OTHER.P1,99);assert.equal(f.source().get('009144').wgs.A.P1,50);
});
test('Engineer switches retain independent drafts and refuse foreign Work Group selection',async()=>{
 const f=fixture();await f.open();await f.shifts(shiftRows(2));f.rate(.5);
 f.node('otmEngineers').onclick(f.event({otmEngineer:'eng-b'}));assert.equal(f.node('otmRateValue').textContent,'—');
 f.node('otmWorkGroup').onchange({target:{value:'A'}});await f.shifts(shiftRows(4));f.rate(1);f.clickTab('review');await f.node('otmApply').onclick();
 assert.equal(f.source().get('009112').wgs.OTHER.P1,4);assert.equal(f.source().get('009112').wgs.A,undefined);
 f.node('otmEngineers').onclick(f.event({otmEngineer:'eng-a'}));assert.equal(f.node('otmRateValue').textContent,'0.5');
 await f.node('otmApply').onclick();assert.equal(f.source().get('009112').wgs.A.P1,1);assert.equal(f.source().get('009112').wgs.OTHER.P1,4);
});
test('invalid import changes nothing, failed reads do not save, and stale file reads cannot cross Engineers',async()=>{
 const f=fixture();await f.open();await f.shifts(shiftRows(2));f.rate(.5);
 await f.shifts([{sjn:9112,period:1,shifts:99},{sjn:9112,period:1,shifts:88}]);assert.match(f.node('otmImportStatus').textContent,/No inputs changed/);
 f.readFail(true);f.clickTab('review');await f.node('otmApply').onclick();assert.equal(f.saves(),0);assert.equal(f.window.OtmPlanner.hasDirtyChanges(),true);
 f.readFail(false);await f.node('otmApply').onclick();assert.equal(f.source().get('009112').wgs.A.P1,1);
 let finish;f.importRows(shiftRows(99));const pending=f.node('otmFile').onchange({target:{files:[{name:'late.csv',arrayBuffer:()=>new Promise(resolve=>finish=resolve)}]}});
 f.node('otmEngineers').onclick(f.event({otmEngineer:'eng-b'}));finish(new ArrayBuffer(0));await pending;
 assert.doesNotMatch(f.node('otmPeriods').innerHTML,/value="99"/);assert.equal(f.node('otmRateValue').textContent,'—');
});
