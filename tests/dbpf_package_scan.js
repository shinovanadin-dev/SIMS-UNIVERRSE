const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('async function dbpfScanPackageTranslationCoverage()'),end=html.indexOf('async function dbpfExportAllSTBL()',start);
if(start<0||end<0)throw Error('scanner function not found');
const fn=html.slice(start,end);
let captured=null,alerts=[],meta={textContent:''};
const resources=[
 {index:0,type:0x220557DA,group:1,instance:'0100000000000000',compression:0,size:12,memSize:12},
 {index:1,type:0x220557DA,group:2,instance:'1800000000000001',compression:0xFFFF,size:20,memSize:28},
 {index:2,type:0x12345678,group:3,instance:'0000000000000002',compression:0,size:8,memSize:8},
 {index:3,type:0x220557DA,group:4,instance:'0100000000000003',compression:0,size:14,memSize:14}
];
const sandbox={DBPF_STBL_TYPE:0x220557DA,dbpfCurrent:{name:'Fixture.package',bytes:new Uint8Array(100)},dbpfEntries:resources,
 dbpfExtract:async e=>new Uint8Array([e.index]),
 stblParse:b=>{let id=b[0];if(id===3)throw Error('fixture parse failure');return {entries:id===0?[{text:'Hello'},{text:'Hello'},{text:''}]:[{text:'Welcome'}]}},
 dbpfDownload:(bytes,name,ext)=>captured={json:new TextDecoder().decode(bytes),name,ext},
 document:{getElementById:id=>meta},alert:m=>alerts.push(m),TextEncoder,console};
vm.runInNewContext(fn,sandbox);
(async()=>{await sandbox.dbpfScanPackageTranslationCoverage();const report=JSON.parse(captured.json);
assert.equal(report.resourcesTotal,4,'total resources counted');
assert.equal(report.stblResources,3,'STBL resources counted only');
assert.equal(report.stblStrings,4,'strings count across readable tables');
assert.equal(report.emptyStrings,1,'empty text counted');
assert.equal(report.duplicateTexts,1,'duplicate text counted');
assert.equal(report.uniqueNonEmptyTexts,2,'unique non-empty count');
assert.equal(report.errors.length,1,'one broken STBL isolated');
assert.equal(report.scanStatus,'partial','partial status reported');
assert.equal(report.resources[2].status,'error','failed resource recorded');
assert.equal(captured.ext,'json','JSON report emitted');
assert(alerts[0].includes('partial'),'summary feedback shown');
console.log('Package scan coverage regression: 11 checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
