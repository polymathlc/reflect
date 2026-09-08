import {newSheet,normaliseSheet,blankRow,DEFAULT_COLUMNS,HINTS,uid,moveItem,rowErrors,totals,parseScan,escapeHTML as e,printable,LOGO} from './model.js';

const $=id=>document.getElementById(id);
let account=null,authReady=false,cloud=null,revision=0,epoch=0,dirty=false,scanRun=0,scanFiles=[],reviewRows=[],reviewColumns=[],reviewSources=[],reviewSheetId=null,scanBusy=false;
let sheet=newSheet();
const draftKey=uid=>`plc-reflect-v1:${uid||'guest'}`;
function notice(message,error=false){$('notice').textContent=message;$('notice').classList.toggle('error',error);}
function writeDraft(){try{localStorage.setItem(draftKey(account?.uid),JSON.stringify(sheet));$('save-status').textContent=account?'Draft saved on this device · save online to sync':'Draft saved on this device';}catch{$('save-status').textContent='Draft could not be saved on this device';notice('Device storage is full or unavailable. Download a backup before leaving.',true);}}
function readDraft(id){try{const raw=localStorage.getItem(draftKey(id));return raw?normaliseSheet(JSON.parse(raw)):null;}catch{notice('The saved draft could not be opened. You can open a downloaded backup.',true);return null;}}
sheet=readDraft(null)||sheet;
function changed(render=false){revision++;dirty=true;sheet.updatedAt=Date.now();writeDraft();if(render)renderSheet();else renderScore();}
function replaceSheet(next){sheet=next;revision++;dirty=false;writeDraft();renderSheet();}
function renderScore(){const s=totals(sheet),errors=sheet.rows.filter(r=>rowErrors(r,sheet.columns).length).length;$('score').textContent=errors?`${errors} row${errors===1?'':'s'} need marks checked`:s.count?`${s.obtained} / ${s.total} marks · ${s.count} question${s.count===1?'':'s'} with marks`:'Add your marks to see the total';}
function cellControl(row,col,review=false){
  const v=row.cells[col.id]||'',label=`${col.label}, row ${review?reviewRows.indexOf(row)+1:sheet.rows.indexOf(row)+1}`;
  if(col.type==='choice'){
    const options=[...(col.options||[])];if(v&&!options.includes(v))options.push(v);
    return `<select aria-label="Choose ${e(label)}" data-cell="${e(col.id)}"><option value="">Choose a mistake…</option>${options.map(o=>`<option ${o===v?'selected':''} value="${e(o)}">${e(o)}</option>`).join('')}</select><input aria-label="Custom ${e(label)}" data-cell="${e(col.id)}" value="${e(v)}" maxlength="4000" placeholder="Or type your own">`;
  }
  return col.type==='number'||col.role==='question'?`<input data-cell="${e(col.id)}" aria-label="${e(label)}" value="${e(v)}" ${col.type==='number'?'inputmode="decimal"':''} maxlength="4000" placeholder="—">`:`<textarea data-cell="${e(col.id)}" aria-label="${e(label)}" maxlength="4000" placeholder="${col.role==='improve'?'My next step…':'Write here…'}">${e(v)}</textarea>`;
}
function renderSheet(){
  for(const id of ['title','student','className','date'])$(id).value=sheet[id];
  const columns=sheet.columns.filter(c=>c.visible),sum=columns.reduce((n,c)=>n+c.width,0);
  $('table-cols').innerHTML=columns.map(c=>`<col style="width:${c.width/sum*91}%">`).join('')+'<col style="width:85px">';
  $('table-head').innerHTML=`<tr>${columns.map(c=>`<th scope="col">${e(c.label)}</th>`).join('')}<th scope="col">Rows</th></tr>`;
  $('table-body').innerHTML=sheet.rows.map((r,i)=>`<tr data-row="${r.id}" class="${rowErrors(r,sheet.columns).length?'error-row':''}">${columns.map(c=>`<td>${cellControl(r,c)}</td>`).join('')}<td><div class="row-actions"><button class="icon-button" data-action="up" aria-label="Move row ${i+1} up" ${i===0?'disabled':''}>↑</button><button class="icon-button" data-action="down" aria-label="Move row ${i+1} down" ${i===sheet.rows.length-1?'disabled':''}>↓</button><button class="icon-button" data-action="duplicate" aria-label="Duplicate row ${i+1}">⧉</button><button class="icon-button" data-action="delete" aria-label="Delete row ${i+1}">×</button></div><div class="row-error">${rowErrors(r,sheet.columns).map(e).join(' ')}</div></td></tr>`).join('');
  renderScore();
  renderSources();
}
function renderSources(){
  $('source-list')?.remove();if(!sheet.sources.length)return;
  const details=document.createElement('details');details.id='source-list';details.className='guide';details.style.margin='18px 24px';
  details.innerHTML=`<summary>Original scans (${sheet.sources.length})</summary>${sheet.sources.map((s,i)=>`<button class="text-button" data-source="${i}">${e(s.name||`Scan ${i+1}`)}</button>`).join('')}`;
  details.onclick=async ev=>{const b=ev.target.closest('[data-source]');if(!b)return;try{const api=await requireCloud();const token=epoch;const blob=await api.getScan(sheet.sources[Number(b.dataset.source)],account.uid);if(token!==epoch)return;download(blob,sheet.sources[Number(b.dataset.source)].name||'reflection-scan');}catch(error){showError(error);}};
  document.querySelector('.worksheet').append(details);
}
function editCell(event,isReview=false){
  const input=event.target.closest('[data-cell]');if(!input)return;
  const tr=input.closest('[data-row]'),rows=isReview?reviewRows:sheet.rows,row=rows.find(r=>r.id===tr.dataset.row),cols=isReview?reviewColumns:sheet.columns;
  if(!row)return;row.cells[input.dataset.cell]=input.value;
  if(input.tagName==='SELECT')tr.querySelector(`input[data-cell="${input.dataset.cell}"]`).value=input.value;
  if(input.tagName==='INPUT'){
    const select=tr.querySelector(`select[data-cell="${input.dataset.cell}"]`);
    if(select){if(input.value&&![...select.options].some(o=>o.value===input.value))select.add(new Option(input.value,input.value));select.value=input.value;}
  }
  const errors=rowErrors(row,cols);tr.classList.toggle('error-row',!!errors.length);tr.querySelector('.row-error').textContent=errors.join(' ');
  if(!isReview){$('hint').textContent=HINTS[input.value]||'';changed();}
}
$('table-body').addEventListener('input',ev=>editCell(ev));
$('table-body').addEventListener('click',event=>{
  const b=event.target.closest('[data-action]');if(!b)return;
  const index=sheet.rows.findIndex(r=>r.id===b.closest('[data-row]').dataset.row),r=sheet.rows[index];
  if(b.dataset.action==='delete'){if(Object.values(r.cells).some(Boolean)&&!confirm('Delete this question and its reflection?'))return;sheet.rows.splice(index,1);}
  if(b.dataset.action==='duplicate'){if(sheet.rows.length>=300)return notice('Start a new sheet after 300 rows.',true);sheet.rows.splice(index+1,0,{id:uid(),cells:{...r.cells}});}
  if(b.dataset.action==='up')moveItem(sheet.rows,index,-1);
  if(b.dataset.action==='down')moveItem(sheet.rows,index,1);
  changed(true);
});
for(const id of ['title','student','className','date'])$(id).addEventListener('input',()=>{sheet[id]=$(id).value;changed();});
$('add-row').onclick=()=>{if(sheet.rows.length>=300)return notice('Start a new sheet after 300 rows.',true);sheet.rows.push(blankRow(sheet.columns));changed(true);$('table-body').lastElementChild?.querySelector('input,textarea,select')?.focus();};

function renderCustom(){
  $('column-editor').innerHTML=sheet.columns.map((c,i)=>`<section class="column-card" data-column="${c.id}"><label>Column heading<input data-field="label" value="${e(c.label)}" maxlength="120"></label><label>Answer type<select data-field="type">${['text','number','choice'].map(t=>`<option value="${t}" ${c.type===t?'selected':''}>${{text:'Written answer',number:'Number',choice:'Choices + own text'}[t]}</option>`).join('')}</select></label><label>Width<input data-field="width" type="number" min="5" max="60" value="${c.width}"></label><label class="check-label"><input data-field="visible" type="checkbox" ${c.visible?'checked':''}>Show column</label><div class="column-buttons"><button data-column-action="up" class="icon-button" aria-label="Move ${e(c.label)} left" ${i===0?'disabled':''}>←</button><button data-column-action="down" class="icon-button" aria-label="Move ${e(c.label)} right" ${i===sheet.columns.length-1?'disabled':''}>→</button><button data-column-action="delete" class="icon-button" aria-label="Delete ${e(c.label)}">×</button></div>${c.type==='choice'?`<label class="column-options">Choices (one per line)<textarea data-field="options" rows="3">${e((c.options||[]).join('\n'))}</textarea></label>`:''}</section>`).join('');
  for(const key of ['orientation','blankRows','rowHeight','fontSize'])$(key).value=sheet.settings[key];
}
$('customise').onclick=()=>{renderCustom();$('custom-dialog').showModal();};
$('column-editor').onchange=event=>{
  const input=event.target.closest('[data-field]');if(!input)return;
  const c=sheet.columns.find(c=>c.id===input.closest('[data-column]').dataset.column),key=input.dataset.field;
  if(key==='visible'&&!input.checked&&sheet.columns.filter(c=>c.visible).length===1){input.checked=true;return alert('Keep at least one column visible.');}
  c[key]=key==='visible'?input.checked:key==='width'?Math.min(60,Math.max(5,Number(input.value)||20)):key==='options'?input.value.split('\n').map(s=>s.trim()).filter(Boolean).slice(0,40):input.value||'Untitled column';
  changed(true);renderCustom();
};
$('column-editor').onclick=event=>{
  const button=event.target.closest('[data-column-action]');if(!button)return;
  const index=sheet.columns.findIndex(c=>c.id===button.closest('[data-column]').dataset.column),col=sheet.columns[index];
  if(button.dataset.columnAction==='delete'){
    if(sheet.columns.length===1)return alert('Keep at least one column.');
    if(!confirm(`Delete “${col.label}” and all its answers? You can hide the column instead to keep the answers.`))return;
    sheet.columns.splice(index,1);sheet.rows.forEach(r=>delete r.cells[col.id]);if(!sheet.columns.some(c=>c.visible))sheet.columns[0].visible=true;
  }else moveItem(sheet.columns,index,button.dataset.columnAction==='up'?-1:1);
  changed(true);renderCustom();
};
$('add-column').onclick=()=>{if(sheet.columns.length>=15)return alert('You can have up to 15 columns.');const col={id:uid(),label:'New column',type:'text',role:'custom',width:20,visible:true,options:[]};sheet.columns.push(col);sheet.rows.forEach(r=>r.cells[col.id]='');changed(true);renderCustom();};
for(const key of ['orientation','blankRows','rowHeight','fontSize'])$(key).onchange=()=>{
  sheet.settings[key]=key==='orientation'?$(key).value:Number($(key).value);
  sheet.settings=normaliseSheet(sheet).settings;changed();$(key).value=sheet.settings[key];
};
$('reset-columns').onclick=()=>{if(!confirm('Restore the five original columns? Answers in custom columns will be removed.'))return;sheet.columns=structuredClone(DEFAULT_COLUMNS);sheet.rows=sheet.rows.map(r=>({id:r.id,cells:Object.fromEntries(sheet.columns.map(c=>[c.id,r.cells[c.id]||'']))}));changed(true);renderCustom();};
async function printSheet(blank){
  if(!sheet.title.trim())sheet.title='Science reflection';
  $('page-style').textContent=`@page{size:A4 ${sheet.settings.orientation};margin:12mm}`;
  $('print-area').style.setProperty('--print-size',`${sheet.settings.fontSize}pt`);$('print-area').innerHTML=printable(sheet,blank);
  const img=$('print-area').querySelector('img');try{await img.decode();}catch{notice('The logo could not load. Check your connection before printing.',true);return;}
  window.print();
}
$('print-blank').onclick=()=>printSheet(true);$('print-filled').onclick=()=>printSheet(false);
window.addEventListener('beforeprint',()=>{
  $('page-style').textContent=`@page{size:A4 ${sheet.settings.orientation};margin:12mm}`;
  $('print-area').style.setProperty('--print-size',`${sheet.settings.fontSize}pt`);
  if(!$('print-area').innerHTML)$('print-area').innerHTML=printable(sheet,false);
});
window.addEventListener('afterprint',()=>{$('print-area').innerHTML='';});
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[\/\\]/g,'-');a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
$('export').onclick=()=>download(new Blob([JSON.stringify(sheet,null,2)],{type:'application/json'}),`${sheet.title||'science-reflection'}.json`);
$('import').onclick=()=>$('import-file').click();
$('import-file').onchange=async event=>{const file=event.target.files[0];event.target.value='';if(!file)return;const token=epoch;try{if(file.size>100*1024*1024)throw new Error('Choose a reflection backup smaller than 100 MB.');const next=normaliseSheet(JSON.parse(await file.text()));if(token!==epoch)return;if(!confirm('Open this backup in place of the current sheet? Download your current sheet first if you need a copy.'))return;next.id=uid();next.sources=[];replaceSheet(next);notice('Backup opened as a new sheet.');}catch(error){showError(error);}};
$('new-sheet').onclick=()=>{if(!confirm('Start a new sheet? Save online or download a backup first if you need the current sheet.'))return;replaceSheet(newSheet());notice('New reflection sheet ready.');};

async function requireCloud(){if(!authReady)throw new Error('Google sign-in is still loading. Please try again in a moment.');if(!cloud)throw new Error('Online services could not load. Check your connection and reload the page.');if(!account)throw new Error('Sign in with Google first. Your current draft will stay here.');return cloud;}
function showError(error){notice(cloud?.friendlyError(error)||String(error.message||error).slice(0,350),true);}
$('login').onclick=async()=>{if(!cloud){notice('Online services are loading. If this persists, check your connection and reload.',true);return;}try{await cloud.login();}catch(error){if(!['auth/popup-closed-by-user','auth/cancelled-popup-request'].includes(error.code))showError(error);}};
$('logout').onclick=async()=>{try{await cloud.logout();}catch(error){showError(error);}};
$('save').onclick=async()=>{
  let token,rev;
  try{
    const api=await requireCloud();token=epoch;rev=revision;const user=account.uid,snapshot=structuredClone(sheet);
    if(snapshot.rows.some(r=>rowErrors(r,snapshot.columns).length))throw new Error('Check the highlighted marks before saving online. Your draft is kept on this device.');
    $('save').disabled=true;$('save-status').textContent='Saving online…';
    await api.saveSheet(snapshot,user);
    if(token!==epoch)return;
    if(revision===rev){dirty=false;$('save-status').textContent='Saved online';notice('Your reflection sheet is saved online.');}
    else{$('save-status').textContent='New edits on this device · save again to sync';notice('Saved the earlier version. Save again to include your latest edits.');}
  }catch(error){if(token===undefined||token===epoch){writeDraft();showError(error);}}finally{$('save').disabled=false;}
};
async function savedSheets(){
  $('saved-list').textContent='Loading…';let token;
  try{const api=await requireCloud();token=epoch;const items=await api.listSheets(account.uid);if(token!==epoch)return;
    $('saved-list').innerHTML=items.length?items.map(s=>`<div class="saved-item"><div><strong>${e(s.title)}</strong><small>${e(s.student)} ${e(s.date)}</small></div><button class="button" data-open="${e(s.id)}">Open</button></div>`).join(''):'<p>No online sheets yet. Save your first reflection to see it here.</p>';
  }catch(error){if(token===undefined||token===epoch)$('saved-list').textContent=cloud?.friendlyError(error)||error.message;}
}
$('sheets').onclick=()=>{$('saved-dialog').showModal();savedSheets();};$('refresh-sheets').onclick=savedSheets;
$('saved-list').onclick=async event=>{
  const button=event.target.closest('[data-open]');if(!button)return;let token;
  try{const api=await requireCloud();token=epoch;const rev=revision;button.disabled=true;const raw=await api.loadSheet(button.dataset.open,account.uid);if(token!==epoch)return;const next=normaliseSheet(raw);
    if(!confirm('Open the saved sheet and replace this device’s current draft? Download a backup first if you need it.'))return;
    replaceSheet(next);$('saved-dialog').close();$('save-status').textContent='Opened from online storage';notice('Saved sheet opened.');
  }catch(error){if(token===undefined||token===epoch)showError(error);}finally{button.disabled=false;}
};

function clearScan(){scanRun++;scanBusy=false;scanFiles.forEach(f=>URL.revokeObjectURL(f.url));scanFiles=[];reviewRows=[];reviewSources=[];reviewColumns=[];reviewSheetId=null;$('scan-review').hidden=true;$('scan-files-list').innerHTML='';$('scan-status').textContent='';$('read-scan').disabled=false;}
$('scan').onclick=()=>{$('scan-dialog').showModal();};
$('scan-dialog').addEventListener('cancel',event=>{if(scanBusy&&!confirm('Stop waiting for this scan? Your existing reflection will stay unchanged.'))event.preventDefault();});
$('scan-dialog').addEventListener('close',()=>clearScan());
$('close-scan').onclick=event=>{if((scanBusy||reviewRows.length)&&!confirm('Close this scan and discard any unadded readings? Your existing reflection will stay unchanged.'))event.preventDefault();};
function renderFiles(){
  $('scan-files-list').innerHTML=scanFiles.map((f,i)=>`<div class="scan-file">${f.file.type.startsWith('image/')?`<img src="${f.url}" alt="Page ${i+1} preview">`:'<span>PDF</span>'}<span>${i+1}. ${e(f.file.name)}<br><small>${Math.ceil(f.file.size/1024)} KB</small></span><button class="icon-button" data-file-up="${i}" aria-label="Move file ${i+1} earlier" ${i===0?'disabled':''}>↑</button><button class="icon-button" data-file-remove="${i}" aria-label="Remove file ${i+1}">×</button></div>`).join('');
}
function addFiles(files){
  if(scanBusy)return alert('Wait for the current reading before adding files.');
  for(const file of files){if(scanFiles.length>=10){alert('You can scan up to 10 files at a time.');break;}if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(file.type)){alert(`${file.name}: use JPG, PNG, WebP or PDF. On an iPhone, choose a compatible photo format.`);continue;}if(file.size>10*1024*1024||!file.size){alert(`${file.name}: choose a non-empty file up to 10 MB.`);continue;}scanFiles.push({id:uid(),file,url:URL.createObjectURL(file)});}
  renderFiles();
}
for(const id of ['scan-files','camera-file'])$(id).onchange=event=>{addFiles(event.target.files);event.target.value='';};
$('scan-files-list').onclick=event=>{if(scanBusy)return;const remove=event.target.closest('[data-file-remove]'),up=event.target.closest('[data-file-up]');if(remove){const index=Number(remove.dataset.fileRemove);URL.revokeObjectURL(scanFiles[index].url);scanFiles.splice(index,1);}if(up)moveItem(scanFiles,Number(up.dataset.fileUp),-1);renderFiles();};
const fileMedia=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({mimeType:file.type,data:String(reader.result).split(',')[1]});reader.onerror=()=>reject(new Error('This file could not be opened.'));reader.readAsDataURL(file);});
$('read-scan').onclick=async()=>{
  let token,run;
  try{
    const api=await requireCloud();if(!scanFiles.length)throw new Error('Choose a photo or PDF first.');
    if(reviewRows.length&&!confirm('Read these files again and replace the current scan review, including your corrections?'))return;
    token=epoch;run=++scanRun;const owner=account.uid,files=[...scanFiles];reviewColumns=structuredClone(sheet.columns);reviewSheetId=sheet.id;reviewRows=[];reviewSources=[];scanBusy=true;$('read-scan').disabled=true;$('scan-review').hidden=true;
    let uploadFailures=0,readFailures=0;
    for(let i=0;i<files.length;i++){
      $('scan-status').textContent=`Reading file ${i+1} of ${files.length}…`;
      try{const media=await fileMedia(files[i].file);if(run!==scanRun||token!==epoch)return;
        const text=await api.transcribe(media,reviewColumns,owner);if(run!==scanRun||token!==epoch)return;
        const rows=parseScan(text,reviewColumns);rows.forEach(r=>r.note=[`File ${i+1}: ${files[i].file.name}`,r.note].filter(Boolean).join(' · '));reviewRows.push(...rows);
        if(rows.length){try{const source=await api.uploadScan(files[i].file,owner);if(run!==scanRun||token!==epoch)return;reviewSources.push(source);}catch{if(run!==scanRun||token!==epoch)return;uploadFailures++;}}
      }catch(error){if(run!==scanRun||token!==epoch)return;readFailures++;$('scan-status').textContent=`Could not read ${files[i].file.name}. Continuing…`;}
    }
    if(run!==scanRun||token!==epoch)return;
    if(!reviewRows.length)throw new Error('No reflection rows could be read. Check that the table and handwriting are clear, then try again.');
    renderReview();$('scan-review').hidden=false;
    $('scan-status').textContent=`${reviewRows.length} row${reviewRows.length===1?'':'s'} ready to check.${readFailures?` ${readFailures} file(s) could not be read; retry those files separately.`:''}${uploadFailures?' Original scans could not be saved online. The text is ready to review; keep the originals.':''}`;
  }catch(error){if(run===undefined||run===scanRun)$('scan-status').textContent=cloud?.friendlyError(error)||error.message;}
  finally{if(run===undefined||run===scanRun){scanBusy=false;$('read-scan').disabled=false;}}
};
function renderReview(){
  $('review-table').innerHTML=`<thead><tr>${reviewColumns.map(c=>`<th>${e(c.label)}</th>`).join('')}<th>Check</th></tr></thead><tbody>${reviewRows.map(r=>`<tr data-row="${r.id}">${reviewColumns.map(c=>`<td>${cellControl(r,c,true)}</td>`).join('')}<td><button class="text-button" data-review-remove="${r.id}">Remove</button><p class="review-note">${e(r.note)}</p><div class="row-error">${rowErrors(r,reviewColumns).map(e).join(' ')}</div></td></tr>`).join('')}</tbody>`;
}
$('review-table').oninput=event=>editCell(event,true);
$('review-table').onclick=event=>{const b=event.target.closest('[data-review-remove]');if(b){reviewRows=reviewRows.filter(r=>r.id!==b.dataset.reviewRemove);renderReview();}};
$('accept-scan').onclick=()=>{
  if(!reviewRows.length)return alert('There are no rows to add.');
  if(reviewSheetId!==sheet.id||JSON.stringify(reviewColumns)!==JSON.stringify(sheet.columns))return alert('The sheet or its columns changed. Read the files again for the current table.');
  if(reviewRows.some(r=>rowErrors(r,reviewColumns).length))return alert('Correct the highlighted marks before adding these rows.');
  if(sheet.rows.length+reviewRows.length>300)return alert('These rows would exceed 300. Use a new sheet.');
  const count=reviewRows.length;
  sheet.rows=sheet.rows.filter(r=>Object.values(r.cells).some(v=>v.trim()));
  sheet.rows.push(...reviewRows.map(r=>({id:uid(),cells:{...r.cells}})));
  sheet.sources=[...new Map([...sheet.sources,...reviewSources].map(s=>[s.path,s])).values()];
  changed(true);$('scan-dialog').close();notice(`${count} reviewed row${count===1?'':'s'} added. Save online when you are ready.`);
};
function authChanged(user){
  const previous=account?.uid||null,next=user?.uid||null;
  authReady=true;
  if(previous!==next){
    const guest=previous===null?sheet:null;
    epoch++;clearScan();for(const id of ['scan-dialog','saved-dialog','custom-dialog'])if($(id).open)$(id).close();
    account=user;
    const saved=readDraft(next);
    if(user)sheet=saved||guest||newSheet();else sheet=readDraft(null)||newSheet();
    revision++;dirty=false;writeDraft();renderSheet();
  }else account=user;
  $('account-name').textContent=user?(user.displayName||user.email||'Signed in'):'Work on this device';
  $('login').hidden=!!user;$('logout').hidden=!user;$('saved-list').innerHTML='';
}
window.addEventListener('beforeunload',event=>{if(scanBusy){event.preventDefault();event.returnValue='';}});
$('brand-logo').src=LOGO;
renderSheet();
import('./firebase.js').then(api=>{cloud=api;api.watchAuth(authChanged);}).catch(()=>{authReady=true;notice('Online services could not load. You can still edit, print and download a backup. Check your connection and reload to sign in.',true);});
