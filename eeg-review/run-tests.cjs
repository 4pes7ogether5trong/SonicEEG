const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
(async()=>{const ctx={TextDecoder,TextEncoder,window:{}};vm.createContext(ctx);
for(const f of ['core.js','formats.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,f),'utf8'),ctx);
const results=[...await require('./tests.cjs')(ctx.window.EEGCore),...await require('./formats-tests.cjs')(ctx.window.EEGCore)];
const smoke=vm.runInNewContext(fs.readFileSync(path.join(__dirname,'dom-smoke.cjs'),'utf8')+';smokeApp',{TextDecoder});
results.push(...await smoke(fs.readFileSync(path.join(__dirname,'core.js'),'utf8'),fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),fs.readFileSync(path.join(__dirname,'index.html'),'utf8')));
for(const r of results)console.log(r.status+' '+r.name+(r.error?' — '+r.error:''));console.log(results.filter(r=>r.status==='pass').length+'/'+results.length+' checks passed');if(results.some(r=>r.status!=='pass'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
