// Rebuild harness exercises the production DBPF rebuild routine from index.html.
const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('index.html','utf8');
function extract(name,next){const a=source.indexOf('function '+name+'(');let b=source.indexOf('async function '+next+'(',a);if(b<0)b=source.indexOf('function '+next+'(',a);if(a<0||b<0)throw Error('Missing function '+name);return source.slice(a,b).trim();}
const script=[extract('dbpfU32','dbpfU16'),extract('dbpfU16','dbpfParse'),extract('dbpfParse','dbpfTypeName'),extract('dbpfWrite32','dbpfWrite16'),extract('dbpfWrite16','dbpfRebuildPackage'),extract('dbpfRebuildPackage','dbpfReplaceSTBL')].join('\n');
const ctx={Uint8Array,BigInt,Map,Set,Error,Number};vm.runInNewContext(script,ctx);
function u32(b,p,v){b[p]=v&255;b[p+1]=v>>>8&255;b[p+2]=v>>>16&255;b[p+3]=v>>>24&255}
function u16(b,p,v){b[p]=v&255;b[p+1]=v>>>8&255}
function makePackage(payloads,metadata=[]){let pos=96,ents=[];const b0=new Uint8Array(96);b0.set([68,66,80,70],0);u32(b0,4,2);u32(b0,8,1);for(let i=0;i<payloads.length;i++){let p=payloads[i],m=metadata[i]||{};let offset=pos;pos+=p.length;ents.push({type:0x11110000+i,group:0x22220000+i,hi:0x33330000+i,lo:0x44440000+i,offset,size:p.length,mem:m.mem??p.length,comp:m.comp??0,commit:m.commit??0,extended:m.extended??false,payload:p})}
const idx=new Uint8Array(4+ents.reduce((n,e)=>n+32,0));u32(idx,0,0);let q=4;for(let e of ents){u32(idx,q,e.type);q+=4;u32(idx,q,e.group);q+=4;u32(idx,q,e.hi);q+=4;u32(idx,q,e.lo);q+=4;u32(idx,q,e.offset);q+=4;u32(idx,q,(e.size&0x7fffffff)|(e.extended?0x80000000:0));q+=4;u32(idx,q,e.mem);q+=4;u16(idx,q,e.comp);u16(idx,q+2,e.commit);q+=4}
const out=new Uint8Array(pos+idx.length);out.set(b0);let cursor=96;ents.forEach(e=>{out.set(e.payload,cursor);cursor+=e.payload.length});out.set(idx,pos);u32(out,36,ents.length);u32(out,44,idx.length);u32(out,64,pos);return out.buffer}
function bytes(a){return Uint8Array.from(a)}
const tests=[];async function test(n,fn){try{await fn();tests.push({n,ok:true})}catch(e){tests.push({n,ok:false,e:e.message})}}
function assert(v,m){if(!v)throw Error(m||'assertion failed')}
function same(a,b){assert(a.length===b.length,'byte length differs');for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw Error('byte differs at '+i)}
async function run(){
const src=makePackage([bytes([1,2,3,4]),bytes([9,8,7,6,5])],[{comp:0,extended:true,commit:2},{comp:0xFFFF,extended:true,commit:1}]);
ctx.dbpfCurrent={bytes:new Uint8Array(src),name:'fixture.package'};ctx.dbpfEntries=ctx.dbpfParse(src).entries;
await test('empty replacement rebuild reopens and retains payload bytes',async()=>{let out=await ctx.dbpfRebuildPackage(new Map()),p=ctx.dbpfParse(out),before=ctx.dbpfParse(src);assert(p.entries.length===2,'resource count');p.entries.forEach((e,i)=>same(new Uint8Array(out).slice(e.offset,e.offset+e.size),new Uint8Array(src).slice(before.entries[i].offset,before.entries[i].offset+before.entries[i].size)));});
await test('single resource replacement survives reopen',async()=>{let repl=bytes([0x53,0x54,0x42,0x4C,0x21]),out=await ctx.dbpfRebuildPackage(new Map([[0,repl]])),p=ctx.dbpfParse(out),e=p.entries[0];same(new Uint8Array(out).slice(e.offset,e.offset+e.size),repl);assert(e.compression===0&&e.memSize===repl.length&&e.compressedFlag&&e.committed===1,'replacement metadata');});
await test('untargeted resource remains byte identical during replacement',async()=>{let repl=bytes([55,56]),out=await ctx.dbpfRebuildPackage(new Map([[0,repl]])),p=ctx.dbpfParse(out),e=p.entries[1];same(new Uint8Array(out).slice(e.offset,e.offset+e.size),bytes([9,8,7,6,5]));assert(e.compression===0xFFFF&&e.memSize===5&&e.committed===1,'internal compression metadata changed');});
await test('unknown replacement index rejected',async()=>{let ok=false;try{await ctx.dbpfRebuildPackage(new Map([[5,bytes([1])]]))}catch(e){ok=/Unknown replacement/.test(e.message)}assert(ok,'unknown index accepted');});
await test('non-map replacements rejected',async()=>{let ok=false;try{await ctx.dbpfRebuildPackage([])}catch(e){ok=/Replacement map required/.test(e.message)}assert(ok,'non-map accepted');});

await test('two resources can be replaced in one rebuild',async()=>{let a=bytes([31,32]),b=bytes([41,42,43]),out=await ctx.dbpfRebuildPackage(new Map([[0,a],[1,b]])),p=ctx.dbpfParse(out);same(new Uint8Array(out).slice(p.entries[0].offset,p.entries[0].offset+p.entries[0].size),a);same(new Uint8Array(out).slice(p.entries[1].offset,p.entries[1].offset+p.entries[1].size),b);});
await test('zero-byte replacement accepted and verified',async()=>{let out=await ctx.dbpfRebuildPackage(new Map([[0,bytes([])]])),p=ctx.dbpfParse(out),e=p.entries[0];assert(e.size===0&&e.memSize===0&&e.compression===0,'empty replacement metadata mismatch');});
await test('resource payload offsets are 4-byte aligned',async()=>{let out=await ctx.dbpfRebuildPackage(new Map([[0,bytes([4,5,6,7,8])]])),p=ctx.dbpfParse(out);assert(p.entries.every(e=>e.offset%4===0),'unaligned payload offset found');});
await test('resource TGI identifiers survive rebuild',async()=>{let out=await ctx.dbpfRebuildPackage(new Map([[0,bytes([2])]])),p=ctx.dbpfParse(out);for(let i=0;i<p.entries.length;i++){let a=ctx.dbpfEntries[i],b=p.entries[i];assert(a.type===b.type&&a.group===b.group&&a.instance===b.instance,'TGI changed at '+i);}});
await test('missing active package rejected',async()=>{ctx.dbpfCurrent=null;let ok=false;try{await ctx.dbpfRebuildPackage(new Map())}catch(e){ok=/No package loaded/.test(e.message)}assert(ok,'missing package accepted');});

const fail=tests.filter(t=>!t.ok);console.log('Package rebuild regression: '+(tests.length-fail.length)+'/'+tests.length+' passed');tests.forEach(t=>console.log((t.ok?'PASS':'FAIL')+' '+t.n+(t.e?' :: '+t.e:'')));if(fail.length)process.exitCode=1;
}
run().catch(e=>{console.error('Harness error',e);process.exitCode=1});
