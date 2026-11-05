const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
(async()=>{const core=fs.readFileSync(path.join(__dirname,'core.js'),'utf8');const C=vm.runInNewContext(core+';EEGCore',{TextDecoder});const run=require('./tests.cjs');const results=await run(C);for(const r of results)console.log(r.status+' '+r.name+(r.error?' — '+r.error:''));if(results.some(r=>r.status!=='pass'))process.exitCode=1;})();
