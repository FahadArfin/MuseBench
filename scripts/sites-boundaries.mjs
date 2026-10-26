import * as asar from '@electron/asar';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
const baseline='artifacts/sites-baseline/app.asar',prior=JSON.parse(await readFile('artifacts/spaces-boundaries.json','utf8'));
const report={checkedAt:new Date().toISOString(),baseline,status:'passed',files:[]};
for(const {file} of prior.files){const current=await readFile(file),previous=asar.extractFile(baseline,path.normalize(file));assert(current.equals(previous),`${file} changed from the pre-Sites baseline`);report.files.push({file,sha256:createHash('sha256').update(current).digest('hex')});}
await writeFile('artifacts/sites-boundaries.json',JSON.stringify(report,null,2));console.log(`PASS ${report.files.length} existing runtime, controller, personal login and security files match the pre-Sites baseline`);
