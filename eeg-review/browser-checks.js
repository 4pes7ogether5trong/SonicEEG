
(async()=>{
const report=[],$=id=>document.getElementById(id);
window.addEventListener('error',e=>report.push({name:'uncaught error',status:'FAIL',error:e.message}));
const wait=async()=>{for(let i=0;i<200;i++){await new Promise(r=>setTimeout(r,15));if($('busy').hidden)return;}throw Error('render timed out');};
const check=(name,condition)=>report.push({name,status:condition?'pass':'FAIL'});
try{
await wait();const core=await runTests(window.EEGCore);report.push(...core);report.push(...await runFormatTests(window.EEGCore));
check('Initial demo canvas renders', $('trace').width>0 && $('channelCount').textContent==='18 / 18 traces');
$('next').click();await wait();check('Real button paging', $('position').textContent.startsWith('00:10.000'));
$('montage').value='average';$('montage').dispatchEvent(new Event('change'));await wait();check('Real montage selector', $('channelCount').textContent==='19 / 19 traces');
$('customButton').click();check('Native dialog opens', $('customDialog').open);$('resetCustom').click();$('addRow').click();$('saveCustom').click();await wait();check('Saved custom montage applies', $('channelCount').textContent==='19 / 19 traces');
const dt=new DataTransfer();dt.items.add(new File(['time_s,Fp1,F7\n0,10,2\n0.25,-10,4\n0.5,20,6\n0.75,-20,8'], 'browser-test.csv',{type:'text/csv'}));$('fileInput').files=dt.files;$('fileInput').dispatchEvent(new Event('change'));await new Promise(r=>setTimeout(r,30));check('Local file picker opens text settings', $('csvDialog').open);
$('csvRate').value=4;$('csvLoad').click();await wait();check('Real local File import and plotting', $('recordName').textContent==='browser-test.csv'&&$('channelCount').textContent==='2 / 2 traces');
$('detailsButton').click();$('commonConfirm').checked=true;$('commonConfirm').dispatchEvent(new Event('change'));$('details').close();$('montage').value='longitudinal';$('montage').dispatchEvent(new Event('change'));await wait();check('Imported channels are remounted', $('channelCount').textContent==='1 / 18 traces');
$('closeButton').click();await wait();check('Close drops recording and restores demo', $('recordName').textContent==='Synthetic demonstration');
$('formatsButton').click();check('Compatibility panel opens separately from guide', $('compatibility').open&&$('compatibility').textContent.includes('Nihon Kohden'));check('Local converter download is offered', $('compatibility').querySelector('a[download]').getAttribute('href')==='/converter.zip');$('compatibility').close();
const upload=async(files,name)=>{const transfer=new DataTransfer();for(const f of files)transfer.items.add(f);$('fileInput').files=transfer.files;$('fileInput').dispatchEvent(new Event('change'));for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,20));if($('recordName').textContent===name&&$('busy').hidden)return;}throw Error('Import did not complete: '+name);};
const binary=new ArrayBuffer(16);[10,-10,20,-20,32767,-32768,0,4].forEach((v,i)=>new DataView(binary).setInt16(i*2,v,true));
await upload([new File(['elec_names=[Fp1,F7]\nnum_channels=2\nnum_samples=4\nsample_freq=4\nconversion_factor=0.5\n'],'browser-nicolet.head'),new File([binary],'browser-nicolet.data')],'browser-nicolet.data');
check('Nicolet companion files load through file input', $('formatBadge').textContent==='Nicolet export'&&$('channelCount').textContent==='2 / 2 traces');
const h={schema:'eeg-review/1',sample_type:'float64-le',layout:'sample-major',unit:'uV',sample_rate:4,sample_count:4,source_format:'Nihon Kohden',channels:[{label:'Fp1',reference:'unknown'},{label:'F7',reference:'unknown'}],events:[{time:.25,duration:0,text:'Prepared event'}],warnings:[]};
const json=new TextEncoder().encode(JSON.stringify(h)),prepared=new ArrayBuffer(16+json.length+64),pd=new DataView(prepared);new Uint8Array(prepared).set(new TextEncoder().encode('EEGRVW1\n'));pd.setUint32(8,json.length,true);new Uint8Array(prepared).set(json,16);[10,-10,20,-20,30,-30,40,-40].forEach((v,i)=>pd.setFloat64(16+json.length+i*8,v,true));
await upload([new File([prepared],'browser-prepared.eegreview')],'browser-prepared.eegreview');
check('Prepared recording loads through file input', $('formatBadge').textContent==='Converted Nihon Kohden'&&$('channelCount').textContent==='2 / 2 traces');
check('Prepared event is visible', $('events').textContent.includes('Prepared event'));
$('montage').value='longitudinal';$('montage').dispatchEvent(new Event('change'));await wait();check('Prepared unknown references require confirmation', $('channelCount').textContent==='0 / 18 traces');
$('detailsButton').click();$('commonConfirm').checked=true;$('commonConfirm').dispatchEvent(new Event('change'));$('details').close();await wait();check('Prepared montage applies after reference confirmation', $('channelCount').textContent==='1 / 18 traces');
$('closeButton').click();await wait();
check('No horizontal document overflow', document.documentElement.scrollWidth<=innerWidth+1);
}catch(e){report.push({name:'Browser workflow',status:'FAIL',error:e.message});}
const p=document.createElement('pre');p.id='qa-done';p.hidden=true;p.textContent=JSON.stringify(report);document.body.append(p);
})();
