const fs=require('fs'),assert=require('assert');
const html=fs.readFileSync('index.html','utf8');
function extract(name,next){const a=html.indexOf('function '+name+'('),b=html.indexOf(next,a);assert.ok(a>=0&&b>a,name+' exists');return html.slice(a,b).trim()}
const token=extract('translatorTokens','function translatorNormalizeKey');
const validator=extract('translatorValidateBatchResults','async function dbpfRunUnifiedTranslationPipeline');
const check=new Function(token+';return translatorTokenCheck;')();
const validate=new Function(token+'\n'+validator+';return translatorValidateBatchResults;')();
const manifest={batches:[{batch:1,items:[{key:'K1',source:'Hello {0.SimName}'},{key:'K2',source:'Goodbye'}]}]};
const result={batches:[{batch:1,items:[{key:'K1',source:'Hello {0.SimName}',translation:'Привет {0.SimName}'},{key:'K2',source:'Goodbye',translation:'До свидания'}]}]};
const ok=validate(manifest,result);assert.strictEqual(ok.accepted.length,2);assert.strictEqual(ok.rejected.length,0);assert.strictEqual(ok.missing.length,0);
const bad=validate(manifest,{batches:[{batch:1,items:[{key:'K1',source:'WRONG',translation:'Без токена'},{key:'K2',source:'Goodbye',translation:''},{key:'K1',source:'Hello {0.SimName}',translation:'Привет'}]},{batch:99,items:[{key:'X',source:'x',translation:'y'}]}]});
assert.strictEqual(bad.accepted.length,0);assert.strictEqual(bad.rejected.length,4);assert.strictEqual(bad.missing.length,2,'invalid rows remain missing from accepted output');
const tokens=check({source:'{0.SimName}',trans:'Имя'});assert.strictEqual(tokens.ok,false);
console.log('PASS translated batch result validator: exact key/source, token checks, duplicates, empty, unknown batch, missing rows');
