const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('lib/web/app.js','utf8');
const parser=source.slice(source.indexOf('const CCSPIN_RE'),source.indexOf('function setThinking'));
const input='before<<<CCSPIN:START:Thinking>>>\nafter<<<CCSPIN:STOP>>>\n';
for(let cut=0;cut<=input.length;cut++){
 const states=[];const ctx={setThinking:on=>states.push(on)};vm.createContext(ctx);
 vm.runInContext('let ccspinTail="";'+parser,ctx);
 ctx.parts=[input.slice(0,cut),input.slice(cut)];
 const result=vm.runInContext('parts.map(consumeSpinMarkers).join("")',ctx);
 assert.equal(states.at(-1),false,'split '+cut);
 assert(!result.includes('CCSPIN'),'marker leaked at '+cut);
}
const states=[];const ctx={setThinking:on=>states.push(on),parts:[...input]};vm.createContext(ctx);
vm.runInContext('let ccspinTail="";'+parser+';parts.forEach(consumeSpinMarkers)',ctx);
assert.equal(states.at(-1),false);
console.log('PASS: spinner stops for every split boundary and one-character chunks');
