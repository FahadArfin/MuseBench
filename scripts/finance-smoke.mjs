import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Owns only a disposable source-app profile. Never attaches to the installed app.
const root=process.cwd();await mkdir('artifacts/finance',{recursive:true});
const output=await mkdtemp(path.resolve('artifacts/finance','native-'));
const env={...process.env,MUSEBENCH_DATA_DIR:path.join(output,'data'),MUSEBENCH_PROJECTS_DIR:path.join(output,'projects')};
for(const key of Object.keys(env)){
 if(key.toUpperCase()==='PATH')env[key]=env[key].split(path.delimiter).filter(folder=>!/muse/i.test(folder)).join(path.delimiter);
 if(key.toUpperCase()==='LOCALAPPDATA')env[key]=env.MUSEBENCH_DATA_DIR;
}
delete env.ELECTRON_RUN_AS_NODE;delete env.MUSEBENCH_DEV;delete env.MUSEBENCH_EXECUTABLE;
const report={startedAt:new Date().toISOString(),output,checks:[],errors:[],limitations:['Plaid network and real institution consent were not exercised.','Delayed Muse replies are injected only to test UI source binding; no live provider answer is claimed.']};
report.sourceFiles=Object.fromEntries(await Promise.all(['src/ui/work/finance/WorkFinance.tsx','electron/finance.mjs','src/finance/service.mjs','src/finance/plaid.mjs','src/finance/store.mjs','src/finance/questions.mjs','src/shared/finance-model.mjs','scripts/finance-smoke.mjs'].map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const fixture=path.join(output,'transactions.csv');
await writeFile(fixture,'Date,Description,Amount,Category,Type\n2026-11-01,Fixture payroll,-1000,Income,income\n2026-11-02,Private fixture grocer,120.25,Groceries,expense\n2026-11-03,Fixture refund,-20.25,Groceries,refund\n2026-11-04,Fixture transfer,200,Transfers,transfer\n'+Array.from({length:52},(_,i)=>`2026-11-05,Fixture coffee ${i},1,Dining,expense`).join('\n'));
let app,page;
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
const finance=()=>page.locator('.finance-workspace');
const command=input=>page.evaluate(input=>window.musebench.finance(input),input);
const snapshot=async()=>(await command({type:'state'})).state;
const until=async(fn,label,ms=20000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(resolve=>setTimeout(resolve,60));}throw Error('Timed out: '+label);};
const shot=name=>page.screenshot({path:path.join(output,name+'.png')});
async function launch(){
 app=await electron.launch({cwd:root,args:['.'],env});page=await app.firstWindow();page.setDefaultTimeout(12000);
 page.on('pageerror',error=>report.errors.push(error.message));await page.waitForFunction(()=>typeof window.musebench?.finance==='function');
 await page.getByRole('group',{name:'Choose workspace',exact:true}).waitFor();
 await app.evaluate(({dialog},fixture)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[fixture]});},fixture);
}
async function openFinance(){
 await page.getByRole('button',{name:'Muse AI',exact:true}).click();
 await page.getByRole('group',{name:'Chat or Work'}).getByRole('button',{name:'Work',exact:true}).click();
 await page.locator('.studio-category').filter({has:page.getByText('Finance',{exact:true})}).click();
 await finance().getByRole('heading',{name:'Your money, in focus.'}).waitFor();
 await until(async()=>!await finance().getByText('Opening your finance workspace…').count(),'Finance loaded');
}
async function importCsv(expected){
 await finance().getByRole('button',{name:'Choose CSV and preview',exact:true}).click();
 await finance().getByRole('button',{name:`Import ${expected} transactions`,exact:true}).waitFor();
 await finance().getByRole('button',{name:`Import ${expected} transactions`,exact:true}).click();
 await until(async()=>!await finance().locator('.finance-panel').count(),'import closed');
}
try{
 await launch();await openFinance();assert((await snapshot()).protectedStorage);await shot('01-empty');
 await finance().getByRole('button',{name:'Explore an example',exact:false}).focus();await page.keyboard.press('Enter');
 await finance().getByText('Example data.',{exact:true}).waitFor();await shot('02-overview');
 await page.evaluate(()=>document.documentElement.dataset.theme='light');await shot('02-overview-light');await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 await finance().getByRole('button',{name:'Where did my money go?',exact:false}).click();
 await finance().getByText('Calculated locally from this view',{exact:true}).waitFor();
 assert.equal((await snapshot()).transactions.length,0);assert(await finance().getByLabel('Send a financial summary',{exact:false}).isDisabled());
 check('Fictional sample and local quick answers never persist personal transactions or enable provider sharing');
 await page.setViewportSize({width:820,height:900});await page.locator('.finance-scroll').evaluate(node=>node.scrollTop=0);await shot('03-narrow');
 const overflow=await finance().evaluate(node=>node.scrollWidth>node.clientWidth+1);assert.equal(overflow,false);await page.setViewportSize({width:1440,height:960});
 check('Finance overview fits a narrower desktop viewport without horizontal overflow');
 await finance().getByRole('button',{name:'Exit example',exact:false}).click();
 await finance().getByRole('button',{name:'Connect accounts',exact:true}).click();
 await finance().getByRole('heading',{name:'Connect with your Plaid application'}).waitFor();
 assert.equal(await finance().getByRole('combobox',{name:/^Environment/}).inputValue(),'sandbox');assert.equal((await snapshot()).configured,false);
 await finance().getByRole('button',{name:'Close finance panel'}).click();
 check('Unconfigured Plaid opens explicit Sandbox-default credential setup, without a fake connection');
 await finance().getByRole('button',{name:'Import a CSV',exact:false}).click();
 await finance().getByRole('button',{name:'Choose CSV and preview',exact:true}).click();await finance().getByRole('button',{name:'Import 56 transactions',exact:true}).waitFor();
 await finance().getByLabel('Account name',{exact:true}).fill('Changed import name');await until(async()=>!await finance().locator('.finance-import-preview').count(),'stale preview cleared');
 await finance().getByLabel('Account name',{exact:true}).fill('Imported account');await importCsv(56);
 check('Changing import settings invalidates the old preview before any data is saved');
 let state=await snapshot();assert.equal(state.transactions.length,56);assert.equal(state.accounts[0].balanceMinor,null);
 await finance().getByRole('button',{name:'Overview',exact:true}).click();
 const metrics=await finance().locator('.finance-metrics').innerText();assert.match(metrics,/Not available/);assert.match(metrics,/\$152\.00/);assert.match(metrics,/\$1,000\.00/);assert.match(metrics,/\$848\.00/);
 await shot('04-imported');check('Real CSV picker/IPC/store import preserves signs, excludes transfers, includes refunds, and keeps balances unknown');
 await finance().getByRole('button',{name:'Transactions',exact:true}).click();await finance().getByRole('button',{name:'Next',exact:true}).click();
 assert.match(await finance().locator('.finance-pagination').innerText(),/51–56 of 56/);
 await finance().getByLabel('Finance currency').selectOption('USD');
 // A second currency uses the real native import path, then tests page reset.
 await finance().getByRole('button',{name:'Import CSV',exact:true}).click();await finance().getByRole('combobox',{name:/^Currency/}).selectOption('EUR');await importCsv(56);
 await finance().getByRole('button',{name:'Next',exact:true}).click();await finance().getByLabel('Finance currency').selectOption('USD');
 await until(async()=>(await finance().locator('.finance-pagination').innerText()).includes('1–50 of 56'),'pagination reset');
 await finance().getByLabel('Filter transactions by account').selectOption(state.accounts[0].id);
 await finance().getByRole('button',{name:'View example',exact:true}).click();
 await until(async()=>await finance().getByLabel('Filter transactions by account').inputValue()==='all','source filter reset');
 await finance().getByRole('button',{name:'Exit example',exact:false}).click();
 check('Currency/source changes reset pagination and discard unavailable account filters');
 await finance().getByRole('button',{name:'Import CSV',exact:true}).click();await finance().getByRole('combobox',{name:/^Currency/}).selectOption('USD');await importCsv(0);
 assert.equal((await snapshot()).transactions.length,112);check('Repeated CSV import previews and skips already imported rows');
 await finance().getByRole('button',{name:'Budgets',exact:true}).click();await finance().getByLabel('Budget category',{exact:true}).fill('Groceries');await finance().getByLabel('Monthly amount (USD)',{exact:true}).fill('200');await finance().getByRole('button',{name:'Save budget',exact:true}).click();
 await until(async()=>(await snapshot()).budgets['USD:Groceries']===20000,'budget saved');
 await app.close();app=null;await launch();await openFinance();state=await snapshot();assert.equal(state.transactions.length,112);assert.equal(state.budgets['USD:Groceries'],20000);
 const cipher=await readFile(path.join(env.MUSEBENCH_DATA_DIR,'work','finance','finance.bin'));
 assert(!cipher.includes(Buffer.from('Private fixture grocer')));assert(!cipher.includes(Buffer.from('Fixture payroll')));
 check('CSV records and budgets reopen from actual OS-encrypted native storage');
 // This wrapper affects only the isolated fixture's Ask IPC. All data operations
 // still run through the real controller. No model process or network is started.
 await app.evaluate(({ipcMain})=>{
  const channel='musebench:finance',original=ipcMain._invokeHandlers.get(channel);globalThis.__financeDelayed=null;
  ipcMain.removeHandler(channel);ipcMain.handle(channel,async(event,input)=>{
   if(input.type==='ask'){const {state}=await original(event,{type:'state'});return new Promise(resolve=>{globalThis.__financeDelayed=()=>resolve({state,answer:'PRIVATE ANSWER FROM PREVIOUS VIEW'});});}
   if(input.type==='stopAsk'&&globalThis.__financeDelayed){globalThis.__financeDelayed();globalThis.__financeDelayed=null;}
   return original(event,input);
  });
 });
 await finance().getByLabel('Finance month').fill('2026-11');
 await finance().getByLabel('Send a financial summary',{exact:false}).check();await finance().getByRole('textbox',{name:'Ask Muse about finances'}).fill('What was spending?');await finance().getByRole('button',{name:'Ask Muse',exact:true}).click();
 await finance().getByRole('button',{name:'Stop',exact:true}).waitFor();await finance().getByRole('button',{name:'View example',exact:true}).click();
 await app.evaluate(()=>{globalThis.__financeDelayed();globalThis.__financeDelayed=null;});
 await until(async()=>!await finance().getByRole('button',{name:'Stop',exact:true}).count(),'reply completed');
 assert.equal(await finance().getByText('PRIVATE ANSWER FROM PREVIOUS VIEW',{exact:true}).count(),0);
 await finance().getByRole('button',{name:'Exit example',exact:false}).click();
 check('Delayed private Muse reply is discarded after switching to fictional data');
 await finance().getByLabel('Send a financial summary',{exact:false}).check();await finance().getByRole('button',{name:'Ask Muse',exact:true}).click();await finance().getByRole('button',{name:'Stop',exact:true}).waitFor();await finance().getByRole('button',{name:'Stop',exact:true}).click();
 await until(async()=>!await finance().getByRole('button',{name:'Stop',exact:true}).count(),'stop completed');
 assert.equal(await finance().getByText('PRIVATE ANSWER FROM PREVIOUS VIEW',{exact:true}).count(),0);
 check('Ask Stop discards a reply that completes concurrently with cancellation (fixture reply)');
 // Remove the real imported sources, then prove credential clearing is reachable
 // with an empty dashboard (the former hidden-Accounts regression).
 for(const item of (await snapshot()).items)await command({type:'unlink',itemId:item.id});
 await command({type:'configure',clientId:'fixture-client',secret:'fixture-secret',environment:'sandbox'});
 await finance().getByRole('button',{name:'Finance connection settings'}).click();await finance().getByRole('button',{name:'Clear local finance data',exact:true}).click();await finance().getByRole('button',{name:'Clear local data',exact:true}).click();
 await until(async()=>!(await snapshot()).configured,'credentials cleared');assert.deepEqual((await snapshot()).budgets,{});
 check('Empty-state settings can clear saved connection setup and budgets after the last source is removed');
 await page.getByRole('button',{name:'New work',exact:true}).click();await page.locator('.studio-category').filter({has:page.getByText('Finance',{exact:true})}).waitFor();
 check('Sidebar New work exits Finance and returns to the existing Work home');
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.failure=String(error.stack);console.error(error);process.exitCode=1;try{await shot('failure');}catch{}}
finally{await app?.close().catch(()=>{});report.completedAt=new Date().toISOString();await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log('Finance native report: '+path.join(output,'report.json'));}

