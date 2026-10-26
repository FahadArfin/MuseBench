import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedExternal, trustedSender, validateAction } from '../electron/security.mjs';

test('only supported documentation and explicit search URLs are opened externally', () => {
  assert.equal(allowedExternal('https://dev.meta.ai/docs/muse-code'), true);
  for (const url of ['file:///C:/Windows', 'https://dev.meta.ai.evil.com/docs', 'javascript:alert(1)', 'https://dev.meta.ai@evil.com', 'https://dev.meta.ai:9999/']) assert.equal(allowedExternal(url), false);
});
test('privileged requests require exact main-frame identity and UI URL', () => {
  const frame = {url:'file:///app/dist/index.html'};
  const webContents = {mainFrame:frame};
  assert.equal(trustedSender({sender:webContents,senderFrame:frame},webContents,frame.url),true);
  assert.equal(trustedSender({sender:webContents,senderFrame:{url:frame.url}},webContents,frame.url),false);
  assert.equal(trustedSender({sender:webContents,senderFrame:frame},webContents,'file:///elsewhere.html'),false);
});
test('IPC rejects unknown and oversized actions before dispatch', () => {
  assert.deepEqual(validateAction({type:'refresh'}),{type:'refresh'});
  assert.deepEqual(validateAction({type:'createCommandCopy'}),{type:'createCommandCopy'});
  assert.throws(()=>validateAction({type:'execute',command:'whoami'}));
  assert.throws(()=>validateAction({type:'sendMessage',text:'x'.repeat(20001)}));
  assert.throws(()=>validateAction({type:'accept',revision:2}));
  assert.throws(()=>validateAction({type:'newTask',request:'hi',mode:'arbitrary'}));
});

test('web search only allows the exact HTTPS endpoint and one nonempty query',()=>{
 assert.equal(allowedExternal('https://www.google.com/search?q=hello%20world'),true);
 for(const url of ['https://www.google.com/url?q=https://evil.com','https://www.google.com/search?q=x&next=evil','https://www.google.com/search?q=','https://www.google.com/search?q=x&q=y','https://www.google.com.evil.com/search?q=x','http://www.google.com/search?q=x','https://user@www.google.com/search?q=x','https://www.google.com/search?q=x#other'])assert.equal(allowedExternal(url),false,url);
});
