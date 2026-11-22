// STBL regression harness extracts the actual parser/encoder/key helper from index.html.
const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync('index.html','utf8');
function extract(name,next){const a=source.indexOf('function '+name+'('),b=source.indexOf('function '+next+'(',a);if(a<0||b<0)throw Error('Missing function '+name);return source.slice(a,b).trim();}
const script=['stblU16','stblU32','stblU64','stblParse','stblEncode','stblKeyNumber'].map((n,i,a)=>extract(n,a[i+1]||'stblLoadFile')).join('\n');
const ctx={TextEncoder,TextDecoder,Uint8Array,BigInt,Number,String,Set,Error};vm.runInNewContext(script,ctx);
const parse=ctx.stblParse,encode=ctx.stblEncode;
const tests=[];function test(n,f){try{f();tests.push({n,ok:true})}catch(e){tests.push({n,ok:false,e:e.message})}}
function assert(v,m){if(!v)throw Error(m||'assertion failed')}
function throws(f,rx){let err;try{f()}catch(e){err=e}assert(err&&(!rx||rx.test(err.message)),'Expected rejection'+(rx?' matching '+rx:''))}
function fixture(entries){return encode(entries)}
test('round-trip Russian and emoji UTF-8',()=>{let b=fixture([{key:'00000001',flags:0,text:'Текст 🌿'},{key:'ABCDEF12',flags:7,text:'second'}]),p=parse(b.buffer);assert(p.entries[0].text==='Текст 🌿'&&p.entries[1].key==='ABCDEF12','round trip');});
test('preserve entry flags',()=>{let p=parse(fixture([{key:'10',flags:255,text:'x'}]).buffer);assert(p.entries[0].flags===255,'flags lost')});
test('empty STBL valid',()=>{let p=parse(fixture([]).buffer);assert(p.count===0&&p.entries.length===0,'empty table')});
test('empty strings are preserved',()=>{let p=parse(fixture([{key:'1',text:''}]).buffer);assert(p.entries[0].text==='','empty string lost')});
test('duplicate key rejected by encoder',()=>throws(()=>encode([{key:'1',text:'a'},{key:'1',text:'b'}]),/Duplicate/));
test('duplicate key rejected by parser',()=>{let b=fixture([{key:'1',text:'a'},{key:'2',text:'b'}]);b[21]=1;b[22]=0;b[23]=0;b[24]=0;throws(()=>parse(b.buffer),/Duplicate/);});
test('bad magic rejected',()=>{let b=fixture([{key:'1',text:'x'}]);b[0]=0;throws(()=>parse(b.buffer),/Invalid STBL magic/);});
test('unsupported version rejected',()=>{let b=fixture([{key:'1',text:'x'}]);b[4]=4;throws(()=>parse(b.buffer),/Unsupported STBL version/);});
test('compressed flag rejected for raw parser',()=>{let b=fixture([{key:'1',text:'x'}]);b[6]=1;throws(()=>parse(b.buffer),/Compressed STBL flag/);});
test('short header rejected',()=>throws(()=>parse(new Uint8Array(20).buffer),/shorter than 21/));
test('truncated text rejected',()=>{let b=fixture([{key:'1',text:'abc'}]).slice(0,-1);throws(()=>parse(b.buffer),/string truncated/);});
test('trailing bytes rejected',()=>{let b=fixture([{key:'1',text:'x'}]),d=new Uint8Array(b.length+1);d.set(b);throws(()=>parse(d.buffer),/trailing bytes/);});
test('total string byte count mismatch rejected',()=>{let b=fixture([{key:'1',text:'abc'}]);b[17]=1;b[18]=0;b[19]=0;b[20]=0;throws(()=>parse(b.buffer),/total string size mismatch/);});
test('invalid UTF-8 rejected',()=>{let b=fixture([{key:'1',text:'A'}]);b[28]=0xFF;throws(()=>parse(b.buffer),/encoded data|utf-8|UTF-8/i);});
test('uint16 maximum string length accepted',()=>{let txt='a'.repeat(65535),b=encode([{key:'1',text:txt}]),p=parse(b.buffer);assert(p.entries[0].text.length===65535,'65535 boundary');});
test('uint16 overflow rejected by encoder',()=>throws(()=>encode([{key:'1',text:'a'.repeat(65536)}]),/uint16 byte length/));
test('invalid flags rejected',()=>throws(()=>encode([{key:'1',flags:256,text:'x'}]),/unsigned byte/));
test('invalid key format rejected',()=>throws(()=>encode([{key:'XYZ12345',text:'x'}]),/32-bit hex/));
test('unicode total size uses UTF-8 bytes',()=>{let b=encode([{key:'1',text:'é🌿'}]),p=parse(b.buffer);assert(p.total===new TextEncoder().encode('é🌿').length+1,'total is not byte-based')});
const fail=tests.filter(x=>!x.ok);console.log('STBL regression: '+(tests.length-fail.length)+'/'+tests.length+' passed');tests.forEach(x=>console.log((x.ok?'PASS':'FAIL')+' '+x.n+(x.e?' :: '+x.e:'')));if(fail.length)process.exitCode=1;
