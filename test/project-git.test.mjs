import test from 'node:test';
import assert from 'node:assert/strict';
import {githubRepository,projectGit} from '../src/shared/project-git.mjs';
test('repository URLs normalize HTTPS and SSH and never expose credentials',()=>{
 for(const remote of ['git@github.com:owner/repo.git','ssh://git@github.com/owner/repo.git','https://private-token@github.com/owner/repo.git?secret=value'])assert.equal(githubRepository(remote),'https://github.com/owner/repo');
 for(const remote of ['https://evil.test/owner/repo','https://github.com/owner/repo/issues','file:///tmp/repo','https://github.com:444/owner/repo',null]){
  assert.equal(githubRepository(remote),null);
 }
});
test('folders without Git report unavailable metadata without failing',async()=>{
 assert.deepEqual(await projectGit('this-project-does-not-exist'),{repositoryUrl:null,branch:null});
});
