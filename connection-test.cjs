const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('lib/web/app.js','utf8');
const sockets=[],timers=[],states=[];
class Socket {
 static OPEN=1;
 constructor(){this.readyState=0;sockets.push(this);}
 close(){this.readyState=3;}
 send(){}
}
const context={WebSocket:Socket,location:{protocol:'http:',host:'localhost'},getToken:()=>'',setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},setTermStatus:s=>states.push(s),setThinking:s=>states.push(s),localStorage:{setItem(){}},prompt:()=> 'test'};
vm.createContext(context);
vm.runInContext('let currentSessionId="one",ws=null,reconnectTimer=null,wsConnectedOnce=false,ccspinTail="",myUsername="test";'+source.slice(source.indexOf('function connectWS('),source.indexOf('// Handle iOS Safari')),context);
vm.runInContext('connectWS("one");currentSessionId="two";connectWS("two");',context);
const previousTimerCount=timers.length;
sockets[0].onclose();
assert.equal(timers.length,previousTimerCount,'Old socket must not schedule reconnect');
sockets[0].onmessage({data:'{"type":"output","data":"stale"}'});
assert.equal(states.length,0,'Old socket must not alter active status');
sockets[1].onclose();
assert(states.includes(false),'Disconnect must stop thinking');
assert.equal(timers.length,previousTimerCount+1);
console.log('PASS: stale connections cannot overwrite active session or reconnect; disconnect clears thinking');
