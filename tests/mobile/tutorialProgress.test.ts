import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgressStore, type LocalProgress } from '../../apps/mobile/src/tutorials/progressStore';
import { GUIDE_KEYS, GUIDES, stepsFor, stepPosition } from '../../apps/mobile/src/tutorials/catalog';
import type { TutorialProgress } from '../../apps/mobile/src/lib/api';

const nextTick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const stamp=(n:number)=>new Date(Date.UTC(2026,9,20,10,0,n)).toISOString();
function record(stepId:string,status:TutorialProgress['status']='in_progress'): TutorialProgress {
  return {guide:'quotes',version:1,status,stepId,updatedAt:stamp(1)};
}
test('un acuse antiguo no reemplaza el paso que la persona acaba de avanzar',async()=>{
  const cached:LocalProgress[]=[];const writes:TutorialProgress[]=[];
  let release:((value:TutorialProgress)=>void)|undefined;
  const store=createProgressStore({readLocal:async()=>[],writeLocal:async progress=>{cached.push(progress);},readRemote:async()=>[],
    writeRemote:progress=>{writes.push(progress);return writes.length===1?new Promise(resolve=>{release=resolve;}):Promise.resolve({...progress,updatedAt:stamp(3)});}});
  await store.initialize();
  store.save('quotes','in_progress','search');
  await nextTick();assert.equal(writes.length,1);
  store.save('quotes','in_progress','create');
  release!({...writes[0],updatedAt:stamp(2)});
  await store.flush();
  assert.equal(writes.length,2);
  assert.equal(store.getSnapshot().records.quotes?.stepId,'create');
  assert.equal(store.getSnapshot().records.quotes?.pending,false);
  assert.equal(cached.at(-1)?.stepId,'create');
});
test('sin conexión conserva el avance y lo sincroniza al abrir otra vez',async()=>{
  const disk=new Map<string,LocalProgress>();let online=false;const server=new Map<string,TutorialProgress>();
  const io={readLocal:async()=>[...disk.values()],writeLocal:async(progress:LocalProgress)=>{disk.set(progress.guide,progress);},
    readRemote:async()=>{if(!online)throw Error('offline');return[...server.values()];},
    writeRemote:async(progress:TutorialProgress)=>{if(!online)throw Error('offline');const saved={...progress,updatedAt:stamp(5)};server.set(progress.guide,saved);return saved;}};
  const first=createProgressStore(io);await first.initialize();
  first.save('quotes','in_progress','create');await first.flush();
  assert.equal(first.getSnapshot().records.quotes?.pending,true);
  assert.equal(disk.get('quotes')?.stepId,'create');first.dispose();
  online=true;const reopened=createProgressStore(io);await reopened.initialize();
  assert.equal(server.get('quotes')?.stepId,'create');
  assert.equal(reopened.getSnapshot().records.quotes?.pending,false);
});
test('una lectura anterior no retrocede un progreso ya confirmado',async()=>{
  let release:((rows:TutorialProgress[])=>void)|undefined;let requests=0;
  const store=createProgressStore({readLocal:async()=>[],writeLocal:async()=>{},
    readRemote:()=>++requests===1?Promise.resolve([record('search')]):new Promise(resolve=>{release=resolve;}),
    writeRemote:async progress=>({...progress,updatedAt:stamp(9)})});
  await store.initialize();const refresh=store.refresh();
  store.save('quotes','completed',null);await store.flush();
  release!([record('search')]);await refresh;
  assert.equal(store.getSnapshot().records.quotes?.status,'completed');
});
test('una sesión recién abierta toma el progreso actualizado de la cuenta',async()=>{
  const old={...record('search'),pending:false};const cloud={...record('create'),updatedAt:stamp(3)};
  const store=createProgressStore({readLocal:async()=>[old],writeLocal:async()=>{},readRemote:async()=>[cloud],writeRemote:async r=>r});
  await store.initialize();assert.equal(store.getSnapshot().records.quotes?.stepId,'create');
});
test('el cierre de una sesión ignora respuestas pendientes',async()=>{
  let release:((rows:TutorialProgress[])=>void)|undefined;
  const store=createProgressStore({readLocal:async()=>[],writeLocal:async()=>{},readRemote:()=>new Promise(resolve=>{release=resolve;}),writeRemote:async r=>r});
  let changes=0;store.subscribe(()=>{changes++;});const initial=store.initialize();await nextTick();store.dispose();const before=changes;
  release!([record('create')]);await initial;assert.equal(changes,before);
});
test('los recorridos se adaptan a permisos y a listas vacías',()=>{
  const seller=stepsFor('settings',{admin:false,hasItems:false});
  assert.ok(!seller.some(step=>step.id==='users'||step.id==='brand'));
  assert.ok(seller.some(step=>step.id==='appearance'));
  assert.ok(!stepsFor('quotes',{admin:true,hasItems:false}).some(step=>step.id==='row'));
  assert.ok(stepsFor('quotes',{admin:true,hasItems:true}).some(step=>step.id==='row'));
  for(const key of GUIDE_KEYS){const steps=GUIDES[key].steps;assert.ok(steps.length>0);assert.equal(new Set(steps.map(step=>step.id)).size,steps.length);
    assert.equal(stepPosition(steps,'old-step-no-longer-available'),0);}
});
