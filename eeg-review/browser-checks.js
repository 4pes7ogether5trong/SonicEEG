
(async()=>{
const report=[],$=id=>document.getElementById(id);
window.addEventListener('error',e=>report.push({name:'uncaught error',status:'FAIL',error:e.message}));
const wait=async()=>{for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,15));if($('busy').hidden)return;}throw Error('render timed out');};
const check=(name,condition)=>report.push({name,status:condition?'pass':'FAIL'});
try{
await wait();const core=await runTests(window.EEGCore);report.push(...core);
check('Initial demo canvas renders', $('trace').width>0 && $('channelCount').textContent==='18 / 18 traces');
$('next').click();await wait();check('Real button paging', $('position').textContent.startsWith('00:10.000'));
$('montage').value='average';$('montage').dispatchEvent(new Event('change'));await wait();check('Real montage selector', $('channelCount').textContent==='19 / 19 traces');
$('customButton').click();check('Native dialog opens', $('customDialog').open);$('addRow').click();$('saveCustom').click();await wait();check('Saved custom montage applies', $('channelCount').textContent==='19 / 19 traces');
const dt=new DataTransfer();dt.items.add(new File(['time_s,Fp1,F7\n0,10,2\n0.25,-10,4\n0.5,20,6\n0.75,-20,8'], 'browser-test.csv',{type:'text/csv'}));$('fileInput').files=dt.files;$('fileInput').dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,30));check('Local file picker opens text settings', $('csvDialog').open);
$('csvRate').value=4;$('csvLoad').click();await wait();check('Real local File import and plotting', $('recordName').textContent==='browser-test.csv'&&$('channelCount').textContent==='2 / 2 traces');
$('detailsButton').click();$('commonConfirm').checked=true;$('commonConfirm').dispatchEvent(new Event('change'));$('details').close();$('montage').value='longitudinal';$('montage').dispatchEvent(new Event('change'));await wait();check('Imported channels are remounted', $('channelCount').textContent==='1 / 18 traces');
$('closeButton').click();await wait();check('Close drops recording and restores demo', $('recordName').textContent==='Synthetic demonstration');
check('No horizontal document overflow', document.documentElement.scrollWidth<=innerWidth+1);
}catch(e){report.push({name:'Browser workflow',status:'FAIL',error:e.message});}
const p=document.createElement('pre');p.id='qa-done';p.hidden=true;p.textContent=JSON.stringify(report);document.body.append(p);
})();