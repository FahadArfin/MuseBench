export const META_APPS=Object.freeze([
 ['google-drive','Google Drive'],['gmail','Gmail'],['google-calendar','Google Calendar'],['google-contacts','Google Contacts'],
 ['opentable','OpenTable'],['outlook-calendar','Outlook Calendar'],['outlook-people','Outlook People'],['outlook-email','Outlook Email'],
].map(([id,title])=>Object.freeze({id,title})));
export const unknownMetaApps=()=>META_APPS.map(({id})=>({id,status:'unknown'}));
