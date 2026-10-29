import assert from 'node:assert/strict';
import test from 'node:test';
import {replyClipboard} from '../src/shared/reply-copy.mjs';

test('reply copy preserves exact Markdown and structured rich formatting',()=>{
 const text='# A heading\n\nA **bold** and *italic* reply.\n\n- First\n- Second\n\n> Quoted\n\n```js\nconst a = "<hello>";\n```\n\n| Name | Value |\n| --- | --- |\n| one | 2 |\n\n[Guide](https://example.com/guide?q=a&b=c)';
 const value=replyClipboard(text);assert.equal(value.text,text);
 for(const tag of ['h1','strong','em','ul','li','blockquote','pre','code','table','th','td','a'])assert.match(value.html,new RegExp('<'+tag+'(?:>| )'));
 assert.match(value.html,/const a = &quot;&lt;hello&gt;&quot;;/);assert.match(value.html,/href="https:\/\/example.com\/guide\?q=a&amp;b=c"/);
});
test('rich reply excludes active markup, remote images and unsafe links',()=>{
 const value=replyClipboard('<script>alert(1)</script>\n\n<img src="https://example.com/pixel" onerror="alert(1)">\n\n![Diagram](https://example.com/pixel)\n\n[bad](javascript:alert(1)) [file](file:///secret) [local](/secret) [auth](https://user:secret@example.com/) [mail](mailto:help@example.com)\n\n- [x] Finished');
 assert.doesNotMatch(value.html,/<(?:script|img|input|button|iframe|style)\b|onerror=|src=|javascript:|file:\/\/|user:secret/);
 assert.match(value.html,/Diagram/);assert.match(value.html,/href="mailto:help@example.com"/);assert.match(value.html,/\[x\]/);
});
test('clipboard serialization is bounded and never coerces objects',()=>{
 for(const value of [null,{},[],123,'a'.repeat(100001)])assert.throws(()=>replyClipboard(value),/Invalid clipboard text/);
 assert.equal(replyClipboard('').text,'');assert.equal(replyClipboard('a'.repeat(100000)).text.length,100000);
});
