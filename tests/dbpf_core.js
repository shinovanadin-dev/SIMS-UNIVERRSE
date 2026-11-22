// Node regression harness for the real DBPF parser functions in index.html.
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('index.html', 'utf8');
function extract(name, nextName) {
  const start = source.indexOf('function ' + name + '(');
  const end = nextName ? source.indexOf('function ' + nextName + '(', start) : -1;
  if (start < 0 || end < 0) throw new Error('Cannot locate function ' + name);
  return source.slice(start, end).trim();
}
const script = [
  extract('dbpfU32', 'dbpfU16'),
  extract('dbpfU16', 'dbpfParse'),
  extract('dbpfParse', 'dbpfTypeName')
].join('\n');
const ctx = { BigInt, Uint8Array, Error };
vm.runInNewContext(script, ctx);
const parse = ctx.dbpfParse;
function u32(a, v) { a.push(v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255); }
function u16(a, v) { a.push(v&255,(v>>>8)&255); }
function fixture(entries, flagsOverride) {
  const b = new Uint8Array(96);
  b.set([68,66,80,70],0); // DBPF magic
  b[4]=2; b[36]=entries.length;
  if (!entries.length) return b.buffer;
  let flags=flagsOverride;
  if (flags===undefined) {
    const f=entries[0]; flags=0;
    if(entries.every(e=>e.type===f.type))flags|=1;
    if(entries.every(e=>e.group===f.group))flags|=2;
    if(entries.every(e=>(e.instance>>32n)==(f.instance>>32n)))flags|=4;
  }
  const idx=[]; u32(idx,flags);
  const first=entries[0];
  if(flags&1)u32(idx,first.type);
  if(flags&2)u32(idx,first.group);
  if(flags&4)u32(idx,Number(first.instance>>32n));
  entries.forEach(e=>{
    if(!(flags&1))u32(idx,e.type);
    if(!(flags&2))u32(idx,e.group);
    if(!(flags&4))u32(idx,Number(e.instance>>32n));
    u32(idx,Number(e.instance&0xffffffffn)); u32(idx,e.offset);
    u32(idx,(e.size&0x7fffffff)|(e.ext?0x80000000:0)); u32(idx,e.mem);
    if(e.ext){u16(idx,e.comp||0);u16(idx,e.commit||0);}
  });
  const payloadEnd=Math.max(96,...entries.map(e=>e.offset+e.size));
  const out=new Uint8Array(payloadEnd+idx.length);
  out.set([68,66,80,70],0); out[4]=2; out[36]=entries.length;
  out[44]=idx.length; out[64]=payloadEnd;
  entries.forEach(e=>{for(let i=0;i<e.size;i++)out[e.offset+i]=(e.seed||0x41)+i;});
  out.set(idx,payloadEnd);
  return out.buffer;
}
function entry(i,over={}) {return {type:0x1234,group:0x5678,instance:BigInt(i),offset:96+i*8,size:4,mem:4,ext:true,comp:0,commit:1,...over};}
const tests=[];
function test(name,fn){try{fn();tests.push({name,ok:true})}catch(e){tests.push({name,ok:false,error:e.message})}}
function assert(v,msg){if(!v)throw new Error(msg||'assertion failed')}
function throws(fn,pattern){let did=false;try{fn()}catch(e){did=pattern?pattern.test(e.message):true}assert(did,'expected parser rejection'+(pattern?' matching '+pattern:''))}
test('valid compact constant-TGI index parses',()=>{const p=parse(fixture([entry(1),entry(2,{offset:100})));assert(p.entries.length===2);assert(p.flags===7);assert(p.entries[1].instance==='0000000000000002')});
test('valid full-TGI variable index parses',()=>{const p=parse(fixture([entry(1,{type:1,group:2,instance:0x1122334455667788n}),entry(2,{type:3,group:4,instance:0xAABBCCDDEEFF0011n})]));assert(p.flags===0);assert(p.entries[1].type===3&&p.entries[1].group===4);assert(p.entries[1].instance==='AABBCCDDEEFF0011')});
test('short header is rejected',()=>throws(()=>parse(new Uint8Array(95).buffer),/header truncated/));
test('non-DBPF signature rejected',()=>{let b=fixture([entry(1)]);new Uint8Array(b)[0]=88;throws(()=>parse(b),/Not a DBPF/);});
test('index missing flags word rejected',()=>{let b=fixture([entry(1)]),d=new Uint8Array(b);d[44]=3;throws(()=>parse(d.buffer),/index missing flags/);});
test('unknown index flags rejected',()=>{let b=fixture([entry(1)],8);throws(()=>parse(b),/Unsupported DBPF index flags/);});
test('index outside package bounds rejected',()=>{let b=fixture([entry(1)]),d=new Uint8Array(b);d[64]=255;throws(()=>parse(d.buffer),/Index is outside/);});
test('index overlap header rejected',()=>{let b=fixture([entry(1)]),d=new Uint8Array(b);d[64]=80;throws(()=>parse(d.buffer),/overlaps header/);});
test('truncated index entry rejected',()=>{let b=fixture([entry(1)]),d=new Uint8Array(b);d[44]=8;throws(()=>parse(d.buffer),/Index truncated/);});
test('resource payload out-of-bounds rejected',()=>{let b=fixture([entry(1)]),d=new Uint8Array(b);d[96]=0;d[97]=0;d[98]=0;d[99]=0;throws(()=>parse(d.buffer),/invalid payload bounds/);});
test('payload cannot overlap index',()=>{let b=fixture([entry(1)]),d=new Uint8Array(b);d[96]=1;d[97]=0;d[98]=0;d[99]=0;throws(()=>parse(d.buffer),/overlaps DBPF index/);});
test('extended compression metadata decoded',()=>{const p=parse(fixture([entry(1,{comp:0xFFFF,commit:0x1234})]));assert(p.entries[0].compression===0xFFFF);assert(p.entries[0].committed===0x1234);assert(p.entries[0].isInternal);});
test('zero-size resource metadata accepted',()=>{const p=parse(fixture([entry(1,{offset:0,size:0,mem:0,ext:false})]));assert(p.entries[0].size===0);});
test('empty package with zero index accepted',()=>{const p=parse(fixture([]));assert(p.count===0&&p.entries.length===0);});
test('empty package with nonzero index size rejected',()=>{let b=fixture([]),d=new Uint8Array(b);d[44]=4;throws(()=>parse(d.buffer),/Empty DBPF index has unexpected size/);});
test('unreasonable resource count rejected',()=>{let b=fixture([entry(1)]),d=new Uint8Array(b);d[36]=255;d[37]=255;d[38]=255;d[39]=127;throws(()=>parse(d.buffer),/Unreasonable resource count/);});
const failed=tests.filter(t=>!t.ok);
console.log('DBPF parser regression: '+(tests.length-failed.length)+'/'+tests.length+' passed');
tests.forEach(t=>console.log((t.ok?'PASS':'FAIL')+' '+t.name+(t.error?' :: '+t.error:'')));
if(failed.length)process.exitCode=1;
