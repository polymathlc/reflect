import test from 'node:test';
import assert from 'node:assert/strict';
import {newSheet,normaliseSheet,blankRow,moveItem,rowErrors,totals,parseScan,printable} from '../model.js';

test('custom columns and multiline reflections survive backup and reordering',()=>{
  const s=newSheet();s.columns.push({id:'topic',label:'Topic',type:'text',role:'custom',width:20,visible:false});
  s.rows[0].cells={question:'3(b)(ii)',obtained:'0.5',total:'2',mistake:'Scientific word',improve:'Use electrical conductors.\nCheck the term.',topic:'Electricity'};
  moveItem(s.rows,0,2);moveItem(s.columns,5,-3);
  const recovered=normaliseSheet(JSON.parse(JSON.stringify(s)));
  assert.equal(recovered.rows[2].cells.question,'3(b)(ii)');assert.equal(recovered.rows[2].cells.obtained,'0.5');assert.match(recovered.rows[2].cells.improve,/\n/);assert.equal(recovered.rows[2].cells.topic,'Electricity');assert.equal(recovered.columns[2].id,'topic');assert.equal(recovered.columns[2].visible,false);
});
test('marks distinguish missing values from zero and accept half marks',()=>{
  const s=newSheet();s.rows[0].cells.obtained='0';s.rows[0].cells.total='2';s.rows[1].cells.obtained='0.5';s.rows[1].cells.total='1';s.rows[2].cells.total='3';
  assert.deepEqual(totals(s),{obtained:0.5,total:3,count:2});assert.deepEqual(rowErrors(s.rows[0],s.columns),[]);
  s.rows[1].cells.obtained='2';assert.match(rowErrors(s.rows[1],s.columns)[0],/exceed/);
  s.rows[1].cells.obtained='-1';assert.match(rowErrors(s.rows[1],s.columns)[0],/zero or more/);
  s.rows[1].cells.obtained='unknown';assert.match(rowErrors(s.rows[1],s.columns)[0],/number/);
});
test('scoring roles stay numeric even if a column is changed to written answer',()=>{
  const s=newSheet();s.columns.find(c=>c.id==='obtained').type='text';s.rows[0].cells.obtained='unknown';s.rows[0].cells.total='2';
  assert.ok(rowErrors(s.rows[0],s.columns).length);assert.deepEqual(totals(s),{obtained:0,total:0,count:0});
});
test('blank printing never contains filled answers or pupil details',()=>{
  const s=newSheet();s.student='Private student';s.className='Private class';s.rows[0].cells.question='99(c)';s.rows[0].cells.improve='Secret filled reflection';s.settings.blankRows=9;
  const output=printable(s,true);
  assert.doesNotMatch(output,/Private student|Private class|Secret filled reflection|99\(c\)/);assert.match(output,/polymath-logo-sticker/);assert.match(output,/What should I do to improve/);
  assert.equal((output.match(/<tr>/g)||[]).length,10);
});
test('print respects visibility, proportions and escapes stored HTML',()=>{
  const s=newSheet();s.columns[1].visible=false;s.title='<script>alert(1)</script>';s.rows[0].cells.improve='<img src=x onerror=alert(1)>\nNext line';
  const output=printable(s,false);assert.doesNotMatch(output,/<script>|<img src=x|Marks obtained/);assert.match(output,/&lt;script&gt;/);assert.match(output,/<br>Next line/);assert.equal((output.match(/<col style/g)||[]).length,4);
});
test('scan preserves zero, custom fields, missing marks and uncertainty',()=>{
  const s=newSheet();s.columns.push({id:'topic',label:'Topic',role:'custom',type:'text',width:10,visible:true});
  const rows=parseScan('```json\n'+JSON.stringify({rows:[{cells:{question:'3(b)(ii)',obtained:0,total:'',improve:'Revise heat',topic:'Heat'},note:'Check the last word'},{cells:{}}]})+'\n```',s.columns);
  assert.equal(rows.length,1);assert.equal(rows[0].cells.obtained,'0');assert.equal(rows[0].cells.total,'');assert.equal(rows[0].cells.topic,'Heat');assert.equal(rows[0].note,'Check the last word');
});
test('malformed scan output is rejected rather than silently creating empty work',()=>{
  const columns=newSheet().columns;
  for(const text of ['not json','{"oops":[]}',JSON.stringify({rows:Array(101).fill({cells:{question:'1'}})})])assert.throws(()=>parseScan(text,columns));
});
test('one null scan row does not discard other legible rows',()=>{
  const rows=parseScan(JSON.stringify({rows:[{cells:null},{cells:{question:'2',obtained:'0'}}]}),newSheet().columns);
  assert.equal(rows.length,1);assert.equal(rows[0].cells.question,'2');
});
test('untrusted backups reject duplicate IDs, unsafe keys and excessive rows',()=>{
  let s=newSheet();s.columns[1].id=s.columns[0].id;assert.throws(()=>normaliseSheet(s));
  s=newSheet();s.columns[0].id='__proto__';assert.throws(()=>normaliseSheet(s));
  s=newSheet();s.columns[0].id=123;assert.throws(()=>normaliseSheet(s));
  s=newSheet();s.rows=Array.from({length:301},()=>blankRow(s.columns));assert.throws(()=>normaliseSheet(s));
});
test('print settings are bounded and at least one column remains visible',()=>{
  const s=newSheet();s.columns.forEach(c=>c.visible=false);s.settings={orientation:'injected',rowHeight:999,fontSize:-1,blankRows:0};
  const fixed=normaliseSheet(s);assert.ok(fixed.columns[0].visible);assert.equal(fixed.settings.orientation,'landscape');assert.equal(fixed.settings.rowHeight,48);assert.equal(fixed.settings.fontSize,9);assert.ok(fixed.settings.blankRows>0);
});
