const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../games/focus/core.js');
const trial = (overrides = {}) => ({level:3,condition:'memory-3x3-3-650-15000',input:'mouse',screen:'small',valid:true,correct:true,responded:true,noGo:false,rt:800,errors:0,...overrides});
const session = (overrides = {}) => ({id:C.id(),game:'memory',rule:C.RULE,startedAt:'2026-09-27T12:00:00.000Z',endedAt:'2026-09-27T12:05:00.000Z',activeMs:270000,elapsedMs:300000,status:'completed',eligible:true,trials:Array.from({length:5},()=>trial()),...overrides});
function memoryStorage() { const map = new Map(); return { getItem:key=>map.get(key) ?? null, setItem:(key,value)=>map.set(key,value) }; }

test('empty metrics distinguish absence from zero', () => {
  const m=C.metrics([]); assert.equal(m.accuracy,null); assert.equal(m.rt,null); assert.equal(m.falseAlarm,null); assert.equal(m.miss,null);
});
test('no-go accuracy, false alarms and misses use separate denominators', () => {
  const m=C.metrics([trial({noGo:true,responded:false,rt:0}),trial({noGo:true,correct:false,errors:1}),trial(),trial({correct:false,responded:false,rt:0}),trial({valid:false})]);
  assert.equal(m.count,4); assert.equal(m.falseAlarm,.5); assert.equal(m.miss,.5); assert.equal(m.accuracy,.5); assert.equal(m.rt,800);
});
test('incorrect trials stay in accuracy and out of correct response median',()=>{
  const m=C.metrics([trial({rt:400}),trial({rt:800}),trial({correct:false,rt:10,errors:2})]); assert.equal(m.rt,600); assert.equal(m.accuracy,2/3); assert.equal(m.errors,2);
});
test('inactive completed session does not earn a reward',()=>{
  const s=session({trials:Array.from({length:20},()=>trial({responded:false,correct:false}))}); assert.equal(C.isComplete(s),false);
});
test('interrupted and too-short sessions are not completed',()=>{
  assert.equal(C.isComplete(session({status:'interrupted'})),false); assert.equal(C.isComplete(session({activeMs:2000})),false);
});
test('comparison separates difficulty, input, screen, and ignores interruptions',()=>{
  const a=session(), b=session({trials:[...Array.from({length:3},()=>trial()),trial({input:'touch'}),trial({level:4,condition:'memory-3x3-4-650-15000'}),trial({screen:'large'})]});
  const g=C.groups([a,b,session({status:'interrupted',eligible:false})],'memory'); assert.equal(g.length,4); assert.equal(g[0].rounds.length,2);
});
test('comparison uses non-overlapping first five and latest five rounds',()=>{
  const rows=Array.from({length:12},(_,i)=>session({startedAt:new Date(Date.UTC(2026,8,1+i)).toISOString(),trials:Array.from({length:5},()=>trial({correct:i>=5}))}));
  const group=C.groups(rows,'memory')[0]; const result=C.comparison(group); assert.equal(result.first.accuracy,0); assert.equal(result.recent.accuracy,1); assert.equal(C.comparison({...group,rounds:group.rounds.slice(0,9)}),null);
});
test('reward rarity boundary and duplicate ownership',()=>{
  assert.equal(C.draw(()=>.89999).rarity,'common'); assert.equal(C.draw(()=>.9).rarity,'rare'); assert.equal(C.draw(()=>.99).rarity,'special');
  const doc=C.fresh();doc.sessions=[session()];const today=C.dayKey(doc.sessions[0].endedAt);const skin=C.claim(doc,today,()=>0);
  assert.equal(doc.owned[skin.id],1);assert.throws(()=>C.claim(doc,today,()=>0));assert.equal(doc.owned[skin.id],1);
});
test('reward uses day of completion, not day of starting',()=>{
  const doc=C.fresh();doc.sessions=[session({startedAt:'2026-09-26T23:58:00',endedAt:'2026-09-27T00:03:00'})];
  assert.throws(()=>C.claim(doc,'2026-09-26',()=>0));assert.ok(C.claim(doc,'2026-09-27',()=>0));
});
test('queued concurrent claims only award once',async()=>{
  const store=new C.Store(memoryStorage());await store.saveSession(session());const today=C.dayKey(session().endedAt);
  const outcomes=await Promise.allSettled([store.update(d=>C.claim(d,today,()=>0)),store.update(d=>C.claim(d,today,()=>0))]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal(store.load().rewards.length,1);
});
test('re-saving the same round updates without duplicating and preserves other rounds',async()=>{
  const store=new C.Store(memoryStorage()), s=session(), other=session();await store.saveSession(s);await store.saveSession(other);s.trials.push(trial());await store.saveSession(s);
  const d=store.load();assert.equal(d.sessions.length,2);assert.equal(d.sessions[0].trials.length,6);
});
test('restoration preserves archived progress and collection',async()=>{
  const source=C.fresh();source.sessions=[session()];C.claim(source,C.dayKey(source.sessions[0].endedAt),()=>.995);source.equipped='aurora';
  const store=new C.Store(memoryStorage());await store.restore(source);const d=store.load();assert.equal(d.equipped,'aurora');assert.equal(d.sessions.length,1);assert.equal(d.rewards.length,1);
});
test('malformed and newer backups do not overwrite old data',async()=>{
  const store=new C.Store(memoryStorage());await store.saveSession(session());const old=JSON.stringify(store.load());
  assert.throws(()=>store.restore({...C.fresh(),version:999}));
  const bad=C.fresh();bad.sessions=[session(),session()];bad.sessions[1].id=bad.sessions[0].id;assert.throws(()=>store.restore(bad));assert.equal(JSON.stringify(store.load()),old);
});
test('storage quota failure leaves previous archive intact',async()=>{
  const storage=memoryStorage(),store=new C.Store(storage);await store.saveSession(session());const old=storage.getItem(C.KEY);
  storage.setItem=()=>{throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});};await assert.rejects(store.saveSession(session()));assert.equal(storage.getItem(C.KEY),old);
});
test('achievements count completed sessions and distinct training dates',()=>{
  const doc=C.fresh();doc.sessions=Array.from({length:10},()=>session());const a=C.achievements(doc);assert.equal(a[0].count,10);assert.equal(a[1].count,1);assert.equal(a[2].count,10);
});
