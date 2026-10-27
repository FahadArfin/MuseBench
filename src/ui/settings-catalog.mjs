export const SETTINGS_CATEGORIES = Object.freeze([
 {id:'general',label:'General',group:'Preferences',keywords:'appearance theme light dark system response font transcript text size width reduce motion animations composer enter to send'},
 {id:'notifications',label:'Notifications',group:'Preferences',keywords:'task completion completions alerts needs attention approval notification sound background'},
 {id:'voice',label:'Voice',group:'Preferences',keywords:'dictation microphone speech recognition language transcribe audio processing availability'},
 {id:'shortcuts',label:'Keyboard shortcuts',group:'Preferences',keywords:'keys keyboard commands hotkeys'},
 {id:'code',label:'Muse Code',group:'Coding',keywords:'reasoning effort model default approval approvals access permission permissions sandbox new chat'},
 {id:'memory',label:'Memory',group:'Coding',keywords:'your instructions memories personalization prompt projects'},
 {id:'skills',label:'Skills',group:'Coding',keywords:'installed commands extensions customize'},
 {id:'connection',label:'Muse connection',group:'Coding',keywords:'cli binary executable runtime version status sandbox shell'},
 {id:'account',label:'Account',group:'Account & data',keywords:'login sign in meta ai muse bot connections whatsapp facebook'},
 {id:'billing',label:'Usage & billing',group:'Account & data',keywords:'allowance credits tokens payment subscription'},
 {id:'data',label:'Data & privacy',group:'Account & data',keywords:'storage local export download transcript current code chat project folder history'},
 {id:'updates',label:'Updates',group:'Account & data',keywords:'version download install restart upgrade check app'},
 {id:'about',label:'About',group:'Account & data',keywords:'version desktop electron react documentation help'},
]);
export function findSettings(query='') {
 const words=String(query).toLowerCase().trim().split(/\s+/).filter(Boolean);
 return SETTINGS_CATEGORIES.filter(item=>words.every(word=>`${item.label} ${item.keywords}`.toLowerCase().includes(word)));
}
