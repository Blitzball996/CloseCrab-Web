'use strict';
const $=id=>document.getElementById(id);
let language=localStorage.getItem('mobile-language')||'zh-CN';
let token=new URLSearchParams(location.search).get('token')||sessionStorage.getItem('remote-token')||'';
if(token){sessionStorage.setItem('remote-token',token);history.replaceState(null,'',location.pathname);}
let sessions=[],selected=null,socket=null,generation=0,retry=null,online=false,ready=false,pending=false,creating=false;
let blocks=[],lastType='',approval=null,renderQueued=false,follow=true;
const drafts=new Map();
const words={
 sessions:['会话','Conversations'],new:['新建会话','New conversation'],working:['正在处理','Working'],
 latest:['回到最新','Jump to latest'],synced:['与桌面共享','Shared with desktop'],connect:['连接你的工作室','Connect your studio'],
 token:['访问令牌','Access token'],connectAction:['连接','Connect'],connected:['已连接桌面','Desktop connected'],
 offline:['连接中断，正在重连','Disconnected, reconnecting'],idle:['准备就绪','Ready'],sending:['正在发送','Sending'],
 waiting:['等待确认','Approval needed'],empty:['想法，从这里开始','Start with an idea'],emptyText:['此刻，接着你的灵感聊。','Pick up where inspiration left off.'],
 thinking:['思考过程','Reasoning'],tool:['工具执行','Tool execution'],submit:['提交','Submit'],custom:['其他回答','Other response'],
 failed:['连接失败，请检查令牌或桌面服务。','Connection failed. Check the token or desktop service.'],
 placeholder:['发消息，接着聊…','Message CloseCrab…'],gone:['此会话已关闭或移入回收站','This conversation was closed or moved to the recycle bin'],
 uncertain:['发送未确认，请查看会话后再重试','Delivery unconfirmed. Check the conversation before retrying'],
 createWait:['正在桌面创建会话…','Creating a desktop conversation…'],stop:['停止生成','Stop generation'],send:['发送','Send'],
 close:['关闭','Close'],theme:['切换主题','Switch theme']
};
const tr=key=>(words[key]||[key,key])[language==='en'?1:0];
function notice(message=''){$('notice').textContent=message;$('notice').hidden=!message;}
function icons(){window.lucide?.createIcons();}
function localize(){
 document.documentElement.lang=language;$('language').value=language;
 document.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=tr(el.dataset.i18n));
 $('draft').placeholder=tr('placeholder');
 for(const [id,key] of [['sessions-button','sessions'],['new-session','new'],['theme','theme'],['close-sessions','close'],['stop','stop'],['send','send']]){$(id).title=tr(key);$(id).setAttribute('aria-label',tr(key));}
 renderSessions();render();status();
}
function status(){
 $('draft').disabled=!selected;
 $('connection').textContent=online?tr('connected'):tr('offline');
 $('activity').hidden=!online||ready||!!approval;
 $('composer-status').textContent=pending?tr('sending'):approval?tr('waiting'):ready?tr('idle'):online?tr('working'):tr('offline');
 $('send').disabled=!online||!ready||pending||!$('draft').value.trim();
 $('send').hidden=online&&!ready&&!pending;
 $('stop').hidden=!online||ready||pending;
 $('stop').disabled=!!approval;
 $('new-session').disabled=creating;$('drawer-new').disabled=creating;
 const item=sessions.find(s=>s.id===selected);
 $('conversation-title').textContent=item?.title||tr('new');$('model').textContent=item?.model||'';
}
async function api(path,options={}){
 const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,...options.headers}});
 if(response.status===401){if(!$('login-dialog').open)$('login-dialog').showModal();throw new Error(tr('failed'));}
 const data=await response.json();if(!response.ok)throw new Error(data.error||tr('failed'));return data;
}
let refreshing=false;
async function refresh(){
 if(refreshing||!token)return;refreshing=true;
 try{
  sessions=await api('/api/sessions');renderSessions();
  if(!selected&&sessions.length)openSession(sessions[0].id);
  else if(selected&&!sessions.some(s=>s.id===selected)){generation++;socket?.close();selected=null;online=false;ready=false;blocks=[];approval=null;render();notice(tr('gone'));}
  status();
 }catch(error){notice(error.message);}finally{refreshing=false;}
}
function renderSessions(){
 const root=$('session-list');root.replaceChildren();
 for(const item of sessions){
  const button=document.createElement('button');button.className='session-item'+(item.id===selected?' selected':'');
  const title=document.createElement('span');title.textContent=item.title||tr('new');button.append(title);
  if(item.alive&&!item.ready){const spinner=document.createElement('span');spinner.className='busy';spinner.setAttribute('aria-label',tr('working'));button.append(spinner);}
  else{const state=document.createElement('small');state.textContent=item.alive?tr('idle'):tr('offline');button.append(state);}
  button.onclick=()=>{openSession(item.id);$('sessions-dialog').close();};root.append(button);
 }
}
function openSession(id){
 stopVoice();
 if(selected===id&&socket?.readyState===WebSocket.OPEN)return;
 if(selected)drafts.set(selected,$('draft').value);
 generation++;clearTimeout(retry);socket?.close();selected=id;blocks=[];lastType='';approval=null;pending=false;online=false;ready=false;follow=true;
 $('draft').value=drafts.get(id)||'';resizeDraft();notice();render();renderSessions();connect(generation);
}
function connect(version){
 if(version!==generation||!selected)return;
 const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/?session='+encodeURIComponent(selected)+'&token='+encodeURIComponent(token));
 socket=ws;
 ws.onmessage=({data})=>{
  if(version!==generation||socket!==ws)return;
  let message;try{message=JSON.parse(data);}catch{return;}
  if(message.type==='shared'){online=message.online;ready=message.ready;status();}
  if(message.type==='snapshot'){blocks=[];lastType='';approval=null;for(const event of message.events||[])receive(event);scheduleRender();}
  if(message.type==='agent_event'){receive(message.event);scheduleRender();}
  if(message.type==='input_accepted'){pending=false;if($('draft').value===message.content){$('draft').value='';drafts.delete(selected);resizeDraft();}status();}
  if(message.type==='input_error'){pending=false;notice(message.error);status();}
 };
 ws.onclose=event=>{
  if(version!==generation||socket!==ws)return;
  online=false;ready=false;if(pending){pending=false;notice(tr('uncertain'));}status();
  if(event.code===4001){sessionStorage.removeItem('remote-token');token='';if(!$('login-dialog').open)$('login-dialog').showModal();return;}
  retry=setTimeout(()=>connect(version),1500);
 };
 ws.onerror=()=>{};
}
function receive(event){
 if(event.type==='history_reset'){blocks=[];lastType='';approval=null;}
 if(event.type==='ready'){ready=true;const item=sessions.find(s=>s.id===selected);if(item){item.model=event.model||item.model;item.ready=true;}lastType='';}
 if(['user','command','turn_start','choice'].includes(event.type)){ready=false;const item=sessions.find(s=>s.id===selected);if(item)item.ready=false;}
 if(event.type==='choice')approval=event;
 if(event.type==='choice_resolved'&&approval?.requestId===event.requestId)approval=null;
 const type=event.type,content=event.content||'';
 if(['user','text','thinking','command_output','error','tool_start','tool_result','command'].includes(type)){
  const previous=blocks.at(-1);
  if(['text','thinking','command_output'].includes(type)&&lastType===type&&previous)previous.content+=content;
  else blocks.push({type,content,name:event.name||event.tool||'',id:event.seq});
  if(type==='user'){const item=sessions.find(s=>s.id===selected);if(item&&(!item.title||item.title==='新会话'))item.title=content.slice(0,36);}
  lastType=type;
 }else if(type==='turn_start'||type==='complete')lastType='';
 status();
}
function scheduleRender(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;render();});}
function render(){
 const root=$('messages'),opened=new Set([...root.querySelectorAll('details[open]')].map(el=>el.dataset.key));
 root.replaceChildren();
 if(!blocks.length){const empty=document.createElement('div');empty.className='empty';const img=document.createElement('img');img.src='/logo.png';img.alt='';const h=document.createElement('h2');h.textContent=tr('empty');const p=document.createElement('p');p.textContent=tr('emptyText');empty.append(img,h,p);root.append(empty);}
 for(const [index,block] of blocks.entries()){
  const article=document.createElement('article');article.className='message';
  if(block.type==='user'){article.classList.add('user');article.textContent=block.content;}
  else if(block.type==='text'){article.classList.add('assistant');article.innerHTML=DOMPurify.sanitize(marked.parse(block.content),{FORBID_TAGS:['img','video','audio','iframe','form','input']});article.querySelectorAll('a').forEach(a=>{a.target='_blank';a.rel='noopener noreferrer';});}
  else if(block.type==='error'){article.classList.add('error');article.textContent=block.content;}
  else{const details=document.createElement('details');details.dataset.key=String(block.id||index);details.open=opened.has(details.dataset.key);const summary=document.createElement('summary');summary.textContent=block.type==='thinking'?tr('thinking'):block.type.startsWith('tool')?tr('tool')+(block.name?' · '+block.name:''):block.type==='command'?block.content:'CloseCrab';const pre=document.createElement('pre');pre.textContent=block.content;details.append(summary,pre);article.append(details);}
  root.append(article);
 }
 renderApproval();status();
 if(follow)$('timeline').scrollTop=$('timeline').scrollHeight;
}
let renderedApproval=null;
function renderApproval(){
 const panel=$('approval');panel.hidden=!approval;
 if(!approval){panel.replaceChildren();renderedApproval=null;return;}
 if(renderedApproval===approval.requestId)return;renderedApproval=approval.requestId;panel.replaceChildren();
 const title=document.createElement('h3');title.textContent=approval.title;panel.append(title);
 const answer=(index,text='')=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'answer',requestId:approval.requestId,index,text}));};
 for(const [index,label] of (approval.options||[]).entries()){const button=document.createElement('button');button.textContent=label;button.onclick=()=>answer(index);panel.append(button);}
 if(approval.allowCustom){const input=document.createElement('input');input.placeholder=tr('custom');input.setAttribute('aria-label',tr('custom'));const button=document.createElement('button');button.textContent=tr('submit');button.onclick=()=>{if(input.value.trim())answer(-1,input.value);};panel.append(input,button);}
}
async function createSession(){
 if(creating)return;creating=true;status();notice(tr('createWait'));
 try{const session=await api('/api/sessions',{method:'POST',body:'{}'});await refresh();openSession(session.id);$('sessions-dialog').close();notice();}
 catch(error){notice(error.message);}finally{creating=false;status();}
}
function resizeDraft(){$('draft').style.height='auto';$('draft').style.height=Math.min($('draft').scrollHeight,150)+'px';}
$('composer').onsubmit=event=>{event.preventDefault();if(!online||!ready||pending||!$('draft').value.trim()||socket?.readyState!==WebSocket.OPEN)return;pending=true;follow=true;notice();socket.send(JSON.stringify({type:'input',data:$('draft').value}));status();};
$('draft').oninput=()=>{if(selected)drafts.set(selected,$('draft').value);resizeDraft();status();};
$('draft').onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();$('composer').requestSubmit();}};
$('stop').onclick=()=>{if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify({type:'input',data:String.fromCharCode(27)}));};
$('new-session').onclick=createSession;$('drawer-new').onclick=createSession;
$('sessions-button').onclick=()=>{$('sessions-dialog').showModal();void refresh();};
$('close-sessions').onclick=()=>$('sessions-dialog').close();
$('sessions-dialog').onclick=event=>{if(event.target===$('sessions-dialog')){const r=event.target.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)event.target.close();}};
$('timeline').onscroll=()=>{const el=$('timeline');follow=el.scrollHeight-el.scrollTop-el.clientHeight<80;$('jump').hidden=follow;};
$('jump').onclick=()=>{follow=true;$('timeline').scrollTop=$('timeline').scrollHeight;$('jump').hidden=true;};
$('language').onchange=()=>{language=$('language').value;localStorage.setItem('mobile-language',language);renderedApproval=null;localize();};
document.documentElement.dataset.theme=localStorage.getItem('mobile-theme')||'paper';
$('theme').onclick=()=>{const theme=document.documentElement.dataset.theme==='paper'?'studio':'paper';document.documentElement.dataset.theme=theme;localStorage.setItem('mobile-theme',theme);};
$('login').onsubmit=async event=>{event.preventDefault();token=$('token').value.trim();try{await api('/api/sessions');sessionStorage.setItem('remote-token',token);$('login-dialog').close();$('token').value='';notice();await refresh();}catch(error){$('login-error').textContent=error.message;}};
$('login-dialog').addEventListener('cancel',event=>event.preventDefault());
icons();localize();if(!token)$('login-dialog').showModal();else void refresh();
setInterval(()=>{if(!document.hidden)void refresh();},3000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
let recognition=null,voiceTimer=null,voiceStarted=0,voiceInterim='';
const voicePreview=document.createElement('div');voicePreview.className='voice-preview';voicePreview.hidden=true;voicePreview.setAttribute('role','status');$('composer').before(voicePreview);
function stopVoice(){recognition?.stop();}
function finishVoice(){recognition=null;clearInterval(voiceTimer);$('voice').classList.remove('recording');$('voice').setAttribute('aria-pressed','false');voicePreview.hidden=true;voiceInterim='';}
$('voice').onclick=()=>{
 if(recognition){stopVoice();return;}
 const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Speech||!window.isSecureContext){notice(language==='en'?'Voice input requires a supported browser and HTTPS. Open the internet URL in your system browser.':'语音输入需要支持语音识别的浏览器和 HTTPS。请在系统浏览器打开公网地址。');return;}
 if(!selected)return;
 const current=new Speech();recognition=current;const session=selected;current.lang=language==='en'?'en-US':'zh-CN';current.continuous=true;current.interimResults=true;
 current.onstart=()=>{voiceStarted=Date.now();$('voice').classList.add('recording');$('voice').setAttribute('aria-pressed','true');voicePreview.hidden=false;voiceTimer=setInterval(()=>{const seconds=Math.floor((Date.now()-voiceStarted)/1000);voicePreview.textContent=(language==='en'?'Listening ':'正在录入 ')+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' / 5:00  '+voiceInterim+'…';if(seconds>=300)stopVoice();},200);};
 current.onresult=event=>{if(selected!==session)return;let final='';voiceInterim='';for(let i=event.resultIndex;i<event.results.length;i++){if(event.results[i].isFinal)final+=event.results[i][0].transcript;else voiceInterim+=event.results[i][0].transcript;}if(final){$('draft').value+=($('draft').value?' ':'')+final;drafts.set(session,$('draft').value);resizeDraft();status();}};
 current.onerror=event=>{if(event.error!=='aborted'&&event.error!=='no-speech')notice((language==='en'?'Voice recognition: ':'语音识别：')+event.error);};
 current.onend=finishVoice;
 try{current.start();notice();}catch(error){finishVoice();notice(error.message);}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopVoice();});
window.addEventListener('pagehide',stopVoice);
