export const MISTAKES = ['Science concept', 'Scientific word', 'Missing key point', 'Evidence or data', 'Explanation link', 'Did not answer the question', 'Comparison', 'Careless omission', 'Other'];
export const HINTS = {
  'Science concept': 'Which science idea should I revise?',
  'Scientific word': 'Which scientific word should I use correctly?',
  'Missing key point': 'Which important point was missing from my answer?',
  'Evidence or data': 'If results are given, which observation supports my answer?',
  'Explanation link': 'How does the science idea explain what happened?',
  'Did not answer the question': 'Which words tell me what to explain?',
  'Comparison': 'Which two things should I compare, and how?',
  'Careless omission': 'What should I check before submitting my answer?'
};
export const uid = () => globalThis.crypto.randomUUID();
export const DEFAULT_COLUMNS = [
  {id:'question', label:'Question No.', type:'text', role:'question', width:12, visible:true},
  {id:'obtained', label:'Marks obtained', type:'number', role:'obtained', width:12, visible:true},
  {id:'total', label:'Total marks', type:'number', role:'total', width:11, visible:true},
  {id:'mistake', label:'Mistake type', type:'choice', role:'mistake', width:24, visible:true, options:MISTAKES},
  {id:'improve', label:'What should I do to improve?', type:'text', role:'improve', width:41, visible:true}
];
export const blankRow = (columns) => ({id:uid(), cells:Object.fromEntries(columns.map(c=>[c.id,'']))});
export function newSheet() {
  const columns=structuredClone(DEFAULT_COLUMNS);
  return {version:1,id:uid(),title:'Science reflection',student:'',className:'',date:new Date().toLocaleDateString('en-CA'),columns,
    rows:Array.from({length:5},()=>blankRow(columns)),settings:{orientation:'landscape',rowHeight:28,fontSize:11,blankRows:6},sources:[],updatedAt:Date.now()};
}
const clean = (value,max=4000) => typeof value==='string' || typeof value==='number' ? String(value).slice(0,max) : '';
export function normaliseSheet(raw) {
  if(!raw || raw.version!==1 || !Array.isArray(raw.columns) || !raw.columns.length || raw.columns.length>15 || !Array.isArray(raw.rows) || raw.rows.length>300) throw new Error('This file is not a valid reflection sheet (up to 15 columns and 300 rows).');
  const ids=new Set();
  const columns=raw.columns.map((c,i)=>{
    if(!c || typeof c.id!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(c.id) || ids.has(c.id) || ['__proto__','constructor','prototype'].includes(c.id)) throw new Error('Invalid or duplicate column ID.');
    ids.add(c.id);
    return {id:c.id,label:clean(c.label,120)||`Column ${i+1}`,type:['text','number','choice'].includes(c.type)?c.type:'text',role:['question','obtained','total','mistake','improve'].includes(c.role)?c.role:'custom',width:Math.max(5,Math.min(60,Number(c.width)||20)),visible:c.visible!==false,options:Array.isArray(c.options)?c.options.slice(0,40).map(v=>clean(v,100)).filter(Boolean):[]};
  });
  if(!columns.some(c=>c.visible)) columns[0].visible=true;
  const rows=raw.rows.map(r=>({id:uid(),cells:Object.fromEntries(columns.map(c=>[c.id,clean(r?.cells?.[c.id])]))}));
  const s=raw.settings||{};
  return {version:1,id:/^[a-zA-Z0-9_-]{1,80}$/.test(raw.id)?raw.id:uid(),title:clean(raw.title,160)||'Science reflection',student:clean(raw.student,120),className:clean(raw.className,80),date:clean(raw.date,30),columns,rows,
    settings:{orientation:s.orientation==='portrait'?'portrait':'landscape',rowHeight:Math.max(16,Math.min(48,Number(s.rowHeight)||28)),fontSize:Math.max(9,Math.min(16,Number(s.fontSize)||11)),blankRows:Math.max(1,Math.min(60,Math.round(Number(s.blankRows)||6)))},
    sources:Array.isArray(raw.sources)?raw.sources.filter(s=>s && typeof s.path==='string').slice(0,100).map(s=>({path:clean(s.path,500),name:clean(s.name,200)})):[],updatedAt:Number(raw.updatedAt)||Date.now()};
}
export function moveItem(items,index,offset) {
  const next=index+offset;
  if(index<0||index>=items.length||next<0||next>=items.length) return;
  [items[index],items[next]]=[items[next],items[index]];
}
export function rowErrors(row,columns) {
  const errors=[];
  for(const c of columns.filter(c=>c.type==='number'||['obtained','total'].includes(c.role))) {
    const v=row.cells[c.id]?.trim();
    if(v && (!Number.isFinite(Number(v)) || Number(v)<0)) errors.push(`${c.label}: enter a number of zero or more.`);
  }
  const o=columns.find(c=>c.role==='obtained'),t=columns.find(c=>c.role==='total');
  if(o&&t&&row.cells[o.id]?.trim()&&row.cells[t.id]?.trim()&&Number(row.cells[o.id])>Number(row.cells[t.id])) errors.push('Marks obtained exceed total marks.');
  return errors;
}
export function totals(sheet) {
  const o=sheet.columns.find(c=>c.role==='obtained'),t=sheet.columns.find(c=>c.role==='total');
  let obtained=0,total=0,count=0;
  if(o&&t) sheet.rows.forEach(r=>{if(r.cells[o.id]?.trim()&&r.cells[t.id]?.trim()&&!rowErrors(r,sheet.columns).length){obtained+=Number(r.cells[o.id]);total+=Number(r.cells[t.id]);count++;}});
  return {obtained,total,count};
}
export function parseScan(text,columns) {
  let raw;
  try {raw=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));} catch {throw new Error('The scan could not be read reliably. Try a clearer photo.');}
  if(!raw || !Array.isArray(raw.rows) || raw.rows.length>100) throw new Error('The scan did not return a usable reflection table.');
  return raw.rows.filter(r=>r&&r.cells&&typeof r.cells==='object'&&!Array.isArray(r.cells)).map(r=>({id:uid(),cells:Object.fromEntries(columns.map(c=>[c.id,clean(r.cells[c.id])])),note:clean(r.note,600)})).filter(r=>Object.values(r.cells).some(v=>v.trim()));
}
export const escapeHTML = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function printable(sheet,blank=false) {
  const columns=sheet.columns.filter(c=>c.visible),sum=columns.reduce((n,c)=>n+c.width,0);
  const rows=blank?Array.from({length:sheet.settings.blankRows},()=>blankRow(columns)):sheet.rows;
  const e=escapeHTML;
  return `<header class="paper-header"><img src="${LOGO}" alt="Polymath Learning Centre"><div><p>POLYMATH LEARNING CENTRE</p><h1>${e(sheet.title)}</h1><p>Science · Open-ended question reflection</p></div></header><div class="paper-details"><span>Name: ${blank?'________________________':e(sheet.student)||'________________________'}</span><span>Class: ${blank?'____________':e(sheet.className)||'____________'}</span><span>Date: ${blank?'____________':e(sheet.date)||'____________'}</span></div><table class="print-table"><colgroup>${columns.map(c=>`<col style="width:${c.width/sum*100}%">`).join('')}</colgroup><thead><tr>${columns.map(c=>`<th>${e(c.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${columns.map(c=>`<td style="height:${sheet.settings.rowHeight}mm">${e(r.cells[c.id]||'').replace(/\n/g,'<br>')}</td>`).join('')}</tr>`).join('')}</tbody></table><footer class="paper-footer">Polymath Learning Centre · Science reflection</footer>`;
}
export const LOGO='https://dl.dropboxusercontent.com/scl/fi/h40yjlyg8ldefwfaa3dib/polymath-logo-sticker.png?rlkey=o1ra4taqy79gt9t8u096v82zj';
