const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('async function dbpfBuildSmartTranslationQueue()'),end=html.indexOf('async function dbpfApplyTranslationMemoryToPackage()',start);
if(start<0||end<0)throw Error('Smart queue function not found');
const fn=html.slice(start,end);
let downloaded=null,alerts=[],meta={textContent:''};
const resources=[
 {index:0,type:0x220557DA,group:10,instance:'0000000000000000'},
 {index:1,type:0x220557DA,group:10,instance:'1800000000000000'},
 {index:2,type:0x220557DA,group:11,instance:'0000000000000001'},
 {index:3,type:0x220557DA,group:11,instance:'1800000000000001'},
 {index:4,type:0x220557DA,group:12,instance:'0000000000000002'}
];
const fakeSTBL={
 0:{entries:[{key:'00000001',text:'Hello'},{key:'00000002',text:'Hello'},{key:'00000003',text:'Token {0}'}]},
 1:{entries:[{key:'00000001',text:'Привет'},{key:'00000002',text:''},{key:'00000003',text:''}]},
 2:{entries:[{key:'00000011',text:'Hello'},{key:'00000012',text:'Welcome'}]},
 3:{entries:[{key:'00000011',text:'Привет'},{key:'00000012',text:'Добро пожаловать'}]},
 4:{entries:[{key:'00000021',text:'Bad STBL'}]}
};
const sandbox={DBPF_STBL_TYPE:0x220557DA,dbpfCurrent:{name:'Fixture.package',bytes:new Uint8Array(128)},dbpfEntries:resources,
 dbpfExtract:async e=>new Uint8Array([e.index]),stblParse:b=>{let n=b[0];if(n===4)throw Error('intentional corrupt table');return fakeSTBL[n]},
 dbpfDownload:(bytes,name,ext)=>{downloaded={json:new TextDecoder().decode(bytes),name,ext}},
 translatorMemoryGet:(lang,source)=>source==='Hello'?'Привет':source==='Welcome'?'Добро пожаловать':source==='Token {0}'?'Token':'',
 translatorTokenCheck:({source,trans})=>({ok:source!=='Token {0}'&&trans!=='Token'}),
 document:{getElementById:id=>meta},alert:m=>alerts.push(m),TextEncoder};
vm.runInNewContext(fn,sandbox);
(async()=>{const report=await sandbox.dbpfBuildSmartTranslationQueue();assert(report,'report returned');
 assert.equal(report.resources.length,3,'three ENG resources enumerated');
 assert.equal(report.uniqueTexts,3,'duplicate source strings deduplicated globally');
 assert.equal(report.safeTMPercent,67,'safe TM coverage percentage rounded');
 assert.equal(report.aiQueuePercent,0,'AI queue percentage is zero for TM-complete fixture');
 assert.equal(report.noRussianTarget,1,'missing Russian counterpart is counted');
 assert.equal(report.resourceErrors,1,'resource-level parse errors counted in final metrics');
 assert.equal(report.tmReady,2,'two TM-valid unique strings counted');
 assert.equal(report.tokenRejected,1,'placeholder token mismatch rejected');
 assert.equal(report.needsAI,0,'no TM misses in fixture');
 assert.equal(report.globalQueue.find(q=>q.source==='Hello').occurrences.length,3,'duplicate Hello fans out to three resource/key occurrences');
 assert.equal(report.resources[0].queue.length,3,'per-resource queue retains distinct keys');
 assert.equal(report.resources[0].tmReady,2,'per-resource TM hit counts include repeated source keys');
 assert.equal(report.resources[0].tokenRejected,1,'per-resource token rejection count recorded');
 assert.equal(report.resources[1].tmReady,2,'second resource counts local TM actions');
 assert.equal(report.resources[2].status,'error','corrupt STBL isolated');
 assert.equal(report.errors.length,1,'corrupt resource reported once');
 assert.equal(downloaded.ext,'json','queue report downloaded');
 assert.equal(report.queueStatus,'partial','partial queue status surfaced');
 console.log('Smart package queue regression: 11 checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
