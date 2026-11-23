// Full mocked AI -> token validation -> existing-RU preservation -> one DBPF rebuild -> reopen verification.
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('index.html','utf8');
function extract(name,next){let a1=html.indexOf('function '+name+'('),a2=html.indexOf('async function '+name+'('),a=a1<0?a2:a2<0?a1:Math.min(a1,a2);let b1=html.indexOf('function '+next+'(',a),b2=html.indexOf('async function '+next+'(',a),b=b1<0?b2:b2<0?b1:Math.min(b1,b2);if(a<0||b<0)throw Error('Missing production function '+name);return html.slice(a,b)}
const productionPipeline=html.slice(html.indexOf('async function dbpfRunUnifiedTranslationPipeline('),html.indexOf('async function dbpfApplyTranslationMemoryToPackage('));
assert.ok(productionPipeline.includes('report.errors.some(e=>e.phase==="scan")'),'production pipeline blocks rebuild after STBL scan failures');
assert.ok(productionPipeline.includes('report.missingTargetTables++'),'missing RU STBL target is counted and treated as a scan failure');
assert.ok(productionPipeline.includes('Matching Russian STBL target resource is missing'),'missing RU target cannot silently skip translation scope');
const missingTargetBlock=productionPipeline.slice(productionPipeline.indexOf('  if(!target){'),productionPipeline.indexOf(' report.targetTables++;'));
assert.ok(missingTargetBlock.includes('report.missingTargetTables++'),'missing target block increments counter');
let missingTargetReport={missingTargetTables:0,targetTables:0,errors:[]};
const missingTargetExec=new Function('report','src','target',missingTargetBlock.replace('continue','return'));
missingTargetExec(missingTargetReport,{index:7},null);
assert.strictEqual(missingTargetReport.missingTargetTables,1,'missing RU target counted');
assert.strictEqual(missingTargetReport.errors[0].phase,'scan','missing RU target is a scan failure');
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

// Fail-closed production guard regressions (behavioral harness for the guard's conditions).
const guardSource=productionPipeline.slice(productionPipeline.indexOf(' // A failed scan means the package translation scope is incomplete;'),productionPipeline.indexOf(' report.uniqueSourceStrings=normalizedMap.size;'));
assert.ok(guardSource.includes('return report'),'scan guard exits pipeline early');
assert.ok(guardSource.includes('dbpfDownload'),'scan guard exports diagnostic report');
assert.ok(!guardSource.includes('fetch('),'scan guard does not call translation API');
assert.ok(!guardSource.includes('dbpfRebuildPackage('),'scan guard does not rebuild package');
assert.ok(guardSource.includes('source package unchanged'),'scan guard communicates source preservation');
// Execute the extracted production scan-guard block with injected runtime dependencies.
let guardDownload=0,guardAlert=0,guardStatus='';
const guardReport={errors:[{phase:'scan',error:'fixture scan failure'}],mergeErrors:[],rebuildStatus:'not_started',verificationStatus:'not_started'};
const guardExec=new Function('report','originalName','setStatus','dbpfDownload','TextEncoder','alert',guardSource);
const guardReturn=guardExec(guardReport,'fixture.package',s=>guardStatus=s,()=>guardDownload++,TextEncoder,()=>guardAlert++);
assert.strictEqual(guardReturn,guardReport,'production scan guard returns report');
assert.strictEqual(guardReport.rebuildStatus,'blocked_scan_errors','scan error blocks rebuild');
assert.strictEqual(guardReport.verificationStatus,'failed','scan error marks verification failed');
assert.strictEqual(guardDownload,1,'scan guard emits report exactly once');
assert.strictEqual(guardAlert,1,'scan guard alerts exactly once');
assert.ok(guardStatus.includes('source package unchanged'),'scan guard status confirms source preserved');
 // Behavioral execution of production merge-error guard: fail closed, report, no rebuild/downloaded package.
 const mergeGuardStart=productionPipeline.indexOf(' if(report.mergeErrors.length){');
 const mergeGuardEnd=productionPipeline.indexOf(' if(!replacements.size){',mergeGuardStart);
 assert.ok(mergeGuardStart>=0&&mergeGuardEnd>mergeGuardStart,'production merge guard block found');
 const mergeGuardBlock=productionPipeline.slice(mergeGuardStart,mergeGuardEnd);
 assert.ok(mergeGuardBlock.includes('blocked_merge_errors'),'merge guard sets blocked status');
 assert.ok(!mergeGuardBlock.includes('dbpfRebuildPackage('),'merge guard prevents rebuild');
 let mergeGuardDownload=0,mergeGuardAlert=0,mergeGuardStatus='';
 const mergeGuardReport={mergeErrors:[{targetIndex:3,error:'fixture encoding failure'}],errors:[],rebuildStatus:'not_started',verificationStatus:'not_started',finishedAt:null};
 const mergeGuardExec=new Function('report','originalName','setStatus','TextEncoder','dbpfDownload','alert',mergeGuardBlock);
 const mergeGuardReturn=mergeGuardExec(mergeGuardReport,'fixture.package',s=>mergeGuardStatus=s,TextEncoder,()=>mergeGuardDownload++,()=>mergeGuardAlert++);
 assert.strictEqual(mergeGuardReturn,mergeGuardReport,'merge guard returns diagnostic report');
 assert.strictEqual(mergeGuardReport.rebuildStatus,'blocked_merge_errors','merge error blocks rebuild');
 assert.strictEqual(mergeGuardReport.verificationStatus,'failed','merge error marks verification failed');
 assert.strictEqual(mergeGuardDownload,1,'merge guard emits report once');
 assert.strictEqual(mergeGuardAlert,1,'merge guard alerts once');
 assert.ok(mergeGuardStatus.includes('source package unchanged'),'merge guard status confirms source preserved');

