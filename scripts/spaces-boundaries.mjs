import * as asar from '@electron/asar';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';

const archive=path.resolve('artifacts/spaces-baseline/app.asar');
const files=JSON.parse(readFileSync('artifacts/work-boundaries.json','utf8')).files.map(({file})=>file);
const checked=files.map(file=>{
 const source=readFileSync(file),baseline=asar.extractFile(archive,path.normalize(file));
 assert(source.equals(baseline),`${file} changed from the pre-Spaces package`);
 return {file,sha256:createHash('sha256').update(source).digest('hex')};
});
const report={checkedAt:new Date().toISOString(),status:'passed',baseline:'artifacts/spaces-baseline/app.asar',files:checked};
writeFileSync('artifacts/spaces-boundaries.json',JSON.stringify(report,null,2));
console.log(`PASS ${checked.length} runtime, controller, personal-session and security modules match the pre-Spaces package`);
