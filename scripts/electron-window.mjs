/** Preloaded WebContentsViews can precede the app shell in Playwright's pages. */
export async function waitForDesktopRenderer(app,{timeout=30000,interval=70}={}){
 const deadline=Date.now()+timeout;
 do{
  const shell=app.windows().find(page=>!page.isClosed()&&page.url().startsWith('file:')&&/\/dist\/index\.html(?:[?#]|$)/.test(page.url().replaceAll('\\','/')));
  if(shell)return shell;
  if(Date.now()>=deadline)break;
  await new Promise(resolve=>setTimeout(resolve,interval));
 }while(Date.now()<deadline);
 throw Error('Local desktop renderer did not open.');
}
