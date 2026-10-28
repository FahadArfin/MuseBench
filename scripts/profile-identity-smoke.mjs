import {createServer} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const server=await createServer({configFile:'vite.preview.config.mjs',cacheDir:'node_modules/.vite-profile-identity-test',server:{host:'127.0.0.1',port:0,strictPort:false}});
await server.listen();
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}});
const report={checks:[],errors:[]},output='artifacts/profile-identity';
page.setDefaultTimeout(10000);
page.on('pageerror',error=>report.errors.push(String(error)));
await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
await mkdir(output,{recursive:true});
const account={accountId:'meta:fixture-alice',accountName:'Alice Rivera',displayName:'Alice Rivera',handle:'alice',avatarSeed:'account-alice'};
const other={accountId:'meta:fixture-bob',accountName:'Bob Rivera',displayName:'Bob Rivera',handle:'bob',avatarSeed:'account-bob'};
await page.addInitScript(initial=>{
  if(!sessionStorage.getItem('profile-identity-fixture')){
    sessionStorage.setItem('profile-identity-fixture',JSON.stringify(initial));
    localStorage.setItem('musebench-profile:account:local',JSON.stringify({displayName:'Your account',bio:'My existing bio',avatarSeed:'mascot-2'}));
  }
  let profile=JSON.parse(sessionStorage.getItem('profile-identity-fixture')),bridge,lastState;
  const listeners=new Set();
  const apply=state=>({...state,profile});
  window.setFixtureAccount=value=>{
    profile=value;sessionStorage.setItem('profile-identity-fixture',JSON.stringify(value));
    if(lastState)for(const listener of listeners)listener(apply(lastState));
  };
  Object.defineProperty(window,'musebench',{
    configurable:true,get:()=>bridge,
    set:value=>{
      bridge={...value,
        personalState:async()=>apply(lastState=await value.personalState()),
        personal:async command=>apply(lastState=await value.personal(command)),
        onPersonalState:listener=>{
          listeners.add(listener);
          const dispose=value.onPersonalState(state=>{lastState=state;listener(apply(state));});
          return()=>{listeners.delete(listener);dispose();};
        },
      };
    },
  });
},account);
const pass=message=>{report.checks.push(message);console.log('PASS '+message);};
const sidebarName=()=>page.locator('.sidebar:not([hidden]) .profile-label strong');
const openProfile=async()=>{
  await page.getByRole('button',{name:'Profile menu',exact:true}).click();
  await page.getByRole('menuitem',{name:/View profile for/}).click();
  await page.getByRole('main',{name:'User profile'}).waitFor();
};
const edit=async()=>{await page.getByRole('button',{name:'Edit profile',exact:true}).click();return page.getByRole('dialog',{name:'Edit profile',exact:true});};
const publish=profile=>page.evaluate(value=>window.setFixtureAccount(value),profile);
try{
  await page.goto(`${server.resolvedUrls.local[0]}preview.html`,{timeout:60000});
  await page.getByRole('group',{name:'Choose workspace'}).waitFor({timeout:30000});
  await sidebarName().getByText('Alice Rivera',{exact:true}).waitFor();
  await openProfile();await page.getByText('My existing bio',{exact:true}).waitFor();
  let dialog=await edit();assert.equal(await dialog.getByLabel('Display name',{exact:true}).inputValue(),'Alice Rivera');
  assert.equal(await dialog.getByRole('button',{name:'Rose mascot',exact:true}).getAttribute('aria-pressed'),'true');
  await dialog.getByPlaceholder('What are you building?',{exact:true}).fill('Updated bio');await dialog.getByRole('button',{name:'Save profile',exact:true}).click();
  await publish({...account,accountName:'Alice Updated',displayName:'Alice Updated'});
  await page.getByRole('heading',{name:'Alice Updated',exact:true}).waitFor();await sidebarName().getByText('Alice Updated',{exact:true}).waitFor();
  pass('Account name is the default; migrating fallback preferences preserves the bio and avatar, and unrelated edits leave the name automatic');

  dialog=await edit();await dialog.getByPlaceholder('What are you building?',{exact:true}).fill('Bio typed during account refresh');
  await publish({...account,accountName:'Alice Refreshed',displayName:'Alice Refreshed'});await page.getByRole('heading',{name:'Alice Refreshed',exact:true}).waitFor();
  assert.equal(await dialog.getByLabel('Display name',{exact:true}).inputValue(),'Alice Refreshed');
  assert.equal(await dialog.getByPlaceholder('What are you building?',{exact:true}).inputValue(),'Bio typed during account refresh');
  await dialog.getByPlaceholder('What are you building?',{exact:true}).fill('Updated bio');await dialog.getByRole('button',{name:'Save profile',exact:true}).click();
  await publish({...account,accountName:'Alice Updated',displayName:'Alice Updated'});await page.getByRole('heading',{name:'Alice Updated',exact:true}).waitFor();
  pass('A provider refresh during editing updates untouched defaults while preserving the user’s draft fields');

  dialog=await edit();await dialog.getByLabel('Display name',{exact:true}).fill('My custom name');await dialog.getByRole('button',{name:'Save profile',exact:true}).click();
  await sidebarName().getByText('My custom name',{exact:true}).waitFor();await page.reload();await openProfile();
  await page.getByRole('heading',{name:'My custom name',exact:true}).waitFor();await page.getByText('Updated bio',{exact:true}).waitFor();
  pass('A custom display name updates the sidebar and profile and survives reload');

  dialog=await edit();await dialog.getByRole('button',{name:'Use account name',exact:true}).click();
  assert.equal(await dialog.getByLabel('Display name',{exact:true}).inputValue(),'Alice Updated');
  await dialog.getByRole('button',{name:'Save profile',exact:true}).click();
  await publish({...account,accountName:'Alice Latest',displayName:'Alice Latest'});await page.getByRole('heading',{name:'Alice Latest',exact:true}).waitFor();
  pass('Use account name removes the custom name and resumes provider updates');

  dialog=await edit();await dialog.getByLabel('Display name',{exact:true}).fill('Unsaved Alice draft');
  await publish(other);await page.getByRole('heading',{name:'Bob Rivera',exact:true}).waitFor();
  assert.equal(await page.getByRole('dialog',{name:'Edit profile',exact:true}).count(),0);
  assert.equal(await page.getByText('Updated bio',{exact:true}).count(),0);
  dialog=await edit();assert.equal(await dialog.getByLabel('Display name',{exact:true}).inputValue(),'Bob Rivera');
  await dialog.getByLabel('Display name',{exact:true}).fill('Bob custom name');await dialog.getByRole('button',{name:'Save profile',exact:true}).click();
  await publish({...account,accountName:'Alice Latest',displayName:'Alice Latest'});await page.getByRole('heading',{name:'Alice Latest',exact:true}).waitFor();await page.getByText('Updated bio',{exact:true}).waitFor();
  await publish(other);await page.getByRole('heading',{name:'Bob custom name',exact:true}).waitFor();
  pass('Switching accounts closes a stale editor and keeps each account’s name and other profile edits separate');

  await publish(null);await page.getByRole('heading',{name:'Your account',exact:true}).waitFor();await sidebarName().getByText('Your account',{exact:true}).waitFor();
  await publish(account);await page.getByRole('heading',{name:'Alice Rivera',exact:true}).waitFor();

  dialog=await edit();const presets=dialog.locator('.profile-avatar-options button');
  assert.equal(await presets.count(),12);
  for(const preset of await presets.all()){
    assert.match(await preset.getAttribute('aria-label'),/ mascot$/);
    await preset.click();assert.equal(await preset.getAttribute('aria-pressed'),'true');
    assert.equal(await dialog.locator('.profile-avatar-options button[aria-pressed="true"]').count(),1);
  }
  await dialog.getByRole('button',{name:'Rose mascot',exact:true}).click();
  await dialog.screenshot({path:`${output}/avatar-picker-dark.png`});
  await dialog.locator('.avatar-picker').screenshot({path:`${output}/mascot-presets.png`});
  const fixture=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=480;canvas.height=320;
    const context=canvas.getContext('2d');
    for(const [color,x,y] of [['#2469df',0,0],['#e99838',240,0],['#18a783',0,160],['#ab59c9',240,160]]){
      context.fillStyle=color;context.fillRect(x,y,240,160);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const upload=async()=>{
    await dialog.locator('input[type="file"]').setInputFiles({name:'avatar-fixture.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});
    await dialog.getByRole('img',{name:'Profile picture crop preview',exact:true}).waitFor();
    for(const [label,key,value] of [['Zoom','End','3'],['Horizontal position','Home','0'],['Vertical position','End','100']]){
      const slider=dialog.getByRole('slider',{name:label,exact:true});await slider.focus();await slider.press(key);assert.equal(await slider.inputValue(),value);
    }
  };
  await upload();await dialog.getByRole('button',{name:'Cancel crop',exact:true}).click();
  assert.equal(await dialog.getByRole('button',{name:'Rose mascot',exact:true}).getAttribute('aria-pressed'),'true');
  assert.equal(await dialog.getByRole('img',{name:'Profile picture crop preview',exact:true}).count(),0);
  await upload();await dialog.getByRole('button',{name:'Use photo',exact:true}).click();
  assert.equal(await dialog.locator('.profile-avatar-options button[aria-pressed="true"]').count(),0);
  const photo=await dialog.locator('.avatar-chosen img').getAttribute('src');assert.match(photo,/^data:image\/png;base64,/);
  await dialog.locator('.avatar-chosen img').evaluate(image=>image.decode());
  assert.deepEqual(await dialog.locator('.avatar-chosen img').evaluate(image=>[image.naturalWidth,image.naturalHeight]),[256,256]);
  await dialog.getByRole('button',{name:'Save profile',exact:true}).click();await page.reload();await openProfile();
  assert.equal(await page.locator('.profile-hero .profile-avatar img').getAttribute('src'),photo);
  dialog=await edit();await dialog.getByRole('button',{name:'Mint mascot',exact:true}).click();
  assert.equal(await dialog.locator('.avatar-chosen').count(),0);
  await dialog.getByRole('button',{name:'Save profile',exact:true}).click();await page.reload();await openProfile();
  assert.equal(await page.locator('.profile-hero .profile-avatar img').count(),0);
  dialog=await edit();assert.equal(await dialog.getByRole('button',{name:'Mint mascot',exact:true}).getAttribute('aria-pressed'),'true');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  pass('All 12 mascot presets select exclusively; crop controls work, cancelling preserves the preset, uploaded photos survive reload, and choosing a mascot replaces the upload');

  await page.setViewportSize({width:430,height:820});dialog=await edit();await dialog.getByLabel('Display name',{exact:true}).fill('Mobile custom');
  await dialog.getByRole('button',{name:'Use account name',exact:true}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const mobileBounds=await dialog.boundingBox();assert(mobileBounds.x>=0&&mobileBounds.x+mobileBounds.width<=430);
  assert(await dialog.locator('.avatar-picker').evaluate(element=>element.scrollWidth<=element.clientWidth));
  await page.screenshot({path:`${output}/edit-mobile.png`});await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.setViewportSize({width:1440,height:960});await page.screenshot({path:`${output}/profile-desktop.png`});
  pass('Signing out clears the previous account profile and the account-name control fits a narrow window');

  await page.keyboard.press('Control+,');const settings=page.getByRole('dialog',{name:'Settings',exact:true});
  await settings.getByRole('button',{name:'Light theme',exact:true}).click();await page.keyboard.press('Escape');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');dialog=await edit();
  assert.equal(await dialog.locator('.profile-avatar-options button').count(),12);
  await dialog.screenshot({path:`${output}/avatar-picker-light.png`});await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
  pass('The mascot picker renders in dark and light themes and remains contained in the narrow profile editor');
  assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});process.exitCode=1;console.error(error);}
finally{await browser.close();await server.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));}
