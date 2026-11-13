const assert=require('node:assert/strict');
const {once}=require('node:events');
const {spawn}=require('node:child_process');
const {createServer}=require('node:net');
const {createInterface}=require('node:readline');
const {WebSocket,WebSocketServer}=require('ws');

(async()=>{
 const upstream=new WebSocketServer({port:0,host:'127.0.0.1'});await once(upstream,'listening');
 const reservation=createServer();await new Promise(r=>reservation.listen(0,'127.0.0.1',r));
 const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 let core,wakes=0,seq=0;
 upstream.on('connection',socket=>{core=socket;socket.on('message',raw=>{
  const event=JSON.parse(raw);
  if(event.type==='auth'){assert.equal(event.token,'core-secret');socket.send(JSON.stringify({type:'connected',ready:true,oldest:1}));}
  if(event.type==='prepare_input'){
   assert.equal(event.content,'phone prompt');
   socket.send(JSON.stringify({type:'input_prepared',requestId:event.requestId}));
  }
 });});
 const child=spawn(process.execPath,['bin/cli.js','--host','127.0.0.1','--port',String(port),'--no-license','--no-tunnel'],{
  cwd:__dirname,windowsHide:true,env:{...process.env,CLOSECRAB_TOKEN:'phone-secret',CLOSECRAB_SHARED_ID:'shared-test',CLOSECRAB_SHARED_PORT:String(upstream.address().port),CLOSECRAB_SHARED_TOKEN:'core-secret',CLOSECRAB_WAKE_SECRET:'wake-secret'}
 });
 child.stderr.resume();
 createInterface({input:child.stdout}).on('line',line=>{
  let event;try{event=JSON.parse(line);}catch{return;}
  if(event.studioWake==='wake-secret'){
   wakes++;child.stdin.write(JSON.stringify({requestId:event.requestId,ok:true})+'\n');
   core.send(JSON.stringify({type:'user',seq:++seq,content:'phone prompt'}));
   core.send(JSON.stringify({type:'text',seq:++seq,content:'shared answer'}));
   core.send(JSON.stringify({type:'ready',seq:++seq,model:'mock'}));
  }
 });
 let phone;
 const until=async predicate=>{for(let i=0;i<100;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timed out');};
 try{
  const base='http://127.0.0.1:'+port;
  await until(async()=>{try{return (await fetch(base+'/api/sessions')).status===401;}catch{return false;}});
  const headers={Authorization:'Bearer phone-secret'};
  const sessions=await (await fetch(base+'/api/sessions',{headers})).json();
  assert.equal(sessions[0].kind,'desktop');assert.equal(sessions[0].id,'shared-test');
  assert.equal((await fetch(base+'/api/sessions/shared-test',{headers,method:'DELETE'})).status,409);
  const unauthorized=new WebSocket('ws://127.0.0.1:'+port+'/?session=shared-test&token=wrong');
  assert.equal((await once(unauthorized,'close'))[0],4001);
  phone=new WebSocket('ws://127.0.0.1:'+port+'/?session=shared-test&token=phone-secret');
  const events=[];phone.on('message',raw=>events.push(JSON.parse(raw)));
  await until(()=>events.some(e=>e.type==='shared'&&e.online&&e.ready&&e.snapshot));
  phone.send(JSON.stringify({type:'input',data:'phone prompt\r'}));
  await until(()=>events.some(e=>e.type==='input_accepted'));
  assert.equal(wakes,1);assert.equal(events.find(e=>e.type==='input_accepted').content,'phone prompt');
  await until(()=>events.some(e=>e.type==='agent_event'&&e.event.type==='ready'));
  assert(events.some(e=>e.type==='output'&&e.data.includes('phone prompt')));
  assert(events.some(e=>e.type==='output'&&e.data.includes('shared answer')));
  core.send(JSON.stringify({type:'choice',seq:++seq,requestId:'approval',title:'Allow?',options:['Allow','Deny']}));
  await until(()=>events.some(e=>e.type==='agent_event'&&e.event.type==='choice'));
  const answer=once(core,'message');phone.send(JSON.stringify({type:'answer',requestId:'approval',index:1}));
  assert.equal(JSON.parse((await answer)[0]).index,1);
  console.log('PASS: authenticated shared HTTP/WebSocket service, protected deletion, phone prompt wake, shared response/ready and approval relay');
 }finally{
  phone?.terminate();child.kill();await once(child,'exit');
  for(const client of upstream.clients)client.terminate();await new Promise(r=>upstream.close(r));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
