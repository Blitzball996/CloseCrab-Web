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
 let core,wakes=0,seq=0,created=false;
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
   if(event.operation==='list'||event.operation==='create'){
    if(event.operation==='create')created=true;
    const sessions=[{id:'shared-test',title:'First',workingDirectory:__dirname,port:upstream.address().port,token:'core-secret'}];
    if(created)sessions.push({...sessions[0],id:'created-test',title:'New'});
    child.stdin.write(JSON.stringify({requestId:event.requestId,ok:true,data:{sessions,createdId:created?'created-test':undefined}})+'\n');return;
   }
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
  const createdSession=await (await fetch(base+'/api/sessions',{headers,method:'POST',body:'{}'})).json();
  assert.equal(createdSession.id,'created-test');
  const updated=await (await fetch(base+'/api/sessions',{headers})).json();
  assert.equal(updated.length,2);assert(!JSON.stringify(updated).includes('core-secret'));
  assert(updated.every(s=>s.port===undefined&&s.token===undefined));
  if(process.argv.includes('--ui')){
   const {chromium}=require('../CloseCrab-Desktop/node_modules/@playwright/test');
   const browser=await chromium.launch({channel:'msedge',headless:true});
   try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/?token=phone-secret');
    await page.locator('.message.assistant').filter({hasText:'shared answer'}).waitFor();
    await page.locator('.brand-image').evaluate(img=>img.decode());
    await page.locator('#draft').fill('keep this draft');
    await page.locator('#sessions-button').click();
    await page.locator('.session-item').filter({hasText:'New'}).click();
    assert.equal(await page.locator('#draft').inputValue(),'');
    await page.locator('#sessions-button').click();
    await page.locator('.session-item').filter({hasText:'First'}).click();
    assert.equal(await page.locator('#draft').inputValue(),'keep this draft');
    await page.locator('.message.assistant').filter({hasText:'shared answer'}).waitFor();
    assert.equal(await page.locator('.message.assistant').count(),1);
    for(const theme of ['paper','studio']){
     if(theme==='studio')await page.locator('#theme').click();
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
     await page.screenshot({path:'../CloseCrab-Desktop/artifacts/mobile-'+theme+'.png'});
    }
    await page.locator('#language').selectOption('en');
    assert.equal(await page.locator('#draft').getAttribute('placeholder'),'Message CloseCrab…');
    await page.setViewportSize({width:320,height:568});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const composer=await page.locator('#composer').boundingBox();
    assert(composer.y>=0&&composer.y+composer.height<=568);
    await page.screenshot({path:'../CloseCrab-Desktop/artifacts/mobile-small.png'});
    await page.setViewportSize({width:1280,height:900});
    await page.screenshot({path:'../CloseCrab-Desktop/artifacts/mobile-wide.png'});
    assert.deepEqual(errors,[]);
    console.log('PASS: mobile themes, assets, language, conversation switching, draft retention, snapshot deduplication and responsive layout');
   }finally{await browser.close();}
  }
  console.log('PASS: authenticated shared HTTP/WebSocket service, protected deletion, phone prompt wake, shared response/ready and approval relay');
 }finally{
  phone?.terminate();child.kill();await once(child,'exit');
  for(const client of upstream.clients)client.terminate();await new Promise(r=>upstream.close(r));
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
