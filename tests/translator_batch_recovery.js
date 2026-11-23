const fs=require("fs"),vm=require("vm"),assert=require("assert");
const html=fs.readFileSync("index.html","utf8");
function extract(name){let start=html.indexOf("async function "+name+"(");if(start<0)throw Error("Function missing: "+name);let end=html.indexOf("\nfunction translatorSet",start);if(end<0)throw Error("Function terminator missing");return html.slice(start,end)}
const memory=html.slice(html.indexOf('const TRANSLATOR_MEMORY_KEY="simsUniverseTranslationMemoryV1";'),html.indexOf("async function translatorAITranslateUntranslated(){"));
const fn=memory+extract("translatorAITranslateUntranslated");
function setup(rows,fetch){let saves=0,draws=0,updates=0,alerts=[],storage=new Map(),ctx={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},translatorRows:rows,translatorTokenCheck:()=>({ok:true}),translatorAutoSave:()=>saves++,translatorDraw:()=>draws++,translatorUpdateMeta:()=>updates++,document:{getElementById:id=>id==="translatorLanguage"?{value:"Russian"}:id==="translatorMeta"?{textContent:""}:null},alert:m=>alerts.push(m),fetch};return{ctx,get saves(){return saves},get draws(){return draws},get updates(){return updates},alerts}}
(async()=>{
 let rows=Array.from({length:60},(_,i)=>({source:"Source "+i,trans:"",status:"draft"})),calls=0;
 let h=setup(rows,async(url,opt)=>{calls++;if(calls===1)throw Error("network offline");let b=JSON.parse(opt.body);return{ok:true,status:200,json:async()=>({translations:b.texts.map(t=>"RU "+t)})}});
 await vm.runInNewContext(fn+";translatorAITranslateUntranslated()",h.ctx);
 assert.equal(calls,3);assert.equal(rows.filter(r=>r.trans).length,35);assert.equal(h.saves,3);assert.equal(h.draws,3);assert.equal(h.updates,3);assert(h.alerts[0].includes("неудачных пакетов: 1"));console.log("PASS continues after failed batch, autosaves, and translates subsequent batches");
 rows=Array.from({length:26},(_,i)=>({source:"Source "+i,trans:"",status:"draft"}));calls=0;
 h=setup(rows,async(url,opt)=>{calls++;return calls===1?{ok:false,status:503,json:async()=>({error:"busy"})}:{ok:true,status:200,json:async()=>({translations:JSON.parse(opt.body).texts.map(t=>"RU "+t)})}});
 await vm.runInNewContext(fn+";translatorAITranslateUntranslated()",h.ctx);
 assert.equal(calls,2);assert(h.alerts[0].includes("пакет 1 (строки 1–25)"));assert.equal(rows.filter(r=>r.trans).length,1);console.log("PASS error report names failed batch and exact row range");
})().catch(e=>{console.error(e);process.exit(1)});
