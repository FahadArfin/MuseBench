import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionDetails } from '../src/ui/permissions.mjs';

const approval = { kind:'approval',toolName:'shell',subject:'Run a project command',availableChoices:[{choiceId:'allow',label:'Allow once',scope:'once',decision:'approved',decisionToken:'current-allow'},{choiceId:'deny',label:'Deny',scope:'once',decision:'denied',decisionToken:'current-deny'}] };

test('approval details preserve a consequential suffix within the review limit', () => {
  const rawArgs = 'echo harmless;'.repeat(1600) + '; delete-important-files';
  const details = permissionDetails({...approval,rawArgs});
  assert.equal(details.args,rawArgs);
  assert.equal(details.approvalAllowed,true);
});

test('oversized approval details visibly report truncation and withhold approval while retaining denial', () => {
  for (const field of ['rawArgs','subject','toolName']) {
    const details = permissionDetails({...approval,[field]:'x'.repeat(70000)});
    assert.equal(details.truncated,true,field);
    assert.equal(details.approvalAllowed,false,field);
    assert.equal(details.choices.find(choice=>choice.decision==='denied').decisionToken,'current-deny');
  }
});

test('unrenderable request details withhold approval', () => {
  const rawArgs={};rawArgs.circular=rawArgs;
  const details=permissionDetails({...approval,rawArgs});
  assert.equal(details.approvalAllowed,false);
  assert.equal(details.incomplete,true);
});

test('permission choices exclude persistent grants and missing current tokens', () => {
  const details=permissionDetails({...approval,availableChoices:[...approval.availableChoices,{choiceId:'forever',scope:'session',decision:'approved',decisionToken:'persistent'},{choiceId:'missing',scope:'once',decision:'approved'}]});
  assert.deepEqual(details.choices.map(choice=>choice.choiceId),['allow','deny']);
});
