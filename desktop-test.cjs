const assert=require('node:assert/strict');
const {WebSocketServer}=require('ws');
const Desktop=require('./lib/session/desktop');
const {once}=require('node:events');
(async()=>{
 const server=new WebSocketServer({port:0,host:'127.0.0.1'});await once(server,'listening');
 let upstream,wakes=0;
 server.on('connection',socket=>{upstream=socket;socket.on('message',raw=>{
  const event=JSON.parse(raw);
  if(event.type==='auth'){assert.equal(event.token,'test-secret');socket.send(JSON.stringify({type:'connected',ready:true,oldest:1}));}
  if(event.type==='prepare_input')socket.send(JSON.stringify({type:'input_prepared',requestId:event.requestId}));
 });});
 const shared=new Desktop({id:'test',port:server.address().port,token:'test-secret',workingDir:'.',wake:async()=>{wakes++;}});
 try{
  await once(shared,'state');
  await shared.submit('from phone');assert.equal(wakes,1);
  await assert.rejects(shared.submit('duplicate'),/not ready/);
  const data=once(shared,'data');upstream.send(JSON.stringify({type:'user',seq:1,content:'from desktop'}));
  assert((await data)[0].includes('from desktop'));
  const ready=once(shared,'event');upstream.send(JSON.stringify({type:'ready',seq:2,model:'test'}));await ready;
  assert.equal(shared.ready,true);
  assert(shared.buffer.includes('from desktop'));
  console.log('PASS: desktop authentication, phone input acknowledgement/wake, busy rejection and shared events');
 }finally{shared.destroy();for(const client of server.clients)client.terminate();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
