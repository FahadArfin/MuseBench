import test from 'node:test';
import assert from 'node:assert/strict';
const api=await import('../src/shared/workspace-analysis.mjs').catch(e=>{if(e.code==='ERR_MODULE_NOT_FOUND')return{};throw e;});
const query={operation:'hover',path:'main.ts',line:1,column:1};

test('analysis discovery is explicit and preserves the four-operation default',()=>{
 assert.equal(typeof api.workspaceOperations,'function');
 assert.deepEqual(api.workspaceOperations().map(x=>x.name),['definition','references','implementation','hover']);
 assert.equal(api.workspaceOperations('analysis-v1').length,7);
 assert.deepEqual(api.workspaceOperations('analysis-v1','syntax').map(x=>x.name),['syntax_diagnostics']);
 assert.throws(()=>api.normalizeWorkspaceToolset('auto'));
 assert.equal(api.normalizeWorkspaceToolset(), 'navigation-v1');
});
test('operation arguments are exact and never widen source authority',()=>{
 assert.equal(typeof api.validateWorkspaceQuery,'function');
 assert.deepEqual(api.validateWorkspaceQuery(query),query);
 for(const input of [{...query,root:'elsewhere'},{...query,path:'../private.ts'},{...query,path:'node_modules/private.ts'},{...query,operation:'execute'},{operation:'workspace_symbols',query:'x',command:'run'},{operation:'syntax_diagnostics',path:'notes.txt'},{operation:'document_symbols',path:'a.ts',line:1},{operation:'workspace_symbols',query:'x'.repeat(101)}])assert.throws(()=>api.validateWorkspaceQuery(input));
 assert.throws(()=>api.validateWorkspaceQuery({operation:'workspace_symbols',query:'x'},'navigation-v1'));
});
test('batches require unique bounded IDs and validate every call before dispatch',()=>{
 assert.equal(typeof api.validateWorkspaceBatch,'function');
 assert.deepEqual(api.validateWorkspaceBatch([{id:'a',...query}]),[{id:'a',...query}]);
 for(const calls of [[],Array.from({length:9},(_,i)=>({id:String(i),...query})),[{id:'a',...query},{id:'a',...query}],[{id:'a',...query},{id:'b',...query,path:'../private.ts'}],[{id:'bad id',...query}],[{id:'a',...query,arguments:{command:'run'}}]])assert.throws(()=>api.validateWorkspaceBatch(calls));
});
