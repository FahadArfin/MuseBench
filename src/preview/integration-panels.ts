import {RUN_SETTING_FIELDS,validateRunSettings,runSettingsChanges} from '../shared/integration-panel.mjs';
import type {IntegrationReview,RunSettings} from '../shared/integration-panel.mjs';
import type {CustomizeCommand,CustomizeState,CustomizeResult} from '../shared/customize-types';

export function createPreviewIntegrationPanels(state:CustomizeState,owner:()=>string,isBlocked:()=>boolean){
 const values=new Map<string,{server:CustomizeState['servers'][number];values:RunSettings}>();
 let pending:{review:IntegrationReview;values:RunSettings;owner:string;inventory:string;created:number}|undefined;
 const inventory=()=>JSON.stringify(state.servers.map(s=>[s.name,s.revision,s.enabled,s.reviewed]));
 const get=(name:string,revision:string)=>{const server=state.servers.find(s=>s.name===name);if(!server||server.revision!==revision)throw Error('Integration settings changed. Refresh and review again.');return server;};
 const read=(server:CustomizeState['servers'][number])=>{const saved=values.get(server.name);return saved?.server===server?saved.values:{required:false,startupTimeout:30,toolTimeout:300};};
 return(command:CustomizeCommand):CustomizeResult|undefined=>{
  if(!['inspectIntegrationPanel','prepareIntegrationPanel','applyIntegrationPanel'].includes(command.type))return;
  if(command.type==='inspectIntegrationPanel'){
   const server=get(command.name,command.revision);return{integrationPanel:{schemaVersion:1,kind:'mcp-run-settings',name:server.name,revision:server.revision,editable:server.reviewed,fields:structuredClone([...RUN_SETTING_FIELDS]),values:{...read(server)},simulation:true,...(!server.reviewed?{reason:'Review access for this integration before editing its run settings.'}:{})}};
  }
  if(isBlocked())throw Error('Let running work finish before changing integration settings.');
  if(command.type==='prepareIntegrationPanel'){
   const server=get(command.name,command.revision);if(!server.reviewed)throw Error('Review access before editing run settings.');const next=validateRunSettings(command.values),changes=runSettingsChanges(read(server),next);if(!changes.length)throw Error('No changes to review.');
   const created=Date.now(),review:IntegrationReview={schemaVersion:1,kind:'mcp-run-settings',name:server.name,revision:server.revision,token:crypto.randomUUID(),changes,expiresAt:new Date(created+600000).toISOString(),simulation:true};pending={review,values:next,owner:owner(),inventory:inventory(),created};return{integrationReview:structuredClone(review)};
  }
  if(command.type==='applyIntegrationPanel'){
   if(command.reviewed!==true)throw Error('Review these changes before applying.');const prepared=pending;pending=undefined;
   if(!prepared||prepared.review.token!==command.token||Date.now()-prepared.created>=600000)throw Error('This review expired. Review the changes again.');
   if(prepared.owner!==owner()||prepared.inventory!==inventory())throw Error('Integration settings changed. Refresh and review again.');
   const server=get(prepared.review.name,prepared.review.revision);if(!server.reviewed)throw Error('Review access before applying changes.');
   values.set(server.name,{server,values:prepared.values});server.revision=crypto.randomUUID();
   return{state:structuredClone(state),message:'Preview only: run settings saved in this preview. Reconnect Muse to use changes in the desktop app.'};
  }
 };
}
