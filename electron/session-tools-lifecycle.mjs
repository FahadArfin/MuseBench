// Renderer navigation does not guarantee React effect cleanup.
export function bindSessionToolsNavigation(webContents,{browser,sideChat}){
 const navigating=(event,_url,inPlace,isMainFrame)=>{
  if(!(event.isMainFrame??isMainFrame)||(event.isInPlace??inPlace))return;
  browser.close();
  void sideChat.close().catch(()=>{}); // Failed cleanup remains a service busy blocker.
 };
 webContents.on('did-start-navigation',navigating);
 return()=>webContents.removeListener('did-start-navigation',navigating);
}
