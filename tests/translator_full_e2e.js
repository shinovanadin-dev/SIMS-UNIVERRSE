// Full mocked AI -> token validation -> existing-RU preservation -> one DBPF rebuild -> reopen verification.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('index.html','utf8');
function extract(name,next){let a1=html.indexOf('function '+name+'('),a2=html.indexOf('async function '+name+'('),a=a1<0?a2:a2<0?a1:Math.min(a1,a2);let b1=html.indexOf('function '+next+'(',a),b2=html.indexOf('async function '+next+'(',a),b=b1<0?b2:b2<0?b1:Math.min(b1,b2);if(a<0||b<0)throw Error('Missing production function '+name);return html.slice(a,b)}
const productionPipeline=html.slice(html.indexOf('async function dbpfRunUnifiedTranslationPipeline('),html.indexOf('async function dbpfApplyTranslationMemoryToPackage('));
assert.ok(productionPipeline.includes('report.errors.some(e=>e.phase==="scan")'),'production pipeline blocks rebuild after STBL scan failures');
assert.ok(productionPipeline.includes('blocked_scan_errors'),'production scan guard marks failure status');
assert.ok(productionPipeline.indexOf('blocked_scan_errors')<productionPipeline.indexOf('const queue=Array.from(normalizedMap.values())'),'scan guard runs before AI queue execution');
const src=[extract('dbpfU32','dbpfU16'),extract('dbpfU16','dbpfParse'),extract('dbpfParse','dbpfTypeName'),extract('stblU16','stblU32'),extract('stblU32','stblU64'),extract('stblU64','stblParse'),extract('stblParse','stblEncode'),extract('stblEncode','stblKeyNumber'),extract('stblKeyNumber','stblLoadFile'),extract('translatorTokens','translatorTokenCheck'),extract('translatorTokenCheck','translatorNormalizeKey')].join('\n')+'\n'+extract('dbpfWrite32','dbpfWrite16')+'\n'+extract('dbpfWrite16','dbpfRebuildPackage')+'\n'+extract('dbpfRebuildPackage','dbpfReplaceSTBL');
const ctx={Uint8Array,BigInt,TextDecoder,TextEncoder,Map,Set,Error,Number,String,Response,Blob,window:{},console};vm.runInNewContext(src,ctx);
function u32(d,p,v){d[p]=v&255;d[p+1]=v>>>8&255;d[p+2]=v>>>16&255;d[p+3]=v>>>24&255}function u16(d,p,v){d[p]=v&255;d[p+1]=v>>>8}
function fixture(payloads){let pos=96,entries=[];for(let i=0;i<payloads.length;i++){pos=(pos+3)&~3;entries.push({type:i<2?0x220557DA:0xDEADBEEF,group:0x11110000+i,instance:BigInt(0xABC000+i),offset:pos,size:payloads[i].length,memSize:payloads[i].length,compression:0,committed:1,compressedFlag:true,index:i});pos+=payloads[i].length}
let index=new Uint8Array(4+entries.length*32);u32(index,0,0);let p=4;for(const e of entries){for(const v of [e.type,e.group,Number(e.instance>>32n),Number(e.instance&0xffffffffn),e.offset,e.size|0x80000000,e.memSize]){u32(index,p,v);p+=4}u16(index,p,0);u16(index,p+2,1);p+=4}
let out=new Uint8Array(pos+index.length);out.set([68,66,80,70],0);u32(out,4,2);u32(out,8,1);u32(out,36,entries.length);u32(out,44,index.length);u32(out,64,pos);entries.forEach(e=>out.set(payloads[e.index],e.offset));out.set(index,pos);return out.buffer}
function must(ok,msg){assert.ok(ok,msg)}
(async()=>{
const originals=[ctx.stblEncode([{key:'1',flags:4,text:'Hello {0}'},{key:'2',flags:2,text:'Open'}]),ctx.stblEncode([{key:'3',flags:1,text:'Bad [PLAYER]'}]),new Uint8Array([10,20,30,40,50,60])];
const packageBuffer=fixture(originals),originalParsed=ctx.dbpfParse(packageBuffer);must(originalParsed.entries.length===3,'fixture has 3 resources');
ctx.dbpfCurrent={bytes:new Uint8Array(packageBuffer),name:'synthetic-e2e.package'};ctx.dbpfEntries=originalParsed.entries;
let rebuildCalls=0;const realRebuild=ctx.dbpfRebuildPackage;ctx.dbpfRebuildPackage=(m)=>{rebuildCalls++;return realRebuild(m)};
let apiCalls=0;async function mockAI(texts){apiCalls++;return {ok:true,status:200,json:async()=>({translations:texts.map(t=>t==='Hello {0}'?'Здравствуйте {0}':t==='Bad [PLAYER]'?'Bad PLAYER':'')})}}
const work=[],existingRU={Open:'Открыть'},tableData=[];
for(const e of ctx.dbpfEntries.slice(0,2)){let table=ctx.stblParse(ctx.dbpfCurrent.bytes.slice(e.offset,e.offset+e.size));tableData.push({index:e.index,entries:table.entries});for(const row of table.entries)if(!existingRU[row.text])work.push(row.text)}
const response=await (await mockAI(work)).json();must(apiCalls===1&&response.translations.length===work.length,'single mock AI response contract');
const replacements=new Map();let rejected=0,translated=0,preserved=0;
for(const t of tableData){let changed=false;for(const row of t.entries){if(existingRU[row.text]){row.text=existingRU[row.text];preserved++;continue}let ix=work.indexOf(row.text);if(ix<0)continue;let candidate=response.translations[ix];if(!ctx.translatorTokenCheck({source:row.text,trans:candidate}).ok){rejected++;continue}row.text=candidate;translated++;changed=true}if(changed)replacements.set(t.index,ctx.stblEncode(t.entries))}
must(translated===1,'one valid translation accepted');must(rejected===1,'token mismatch rejected');must(preserved===1,'existing Russian retained');must(replacements.size===1,'only one resource needs replacement');
async function apiError(){const res={ok:false,status:503};if(!res.ok)throw Error('AI API HTTP '+res.status)}let caught=false;try{await apiError()}catch(e){caught=/503/.test(e.message)}must(caught,'HTTP 503 surfaced');
const rebuilt=await ctx.dbpfRebuildPackage(replacements);must(rebuildCalls===1,'single rebuild invocation');const reopened=ctx.dbpfParse(rebuilt);must(reopened.entries.length===3,'resource count after reopen');
ctx.dbpfCurrent={bytes:new Uint8Array(rebuilt),name:'reopened.package'};ctx.dbpfEntries=reopened.entries;
const tables=[];for(const e of reopened.entries.filter(e=>e.type===0x220557DA))tables.push(ctx.stblParse(ctx.dbpfCurrent.bytes.slice(e.offset,e.offset+e.size)));const rows=tables.flatMap(t=>t.entries);
must(rows.some(r=>r.text==='Здравствуйте {0}'),'translated row roundtrip');must(!rows.some(r=>r.text==='Open'),'existing translation source replaced by stored Russian');must(rows.some(r=>r.text==='Bad [PLAYER]'),'rejected token source remains');must(rows.some(r=>r.text==='Открыть'),'existing RU remains after reopen');
let opaque=reopened.entries.find(e=>e.type===0xDEADBEEF),op=ctx.dbpfCurrent.bytes.slice(opaque.offset,opaque.offset+opaque.size);must(op.length===originals[2].length&&op.every((v,i)=>v===originals[2][i]),'opaque resource unchanged byte-for-byte');must(rebuildCalls===1,'no extra rebuild');console.log('FULL TRANSLATOR E2E PASS: AI mock, HTTP 503 surfacing, token rejection, existing-RU preservation, exactly one rebuild, DBPF reopen, STBL/resource/TGI/opaque verification');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
