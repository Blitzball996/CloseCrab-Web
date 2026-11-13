const {EventEmitter}=require('node:events');
const {randomUUID}=require('node:crypto');
const {WebSocket}=require('ws');

class DesktopSession extends EventEmitter {
  constructor({id,port,token,workingDir,wake}) {
    super();Object.assign(this,{id,port,token,workingDir,wake});
    this.kind='desktop';this.startTime=Date.now();this.alive=false;this.ready=false;
    this.buffer='';this.events=[];this.eventBytes=0;this.after=0;this.pending=new Map();this.closed=false;this.choices=new Map();
    this.connect();
  }
  connect(){
    if(this.closed)return;
    const socket=new WebSocket('ws://127.0.0.1:'+this.port,{maxPayload:2*1024*1024});this.socket=socket;
    socket.on('open',()=>socket.send(JSON.stringify({type:'auth',token:this.token,after:this.after})));
    socket.on('message',raw=>{
      if(this.closed||this.socket!==socket)return;
      let event;try{event=JSON.parse(raw.toString());}catch{return;}
      if(event.type==='connected'){
        this.alive=true;this.ready=Boolean(event.ready);
        if(event.oldest>this.after+1)this.output('\n[Earlier events expired; history may be incomplete.]\n');
        this.emit('state',{ready:this.ready,online:true});return;
      }
      if(event.type==='input_prepared'||event.type==='input_rejected'){
        const request=this.pending.get(event.requestId);if(!request)return;
        this.pending.delete(event.requestId);clearTimeout(request.timer);
        if(event.type==='input_rejected'){request.reject(new Error('Agent is busy. Wait for the current task.'));return;}
        this.ready=false;this.emit('state',{ready:false,online:true});
        Promise.resolve().then(()=>this.wake()).then(request.resolve,request.reject);return;
      }
      if(event.seq){if(event.seq<=this.after)return;this.after=event.seq;}
      if(event.type==='ready'){this.ready=true;this.model=event.model;}
      if(['user','command','turn_start','choice'].includes(event.type))this.ready=false;
      if(event.type==='choice')this.choices.set(event.requestId,event);
      if(event.type==='choice_resolved')this.choices.delete(event.requestId);
      if(event.type==='history_reset'){this.buffer='';this.events=[];this.eventBytes=0;this.choices.clear();}
      if(!['runtime','sessions'].includes(event.type)){
        this.events.push(event);this.eventBytes+=Buffer.byteLength(JSON.stringify(event));
        while(this.events.length>4000||this.eventBytes>4*1024*1024){this.eventBytes-=Buffer.byteLength(JSON.stringify(this.events.shift()));}
      }
      this.emit('event',event);
      switch(event.type){
        case 'history_reset':this.output('\n--- Conversation changed ---\n');break;
        case 'user':this.output('\nYou: '+event.content+'\n');break;
        case 'text':case 'command_output':this.output(event.content||'');break;
        case 'command':this.output('\n'+event.content+'\n');break;
        case 'tool_start':this.output('\n[Tool: '+event.name+']\n');break;
        case 'error':this.output('\n[Error] '+event.content+'\n');break;
        case 'ready':this.output('\n<<<CCSPIN:STOP>>>\n');break;
        case 'turn_start':this.output('<<<CCSPIN:START:Thinking>>>\n');break;
      }
    });
    socket.on('error',()=>{});
    socket.on('close',()=>{
      if(this.socket!==socket)return;this.alive=false;this.ready=false;
      for(const request of this.pending.values()){clearTimeout(request.timer);request.reject(new Error('Desktop disconnected; delivery was not confirmed.'));}this.pending.clear();
      this.emit('state',{ready:false,online:false});
      if(!this.closed)this.timer=setTimeout(()=>this.connect(),1000);
    });
  }
  output(text){this.buffer+=text;if(this.buffer.length>500000)this.buffer=this.buffer.slice(-250000);this.emit('data',text);}
  submit(content){
    if(!this.alive||!this.ready)return Promise.reject(new Error('Desktop Agent is not ready.'));
    if(typeof content!=='string'||!content.trim()||Buffer.byteLength(content)>256*1024)return Promise.reject(new Error('Message is empty or too large.'));
    return new Promise((resolve,reject)=>{
      const requestId=randomUUID();const timer=setTimeout(()=>{this.pending.delete(requestId);reject(new Error('Message acknowledgement timed out. Check the desktop before resending.'));},10000);
      this.pending.set(requestId,{resolve,reject,timer});
      this.socket.send(JSON.stringify({type:'prepare_input',requestId,content}));
    });
  }
  answer(message){if(!this.choices.has(message.requestId))throw new Error('This approval is no longer pending.');this.send({type:'answer',requestId:message.requestId,index:message.index,text:message.text||''});}
  send(message){if(!this.alive||this.socket.readyState!==WebSocket.OPEN)throw new Error('Desktop disconnected.');this.socket.send(JSON.stringify(message));}
  resize(){}
  destroy(){this.closed=true;clearTimeout(this.timer);this.socket?.close();for(const r of this.pending.values()){clearTimeout(r.timer);r.reject(new Error('Remote service stopped.'));}this.pending.clear();}
}
module.exports=DesktopSession;
