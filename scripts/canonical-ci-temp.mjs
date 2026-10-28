import {realpathSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
const directory=realpathSync(tmpdir());
if(!process.env.GITHUB_ENV)throw Error('This setup script requires a GitHub Actions environment file.');
appendFileSync(process.env.GITHUB_ENV,`TEMP=${directory}\nTMP=${directory}\nTMPDIR=${directory}\n`);
console.log('Canonical temporary directory configured for filesystem-bound tests.');
