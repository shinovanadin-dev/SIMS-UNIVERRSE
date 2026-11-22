// Regression harness for the production DBPF internal compression decoder.
const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('index.html','utf8');
const start=source.indexOf('function dbpfInternalDecode(');
const end=source.indexOf('async function dbpfExtract(',start);
if(start<0||end<0)throw Error('Decoder source missing');
const ctx={Uint8Array,Error};vm.runInNewContext(source.slice(start,end).trim(),ctx);
const decode=ctx.dbpfInternalDecode;
const tests=[];function test(name,fn){try{fn();tests.push({name,ok:true})}catch(e){tests.push({name,ok:false,error:e.message})}}
function assert(v,m){if(!v)throw Error(m||'assertion failed')}
function same(a,b){assert(a.length===b.length,'output length mismatch');for(let i=0;i<a.length;i++)assert(a[i]===b[i],'byte mismatch at '+i)}
function throws(fn,re){let ok=false;try{fn()}catch(e){ok=re.test(e.message)}assert(ok,'expected error matching '+re)}
test('terminal literal block decodes',()=>same(decode(Uint8Array.from([0,3,255,65,66,67]),3),Uint8Array.from([65,66,67])));
test('terminal empty block allowed for zero-size stream',()=>same(decode(Uint8Array.from([0,0,252]),0),new Uint8Array(0)));
test('extended size header decodes',()=>same(decode(Uint8Array.from([128,0,0,3,255,65,66,67]),3),Uint8Array.from([65,66,67])));
test('literal followed by overlapping back-reference expands',()=>same(decode(Uint8Array.from([0,4,1,0,65,252]),4),Uint8Array.from([65,65,65,65])));
test('back-reference before output rejected',()=>throws(()=>decode(Uint8Array.from([0,3,0,0,252]),3),/back-reference/));
test('output overflow from literal rejected',()=>throws(()=>decode(Uint8Array.from([0,1,255,65,66]),1),/bounds|overflow/));
test('size mismatch rejected',()=>throws(()=>decode(Uint8Array.from([0,3,255,65,66,67]),2),/declared size/));
test('truncated terminal literal rejected',()=>throws(()=>decode(Uint8Array.from([0,2,254,65]),2),/literal exceeds bounds/));
test('missing terminator rejected',()=>throws(()=>decode(Uint8Array.from([0,1,255,65]),1),/end marker missing/));
const failed=tests.filter(t=>!t.ok);console.log('DBPF internal compression: '+(tests.length-failed.length)+'/'+tests.length+' passed');tests.forEach(t=>console.log((t.ok?'PASS':'FAIL')+' '+t.name+(t.error?' :: '+t.error:'')));if(failed.length)process.exitCode=1;
