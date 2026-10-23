import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveRoomLayout, canSaveRoomSurfaces, rpc } from '../src/lib/study/data.ts';
const layout={version:2,items:[],decorations:[],wallDecorations:[]};
const saved={ok:true,code:'loaded',room_revision:3,layout,room_save_contract:'surfaces-v1'};
function client(response={data:{...saved,code:'saved'},error:null}) {
 const calls=[];
 return {calls,rpc:(operation,args)=>{calls.push({operation,args});return {abortSignal:async()=>response};}};
}
test('legacy deployment and disabled rollout retain the legacy RPC and exact revision/layout',async()=>{
 for(const [room,enabled] of [[saved,false],[{...saved,room_save_contract:undefined},true]]) {
  const fake=client();await saveRoomLayout(fake,layout,3,room,enabled);
  assert.deepEqual(fake.calls,[{operation:'save_room_layout',args:{p_layout:layout,p_expected_room_revision:3}}]);
  assert.equal(canSaveRoomSurfaces(room,enabled),false);
 }
});
test('verified opt-in uses surfaces RPC, preserves conflicts and required-update results',async()=>{
 for(const code of ['saved','layout_conflict','room_update_required']) {
  const fake=client({data:{...saved,code,ok:code==='saved'},error:null});
  assert.equal((await saveRoomLayout(fake,layout,3,saved,true)).code,code);
  assert.equal(fake.calls[0].operation,'save_room_layout_surfaces');
 }
});
test('unsupported draft or loaded placements block writes before rollout without normalizing',async()=>{
 const expanded={...layout,items:[{id:'books',kind:'books',x:1,y:1,facing:'frontLeft',groundOffset:{x:.5,y:.5}}]};
 const before=JSON.stringify(expanded);
 for(const [draft,room] of [[expanded,saved],[layout,{...saved,layout:expanded}]]) {
  const fake=client();await assert.rejects(saveRoomLayout(fake,draft,3,room,false),/draft is retained/);
  assert.equal(fake.calls.length,0);
 }
 assert.equal(JSON.stringify(expanded),before);
});
test('missing surfaces RPC and timeouts never fall back to destructive legacy writes',async()=>{
 for(const error of [{code:'PGRST202'},{code:'42883'},{code:'57014'}]) {
  const fake=client({data:null,error});await assert.rejects(saveRoomLayout(fake,layout,3,saved,true));
  assert.equal(fake.calls.length,1);assert.equal(fake.calls[0].operation,'save_room_layout_surfaces');
 }
});
test('new save RPC validates its response before accepting success',async()=>{
 await assert.rejects(rpc(client({data:{ok:true,code:'saved'},error:null}),'save_room_layout_surfaces'),/draft has been retained/);
});
