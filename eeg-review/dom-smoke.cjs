async function smokeApp(coreCode,appCode,html){
 class Element{
 constructor(tag,id){this.tagName=tag.toUpperCase();this.id=id;this.children=[];this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.listeners={};this.style={};this.classList={toggle(){},add(){},remove(){}};this.clientWidth=1024;this.clientHeight=480;this.textContent='';this.attributes={};}
 append(...els){for(const e of els){e.parent=this;this.children.push(e);if(this.tagName==='SELECT'&&this.children.length===1)this.value=e.value;}}
 replaceChildren(...e){this.children=[];this.append(...e);}
 get selectedOptions(){return this.children.filter(c=>c.value===this.value);}
 setAttribute(k,v){this.attributes[k]=v;}
 addEventListener(n,f){(this.listeners[n]??=[]).push(f);}
 click(){if(!this.disabled)this.onclick?.({target:this});}
 showModal(){this.open=true;}close(){this.open=false;}focus(){}
 closest(){return this.parent;}
 getBoundingClientRect(){return {left:0,top:0};}
 getContext(){return new Proxy({},{get:()=>()=>{}});}
 }
 const elements={},tagRE=/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/gi;let m;while(m=tagRE.exec(html)){const e=new Element(m[1],m[3]);const value=m[2].match(/\bvalue="([^"]*)"/);if(value)e.value=value[1];e.checked=/\bchecked\b/.test(m[2]);elements[e.id]=e;}
 for(const match of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)){const e=elements[match[1]];for(const o of match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)){const op=new Element('option');op.value=o[1].match(/value="([^"]*)"/)?.[1]??o[2];op.textContent=o[2];e.append(op);if(/\bselected\b/.test(o[1]))e.value=op.value;}}
 const missing=[],doc={getElementById(id){if(!elements[id])missing.push(id);return elements[id];},createElement:tag=>new Element(tag),querySelectorAll:()=>[],body:new Element('body')},storage=new Map(),win={devicePixelRatio:2,addEventListener(){}};win.EEGCore=new Function(coreCode+';return EEGCore;')();const frame=f=>f();
 new Function('window','document','localStorage','requestAnimationFrame','ResizeObserver','setTimeout','URL','Blob',appCode)(win,doc,{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},frame,class{observe(){}},()=>{}, {createObjectURL:()=>'',revokeObjectURL(){}},class{});
 const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
 await settle();const out=[];function check(name,fn){try{if(!fn())throw Error('check false');out.push({name,status:'pass'});}catch(e){out.push({name,status:'FAIL',error:e.message});}}
 check('All DOM selectors resolve',()=>missing.length===0);
 check('Demo renders a readable initial page',()=>elements.recordName.textContent==='Synthetic demonstration'&&elements.channelCount.textContent==='18 / 18 traces'&&elements.busy.hidden===true);
 elements.next.click();await settle();check('Next page updates timeline',()=>elements.position.textContent.startsWith('00:10.000'));
 elements.prev.click();await settle();check('Previous page returns to start',()=>elements.position.textContent.startsWith('00:00.000'));
 elements.montage.value='average';elements.montage.onchange();await settle();check('Montage control shows 19 average-reference traces',()=>elements.channelCount.textContent==='19 / 19 traces');
 elements.customButton.click();check('Custom editor opens with 18 rows',()=>elements.customDialog.open&&elements.customRows.children.length===18);
 elements.addRow.click();elements.saveCustom.click();await settle();check('Custom montage saves and applies',()=>elements.channelCount.textContent==='19 / 19 traces'&&storage.has('eeg-review-montage-v1'));
 elements.detailsButton.click();check('Details expose channel mapping',()=>elements.details.open&&elements.channelTable.children.length===22);
 elements.jumpButton.click();elements.jumpTime.value='1:00';elements.jumpGo.click();await settle();check('Go-to time parses mm:ss',()=>elements.position.textContent.startsWith('01:00.000'));
 elements.markButton.click();elements.noteText.value='Review marker';elements.saveNote.click();check('Session bookmark added',()=>elements.events.children.some(e=>e.children?.some(x=>x.textContent==='Review marker')));
 elements.focusButton.click();check('Expanded view control toggles',()=>elements.focusButton.textContent==='Exit expanded view');
 elements.hp.value='.5';elements.hp.onchange();await settle();check('Filters render without app errors',()=>elements.traceStatus.textContent.startsWith('Display filters active')&&elements.busy.hidden);
 return out;
}