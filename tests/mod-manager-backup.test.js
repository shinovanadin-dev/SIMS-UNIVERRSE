const fs=require("fs");
const crypto=require("crypto");
const html=fs.readFileSync("index.html","utf8");
const start=html.indexOf("async function managerBackupItems("),end=html.indexOf("async function managerHashFile",start);
if(start<0||end<0)throw Error("backup helper boundaries missing");
const source=html.slice(start,end);
const hash=async file=>{const data=await file.arrayBuffer();return crypto.createHash("sha256").update(Buffer.from(data)).digest("hex")};
async function run(copyFile){const folder={manifest:null};const getDir=async()=>folder;const copyTo=async(_,path,file)=>({getFile:async()=>copyFile?copyFile(file):file});const writeManifest=async(_,m)=>{folder.manifest=JSON.parse(JSON.stringify(m))};const backup=new Function("managerGetBackupDir","managerCopyToDir","managerHashFile","managerWriteBackupManifest",source+";return managerBackupItems;")(getDir,copyTo,hash,writeManifest);const original=new File(["safe test package"],"fixture.package");const item={path:"Mods/test.package",file:original,hash:await hash(original)};return{folder,backup:await backup([item],"test")}}
(async()=>{const ok=await run();if(!ok.backup||ok.folder.manifest.status!=="complete"||ok.folder.manifest.files.length!==1||ok.folder.manifest.expectedFiles!==1)throw Error("completed backup manifest regression");let failed=false;try{await run(async file=>new File(["tampered"],file.name))}catch(e){failed=true}if(!failed)throw Error("tampered copy should fail hash validation");console.log("Backup helper tests passed: complete manifest + hash mismatch rejection")})().catch(e=>{console.error(e);process.exit(1)});
