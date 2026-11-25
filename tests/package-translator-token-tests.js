const fs=require("fs"),vm=require("vm"),assert=require("assert"),src=fs.readFileSync("package-translator.js","utf8");
const ctx={window:{crypto:{}},document:{getElementById:()=>null},indexedDB:{},Map,Set,Uint8Array,BigInt,String,Number,Error,Promise,RegExp,Array,Object,JSON,console};
vm.runInNewContext(src,ctx);const check=ctx.window.suPackageTokenCheck;
function t(n,s,d,expect){const r=check(s,d);assert.strictEqual(r.ok,expect,n+": "+JSON.stringify(r));console.log("PASS "+n)}
t("placeholders+markup","Hi {0} %s [SIM_NAME] <b>§X</b>\\n","Привет {0} %s [SIM_NAME] <b>§X</b>\\n",true);
t("localized gender families","{M0.He} {F0.She} {0M.His} {0F.Her}","{M0.Он} {F0.Она} {0M.Его} {0F.Её}",true);
t("gender family loss","{M0.He} {F0.She}","{M0.Он}",false);
t("gender family duplicate","{M0.He}","{M0.Он} {M0.Он}",false);
t("localized S/P tokens","{S0.item} {P0.items}","{S0.предмет} {P0.предметов}",true);
t("exact dynamic placeholder","{0.SimFirstName}","{0.SimFirstName}",true);
t("missing dynamic placeholder","{0.SimFirstName}","Сим",false);
t("exact markup","<link=\\\"0x1\\\">Open</link>","<link=\\\"0x1\\\">Открыть</link>",true);
t("escaped linebreak","A\\nB","А\\nБ",true);
t("real CRLF preserved","A\\r\\nB","А\\r\\nБ",true);
t("linebreak count rejected","A\\nB","А Б",false);
console.log("PACKAGE TOKEN REGRESSIONS: 11/11 passed");
