import test from 'node:test';
import assert from 'node:assert/strict';
import {groupWorkLog,toolSubject} from '../src/shared/work-log.mjs';
const item=(id,tool,status='completed',extra={})=>({id,kind:'tool',tool,status,title:tool,detail:'Completed',output:'',...extra});
test('consecutive tools group across categories but model/agent events preserve work boundaries',()=>{
 const rows=[item('one','tool.powershell'),item('two','tool.web_search'),{id:'thinking',kind:'model',status:'completed'},item('three','tool.edit_file'),item('four','tool.powershell')];
 const groups=groupWorkLog(rows);
 assert.deepEqual(groups.map(g=>g.id),['one','three']);assert.equal(groups[0].label,'Ran a command, searched the web');assert.equal(groups[1].label,'Edited a file, ran a command');
 assert.equal(groups.flatMap(g=>g.items).length,4);assert.ok(!JSON.stringify(groups).includes('thinking'));
 assert.equal(groupWorkLog([...rows,item('five','tool.powershell','working')])[1].id,'three');
});
test('live, failed, interrupted and unknown tools never appear as successful work',()=>{
 assert.equal(groupWorkLog([item('x','tool.powershell','working')])[0].status,'working');
 const failure=groupWorkLog([item('x','tool.powershell','failed')])[0];assert.equal(failure.status,'failed');assert.doesNotMatch(failure.label,/^Ran /);
 assert.equal(groupWorkLog([item('x','tool.read_file','waiting')])[0].status,'waiting');
 assert.equal(groupWorkLog([item('x','tool.read_file','interrupted')])[0].status,'interrupted');
 assert.match(groupWorkLog([item('x','mcp__unknown__thing')])[0].label,/Used a tool/);
});
test('shell details join only an exact native call ID; old unbound results stay a separate group',()=>{
 const result={callId:'call-two',runId:'run',command:'npm test',output:'Passed',exitCode:0,terminalStatus:'completed'};
 const groups=groupWorkLog([item('one','tool.powershell','completed',{callId:'call-one'}),item('two','tool.powershell','completed',{callId:'call-two'})],[result]);
 assert.equal(groups[0].items[0].subject,'');assert.equal(groups[0].items[1].subject,'npm test');assert.equal(groups[0].items[1].shellResult.output,'Passed');assert.equal(groups.length,1);
 const old=groupWorkLog([item('one','tool.powershell')],[result]);assert.equal(old.length,2);assert.equal(old[0].items[0].subject,'');assert.equal(old[1].items[0].subject,'npm test');
 const unrelated=groupWorkLog([item('read','tool.read_file','completed',{callId:result.callId})],[result]);assert.equal(unrelated[0].items[0].subject,'');assert.equal(unrelated.length,2);
 const failed=groupWorkLog([item('two','tool.powershell','completed',{callId:result.callId})],[{...result,exitCode:1}]);assert.equal(failed[0].status,'failed');
});
test('argument projection retains only known display fields, without secrets or large input bodies',()=>{
 assert.equal(toolSubject('powershell',JSON.stringify({command:'git status',env:{TOKEN:'private'}})),'git status');
 assert.equal(toolSubject('read_file',JSON.stringify({path:'src/app.ts',content:'private'})),'src/app.ts');
 assert.equal(toolSubject('web_search',JSON.stringify({query:'release notes'})),'release notes');
 assert.equal(toolSubject('mcp__unknown__tool','{"token":"private"}'),'');assert.equal(toolSubject('powershell','{bad'), '');
 assert.equal(toolSubject('web_fetch','{"url":"https://secret:password@example.com"}'),'');
 assert.ok(toolSubject('powershell',JSON.stringify({command:'a'.repeat(8000)})).length<=1200);
});
