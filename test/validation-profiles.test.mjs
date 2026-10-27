import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCheckScripts,missingChecks,checkDiagnostics} from '../src/shared/validation.mjs';
test('profiles accept bounded package scripts and reject shell strings',()=>{
 assert.deepEqual(validateCheckScripts(['lint','test:unit']),['lint','test:unit']);
 for(const value of [[],['test','test'],['test && echo unsafe'],Array(9).fill('a'),null])assert.throws(()=>validateCheckScripts(value));
});
test('gates require successful receipts at the exact revision',()=>{
 const task={checkReceipts:[{script:'test',revision:'a',status:'passed'},{script:'lint',revision:'b',status:'failed'}]};
 assert.deepEqual(missingChecks(task,'a',['test','lint']),['lint']);assert.deepEqual(missingChecks(task,'b',['test']),['test']);
 task.check={script:'test',revision:'a',status:'running'};assert.deepEqual(missingChecks(task,'a',['test']),['test']);delete task.check;
 task.checkReceipts.push({script:'test',revision:'a',status:'failed'});assert.deepEqual(missingChecks(task,'a',['test']),['test']);
});
test('compiler diagnostics preserve coordinates and reject outside workspace paths',()=>{
 const rows=checkDiagnostics('src/app.ts(12,3): error TS2322: Wrong type\n../secret.ts(1,1): error TS1: no\nC:\\secret.ts(2,1): error TS1: no\nsrc/ui.ts:9:2: warning: unused');
 assert.deepEqual(rows.map(d=>[d.path,d.line,d.column,d.severity]),[['src/app.ts',12,3,'error'],['src/ui.ts',9,2,'warning']]);
});
