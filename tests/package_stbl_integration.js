// End-to-end synthetic DBPF -> resource extraction -> STBL parse regression.
const fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('index.html','utf8');
function get(name,next){let a1=src.indexOf('function '+name+'('),a2=src.indexOf('async function '+name+'('),a=a1<0?a2:a2<0?a1:Math.min(a1,a2);let b1=src.indexOf('function '+next+'(',a),b2=src.indexOf('async function '+next+'(',a),b=b1<0?b2:b2<0?b1:Math.min(b1,b2);if(a<0||b<0)throw Error('Missing function boundary '+name+' -> '+next);return src.slice(a,b).trim()}
function getAsync(name,next){return get(name,next)}
const script=[get('dbpfU32','dbpfU16'),get('dbpfU16','dbpfParse'),get('dbpfParse','dbpfTypeName'),get('stblU16','stblU32'),get('stblU32','stblU64'),get('stblU64','stblParse'),get('stblParse','stblEncode'),get('stblEncode','stblKeyNumber'),get('dbpfWrite32','dbpfWrite16'),get('dbpfWrite16','dbpfRebuildPackage'),get('dbpfRebuildPackage','dbpfReplaceSTBL'),get('dbpfInternalDecode','dbpfExtract'),getAsync('dbpfExtract','dbpfDownload')].join('\n');
const ctx={Uint8Array,BigInt,TextDecoder,TextEncoder,Map,Set,Error,Number,Response,Blob,window:{},console};vm.runInNewContext(script,ctx);
function u32(d,p,v){d[p]=v&255;d[p+1]=v>>>8&255;d[p+2]=v>>>16&255;d[p+3]=v>>>24&255}function u16(d,p,v){d[p]=v&255;d[p+1]=v>>>8&255}
function stbl(key,text){let s=new TextEncoder().encode(text),d=new Uint8Array(21+7+s.length);d.set([83,84,66,76],0);u16(d,4,5);d[6]=0;u32(d,7,1);u32(d,17,s.length+1);u32(d,21,Number.parseInt(key,16));d[25]=0;u16(d,26,s.length);d.set(s,28);return d}
function pack(payload,compression,memSize){let off=96,idxOff=off+payload.length,idx=new Uint8Array(36);u32(idx,0,0);u32(idx,4,0x22000000);u32(idx,8,0x22000001);u32(idx,12,0);u32(idx,16,1);u32(idx,20,off);u32(idx,24,payload.length|0x80000000);u32(idx,28,memSize);u16(idx,32,compression);u16(idx,34,1);let out=new Uint8Array(idxOff+idx.length);out.set([68,66,80,70],0);u32(out,4,2);u32(out,36,1);u32(out,44,idx.length);u32(out,64,idxOff);out.set(payload,off);out.set(idx,idxOff);return out.buffer}
const tests=[];function test(n,f){try{f();tests.push({n,ok:true})}catch(e){tests.push({n,ok:false,e:e.message})}}function assert(x,m){if(!x)throw Error(m||'assert failed')}
async function main(){
let raw=stbl('A1B2C3D4','Hello Sims');let parsed=ctx.stblParse(raw.buffer);test('raw STBL parses one key and text',()=>{assert(parsed.entries.length===1&&parsed.entries[0].key==='A1B2C3D4'&&parsed.entries[0].text==='Hello Sims')});
let pkg=pack(raw,0,raw.length);ctx.dbpfCurrent={bytes:new Uint8Array(pkg),name:'fixture.package'};ctx.dbpfEntries=ctx.dbpfParse(pkg).entries;
await (async()=>{try{let out=await ctx.dbpfExtract(ctx.dbpfEntries[0]),p=ctx.stblParse(out.buffer);test('DBPF raw resource extraction flows into STBL parser',()=>{assert(p.entries[0].text==='Hello Sims')})}catch(e){tests.push({n:'DBPF raw resource extraction flows into STBL parser',ok:false,e:e.message})}})();

// Full synthetic translation cycle: STBL read -> edit -> encode -> DBPF rebuild -> reopen -> read.
let fullRaw=ctx.stblEncode([{key:'A1B2C3D4',flags:0,text:'Original line'}]);
let fullPkg=pack(fullRaw,0,fullRaw.length);ctx.dbpfCurrent={bytes:new Uint8Array(fullPkg),name:'translation-cycle.package'};ctx.dbpfEntries=ctx.dbpfParse(fullPkg).entries;
try{let extracted=await ctx.dbpfExtract(ctx.dbpfEntries[0]),parsedSTBL=ctx.stblParse(extracted.buffer);parsedSTBL.entries[0].text='Переведённая строка';let encoded=ctx.stblEncode(parsedSTBL.entries),rebuilt=await ctx.dbpfRebuildPackage(new Map([[0,encoded]]));ctx.dbpfCurrent={bytes:new Uint8Array(rebuilt),name:'rebuilt.package'};ctx.dbpfEntries=ctx.dbpfParse(rebuilt).entries;let reread=await ctx.dbpfExtract(ctx.dbpfEntries[0]),verify=ctx.stblParse(reread.buffer);test('STBL translation survives DBPF rebuild and reopen',()=>{assert(verify.entries.length===1&&verify.entries[0].key==='A1B2C3D4'&&verify.entries[0].text==='Переведённая строка','translation did not survive full package cycle')})}catch(e){tests.push({n:'STBL translation survives DBPF rebuild and reopen',ok:false,e:e.message})}
let fail=tests.filter(x=>!x.ok);console.log('DBPF/STBL integration: '+(tests.length-fail.length)+'/'+tests.length);tests.forEach(x=>console.log((x.ok?'PASS':'FAIL')+' '+x.n+(x.e?' :: '+x.e:'')));if(fail.length)process.exitCode=1}
main().catch(e=>{console.error(e);process.exitCode=1});
