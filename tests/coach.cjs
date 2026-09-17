// Contract tests: real SQLite transactions and the actual MCP request handler.
// Run with: node --test tests/coach.cjs
const {test,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const sql=new DatabaseSync(':memory:');
for(const file of fs.readdirSync(path.join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())sql.exec(fs.readFileSync(path.join(root,'drizzle',file),'utf8'));
let beforeBatch=null,failAfterReceipt=false;
class Statement {
  constructor(query,values=[]){this.query=query;this.values=values;}
  bind(...values){return new Statement(this.query,values);}
  async first(){return sql.prepare(this.query).get(...this.values)??null;}
  async all(){return {results:sql.prepare(this.query).all(...this.values),success:true};}
  async run(){sql.prepare(this.query).all(...this.values);return {success:true};}
}
const db={prepare:q=>new Statement(q),async batch(statements){
  if(beforeBatch){const fn=beforeBatch;beforeBatch=null;fn();}
  sql.exec('BEGIN');
  try{const results=[];for(let i=0;i<statements.length;i++){if(i===1&&failAfterReceipt)throw new Error('Simulated write failure');results.push(await statements[i].all());}sql.exec('COMMIT');return results;}
  catch(error){sql.exec('ROLLBACK');throw error;}
}};
const cache=new Map();
function load(file){
  const full=path.resolve(root,file.endsWith('.ts')?file:file+'.ts');
  if(cache.has(full))return cache.get(full).exports;
  const module={exports:{}};cache.set(full,module);
  const source=ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const localRequire=id=>id==='cloudflare:workers'?{env:{DB:db}}:id.startsWith('.')?load(path.resolve(path.dirname(full),id)):id.startsWith('@/')?load(id.slice(2)):require(id);
  const fn=vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename:full});fn(localRequire,module,module.exports);return module.exports;
}
const {handleMcp}=load('lib/mcp');
const {executeCommand}=load('lib/writes');
const {EMPTY_DAY}=load('lib/metrics');
const {parseHealthTransfer,healthValues}=load('lib/health');
const {handleHealthRequest}=load('lib/health-server');
let n=0;
const date='2020-09-16';
const rid=()=>`request_${++n}_unique`;
async function rpc(owner,method,params={},extra={}){
  const response=await handleMcp(new Request('https://tracker.test/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream',...extra},body:JSON.stringify({jsonrpc:'2.0',id:++n,method,params})}),owner);
  return {status:response.status,body:await response.json()};
}
async function tool(name,args={},owner='alice'){
  const {body}=await rpc(owner,'tools/call',{name,arguments:args});return body.result;
}
async function success(name,args={},owner='alice'){
  const r=await tool(name,args,owner);assert.equal(r.isError,false,JSON.stringify(r));return r.structuredContent;
}
const rowCount=table=>sql.prepare(`SELECT count(*) n FROM ${table}`).get().n;
beforeEach(()=>{for(const table of ['daily_entries','preferences','habits','habit_logs','tool_requests','health_imports'])sql.exec(`DELETE FROM ${table}`);beforeBatch=null;failAfterReceipt=false;});

test('MCP handshake, discovery, errors, and authenticated origin boundary',async()=>{
  assert.equal((await rpc(null,'tools/list')).status,401);
  assert.equal((await rpc('alice','tools/list',{}, {origin:'https://attacker.test'})).status,403);
  assert.equal((await rpc('alice','tools/list',{}, {'mcp-protocol-version':'not-supported'})).status,400);
  const init=await rpc('alice','initialize',{protocolVersion:'2025-06-18',clientInfo:{name:'test',version:'1'},capabilities:{}});
  assert.equal(init.body.result.protocolVersion,'2025-06-18');
  const list=(await rpc('alice','tools/list')).body.result.tools;
  assert.equal(list.length,8);assert.equal(new Set(list.map(t=>t.name)).size,8);
  assert.equal(list.filter(t=>t.annotations.readOnlyHint).length,2);
  assert.equal((await rpc('alice','tools/call',{name:'not_a_tool'})).body.error.code,-32602);
  const notification=await handleMcp(new Request('https://tracker.test/mcp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})}),'alice');
  assert.equal(notification.status,202);assert.equal(await notification.text(),'');
  assert.equal((await handleMcp(new Request('https://tracker.test/mcp'),'alice')).status,405);
  assert.equal(rowCount('daily_entries'),0);
});

test('daily totals replace only named fields and default reads exclude notes',async()=>{
  await success('log_daily_metrics',{requestId:rid(),date,expectedRevision:0,values:{study:90,sleep:7.5},appendNote:'PRIVATE JOURNAL'});
  await success('log_daily_metrics',{requestId:rid(),date,expectedRevision:1,values:{study:120},fatigue:3});
  const day=await success('read_day',{date});
  assert.equal(day.revision,2);assert.equal(day.values.study,120);assert.equal(day.values.sleep,7.5);assert.equal(day.fatigue,3);
  assert.equal('note' in day,false);assert.equal(JSON.stringify(await success('read_week',{endDate:date})).includes('PRIVATE JOURNAL'),false);
  assert.equal((await success('read_day',{date,includeNotes:true})).note,'PRIVATE JOURNAL');
  assert.equal((await success('read_week',{endDate:date})).metrics.study.count,1);
});

test('append workout retries once, preserves manual edits, and omits exercise notes',async()=>{
  await executeCommand('alice',{action:'saveDay',date,revision:0,...EMPTY_DAY,values:{study:45},note:'OLD PRIVATE NOTE'});
  const args={requestId:rid(),date,expectedRevision:1,exercises:[{name:'Squat',sets:[{reps:10,weight:60},{reps:10,weight:60},{reps:10,weight:60}],note:'PRIVATE EXERCISE NOTE'}]};
  const first=await success('log_workout',args),second=await success('log_workout',args);
  assert.equal(second.replayed,true);assert.deepEqual(second.changes,first.changes);
  assert.equal(JSON.stringify(first).includes('PRIVATE EXERCISE NOTE'),false);
  const day=await success('read_day',{date});
  assert.equal(day.exercises.length,1);assert.equal(day.exercises[0].sets.length,3);assert.equal(day.values.study,45);assert.equal(day.workout,'trained');assert.equal(day.revision,2);
  assert.equal(rowCount('tool_requests'),1);
  const different=await tool('log_workout',{...args,exercises:[{name:'Squat',sets:[{reps:10,weight:80}]}]});assert.equal(different.structuredContent.error,'conflict');
});

test('meal totals use whole portions, preserve missing nutrients, and retries do not duplicate',async()=>{
  const args={requestId:rid(),date,expectedRevision:0,meals:[{name:'Yoghurt',portion:'200 g',type:'Breakfast',nutrients:{calories:140,protein:20,carbs:10,fat:2}}]};
  await success('log_meals',args);await success('log_meals',args);
  const day=await success('read_day',{date});assert.equal(day.meals.length,1);assert.equal(day.values.calories,140);assert.equal(day.values.protein,20);assert.equal(day.values.sodium,undefined);
  const invalid=await tool('log_meals',{...args,requestId:rid(),expectedRevision:1,meals:[{name:'Food',portion:'one bowl',type:'Lunch',nutrients:{calories:300}}]});assert.equal(invalid.structuredContent.error,'invalid_input');assert.equal(rowCount('tool_requests'),1);
});

test('owner isolation applies to records, habits and idempotency receipts',async()=>{
  const id=rid();await success('log_daily_metrics',{requestId:id,date,expectedRevision:0,values:{weight:72}});
  assert.equal((await success('read_day',{date},'bob')).revision,0);
  await success('log_daily_metrics',{requestId:id,date,expectedRevision:0,values:{weight:80}},'bob');
  assert.equal((await success('read_day',{date})).values.weight,72);
  const h=await success('create_habit',{requestId:rid(),date,name:'Read'});
  const forbidden=await tool('set_habit_completion',{requestId:rid(),date,habitId:h.habit.id,completed:true},'bob');assert.equal(forbidden.isError,true);assert.equal(rowCount('habit_logs'),0);
  const spoof=await tool('read_day',{date,owner:'bob'});assert.equal(spoof.structuredContent.error,'invalid_input');
});

test('stale revisions reject without overwriting or recording a false success',async()=>{
  await success('log_daily_metrics',{requestId:rid(),date,expectedRevision:0,values:{study:60}});
  const stale=await tool('log_daily_metrics',{requestId:rid(),date,expectedRevision:0,values:{sleep:8}});
  assert.equal(stale.structuredContent.error,'conflict');assert.equal(rowCount('tool_requests'),1);assert.equal((await success('read_day',{date})).values.sleep,undefined);
});

test('a competing UI write between read and transaction preserves the newer data',async()=>{
  await executeCommand('alice',{action:'saveDay',date,revision:0,...EMPTY_DAY,values:{study:60}});
  beforeBatch=()=>sql.prepare('UPDATE daily_entries SET revision=2,payload=? WHERE owner=? AND date=?').run(JSON.stringify({...EMPTY_DAY,values:{study:120}}),'alice',date);
  const conflict=await tool('log_daily_metrics',{requestId:rid(),date,expectedRevision:1,values:{study:90}});
  assert.equal(conflict.structuredContent.error,'conflict');assert.equal(rowCount('tool_requests'),0);assert.equal((await success('read_day',{date})).values.study,120);
});

test('transaction failure rolls back both the receipt and the data, allowing safe retry',async()=>{
  const args={requestId:rid(),date,expectedRevision:0,values:{sleep:8}};
  failAfterReceipt=true;assert.equal((await tool('log_daily_metrics',args)).isError,true);
  assert.equal(rowCount('tool_requests'),0);assert.equal(rowCount('daily_entries'),0);
  failAfterReceipt=false;await success('log_daily_metrics',args);assert.equal(rowCount('tool_requests'),1);assert.equal((await success('read_day',{date})).values.sleep,8);
});

test('goal patches preserve unspecified targets and stale goal revisions fail',async()=>{
  await executeCommand('alice',{action:'saveSettings',revision:0,settings:{goals:{sleep:8},examName:'',examDate:''}});
  const a={requestId:rid(),expectedRevision:1,goals:{study:120}};
  await success('update_goals',a);await success('update_goals',a);
  const week=await success('read_week',{endDate:date});assert.equal(week.goals.study,120);assert.equal(week.goals.sleep,8);assert.equal(week.settingsRevision,2);
  assert.equal((await tool('update_goals',{requestId:rid(),expectedRevision:1,goals:{sleep:7}})).structuredContent.error,'conflict');
});

test('habits are created and completed once; archived habits reject completion',async()=>{
  const args={requestId:rid(),date,name:'Read ten pages'};
  const h=await success('create_habit',args);await success('create_habit',args);
  const complete={requestId:rid(),date,habitId:h.habit.id,completed:true};await success('set_habit_completion',complete);await success('set_habit_completion',complete);
  assert.equal(rowCount('habits'),1);assert.equal(rowCount('habit_logs'),1);
  await executeCommand('alice',{action:'archiveHabit',id:h.habit.id,archived:true});
  assert.equal((await tool('set_habit_completion',{...complete,requestId:rid()})).isError,true);
});

test('invalid dates, metric ranges and empty changes leave records untouched',async()=>{
  for(const patch of [{date:'2020-02-30',values:{study:10}},{date:'2099-01-01',values:{study:10}},{values:{weight:0}},{values:{sleep:25}},{values:{study:1.5}},{values:{protein:50}},{values:{}}]){
    const r=await tool('log_daily_metrics',{requestId:rid(),date,expectedRevision:0,...patch});assert.equal(r.isError,true);
  }
  assert.equal(rowCount('tool_requests'),0);assert.equal(rowCount('daily_entries'),0);
});

function healthBody(readings=[{metric:'steps',value:15000,unit:'count',source:'iPhone'}],expectedRevision=0){
  return {requestId:crypto.randomUUID(),expectedRevision,transfer:{version:1,date,readings}};
}
async function healthPost(body,owner='alice',headers={}){
  const response=await handleHealthRequest(new Request('https://tracker.test/api/health',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}),owner);
  return {status:response.status,body:await response.json()};
}
test('Health import requires identity and rejects cross-site, future, duplicate and unsupported values',async()=>{
  const body=healthBody();
  assert.equal((await healthPost(body,null)).status,401);
  assert.equal((await healthPost(body,'alice',{origin:'https://attacker.test'})).status,403);
  assert.equal((await healthPost(body,'alice',{'sec-fetch-site':'cross-site'})).status,403);
  for(const readings of [
    [{metric:'steps',value:15000,unit:'kg',source:'iPhone'}],
    [{metric:'weight',value:0,unit:'kg',source:'Scales'}],
    [{metric:'study',value:90,unit:'minutes',source:'Health'}],
    [{metric:'steps',value:1.5,unit:'count',source:'iPhone'}],
    [{metric:'sleep',value:1500,unit:'minutes',source:'Watch'}],
    [...body.transfer.readings,...body.transfer.readings],
    []
  ]) assert.equal((await healthPost(healthBody(readings))).status,400);
  assert.equal((await healthPost({...body,owner:'bob'})).status,400);
  assert.equal((await healthPost({...body,transfer:{...body.transfer,date:'2099-01-01'}})).status,400);
  assert.equal(rowCount('daily_entries'),0);assert.equal(rowCount('health_imports'),0);
});

test('Health values replace selected totals, convert units, and preserve meals, study and notes',async()=>{
  await executeCommand('alice',{action:'saveDay',date,revision:0,...EMPTY_DAY,values:{study:90,steps:3000},note:'PRIVATE JOURNAL',meals:[{id:crypto.randomUUID(),name:'Meal',portion:'one',type:'Lunch',nutrients:{calories:500,protein:40,carbs:50,fat:15}}]});
  const a=healthBody([{metric:'weight',value:160,unit:'lb',source:'Scales'},{metric:'water',value:2.5,unit:'L',source:'Water app'},{metric:'sleep',value:480,unit:'minutes',source:'Watch'},{metric:'steps',value:18000,unit:'count',source:'iPhone'}],1);
  const r=await healthPost(a);assert.equal(r.status,200,JSON.stringify(r));
  const day=await success('read_day',{date,includeNotes:true});
  assert.equal(day.values.steps,18000);assert.equal(day.values.study,90);assert.equal(day.values.sleep,8);assert.equal(day.values.water,2500);assert.equal(day.values.weight,72.574779);assert.equal(day.values.calories,500);assert.equal(day.note,'PRIVATE JOURNAL');assert.equal(day.meals.length,1);
  assert.equal(JSON.stringify(r.body).includes('PRIVATE JOURNAL'),false);
  const preview=await handleHealthRequest(new Request('https://tracker.test/api/health?date='+date),'alice');
  assert.equal(JSON.stringify(await preview.json()).includes('PRIVATE JOURNAL'),false);
  assert.equal(preview.headers.get('cache-control'),'private, no-store');
});

test('Health save receipts recover a lost response and isolate accounts',async()=>{
  const a=healthBody();
  const first=await healthPost(a),repeat=await healthPost(a);
  assert.equal(first.status,200);assert.equal(repeat.body.replayed,true);assert.equal(rowCount('health_imports'),1);assert.equal((await success('read_day',{date})).revision,1);
  const modified={...a,transfer:{...a.transfer,readings:[{...a.transfer.readings[0],value:20000}]}};
  assert.equal((await healthPost(modified)).status,409);
  assert.equal((await healthPost(modified,'bob')).status,200);
  assert.equal((await success('read_day',{date})).values.steps,15000);
  assert.equal((await success('read_day',{date},'bob')).values.steps,20000);
  const history=await handleHealthRequest(new Request('https://tracker.test/api/health'),'alice');
  const records=await history.json();assert.equal(records.imports.length,1);assert.equal(records.imports[0].values.steps,15000);
});

test('Health conflict and transaction failure never partly save or erase another edit',async()=>{
  await executeCommand('alice',{action:'saveDay',date,revision:0,...EMPTY_DAY,values:{study:90}});
  assert.equal((await healthPost(healthBody())).status,409);
  const a=healthBody(undefined,1);
  beforeBatch=()=>sql.prepare('UPDATE daily_entries SET revision=2,payload=? WHERE owner=? AND date=?').run(JSON.stringify({...EMPTY_DAY,values:{study:120}}),'alice',date);
  assert.equal((await healthPost(a)).status,409);assert.equal(rowCount('health_imports'),0);assert.equal((await success('read_day',{date})).values.study,120);
  failAfterReceipt=true;
  const b=healthBody(undefined,2);
  assert.equal((await healthPost(b)).status,503);assert.equal(rowCount('health_imports'),0);assert.equal((await success('read_day',{date})).values.steps,undefined);
  failAfterReceipt=false;assert.equal((await healthPost(b)).status,200);assert.equal(rowCount('health_imports'),1);
});

test('Shortcuts text accepts numbers but rejects missing, conflicting and malformed fields',()=>{
  const raw='TMM_HEALTH_V1\ndate='+date+'\nmetric=steps\nunit=count\nvalue=15,000\nsource=iPhone';
  assert.equal(healthValues(parseHealthTransfer(raw).readings).steps,15000);
  for(const wrong of [raw.replace('15,000',''),raw.replace('15,000','15,5'),raw+'\nvalue=2',raw+'\nowner=bob',raw.replace(date,'2020-02-30'),raw.replace('unit=count','unit=kg')])assert.throws(()=>parseHealthTransfer(wrong));
  assert.throws(()=>parseHealthTransfer('TMM_HEALTH_V1\n'+('x'.repeat(16000))));
});

test('Sleep import merges duplicate stages and excludes awake/in-bed in the UK wake-date window',()=>{
  const raw='TMM_SLEEP_V1\ndate=2020-09-16\nsource=Watch\n'+[
    '2020-09-15T22:00:00+01:00|2020-09-16T06:00:00+01:00|In Bed',
    '2020-09-15T23:00:00+01:00|2020-09-16T01:00:00+01:00|Asleep',
    '2020-09-15T23:00:00+01:00|2020-09-16T01:00:00+01:00|Asleep (Core)',
    '2020-09-16T01:00:00+01:00|2020-09-16T02:00:00+01:00|Awake',
    '2020-09-16T02:00:00+01:00|2020-09-16T06:00:00+01:00|REM',
    '2020-09-16T14:00:00+01:00|2020-09-16T15:00:00+01:00|Asleep'
  ].join('\n');
  assert.equal(healthValues(parseHealthTransfer(raw).readings).sleep,6);
  assert.throws(()=>parseHealthTransfer(raw.replace('|REM','|Unknown stage')));
  assert.throws(()=>parseHealthTransfer(raw.replace('2020-09-15T22:00:00+01:00','2020-02-30T22:00:00+01:00')));
  assert.throws(()=>parseHealthTransfer('TMM_SLEEP_V1\ndate=2020-09-16\nsource=Watch'));
  const dst='TMM_SLEEP_V1\ndate=2020-10-25\nsource=Watch\n2020-10-24T23:00:00+01:00|2020-10-25T07:00:00+00:00|Asleep';
  assert.equal(healthValues(parseHealthTransfer(dst).readings).sleep,9);
});
