import {ChevronRight, Link2, MessageCircle, Plug, Settings2} from 'lucide-react';
import type {CustomizeTab} from '../shared/customize-types';
import type {PersonalCommand} from '../shared/types';

export type AccountSettingsCommand = Extract<PersonalCommand, {type:'metaSettings'|'serviceAction'}>;
type Props = {openCustomize:(tab?:CustomizeTab)=>void;openAccountSettings:(command:AccountSettingsCommand)=>void};
export function SettingsConnections({openCustomize,openAccountSettings}:Props){
  return <section className="settings-section"><h3>Connections</h3><p className="settings-description">Choose which service you want to connect. Each service manages its own app access.</p>
    <div className="settings-destination-list">
      <button type="button" className="settings-destination" aria-label="Connect Meta AI apps" onClick={()=>openAccountSettings({type:'metaSettings',section:'apps'})}><Link2 size={19}/><span><strong>Meta AI apps</strong><small>Connect Gmail, Google Drive, Calendar, Outlook and more through Meta AI.</small></span><span className="settings-destination-action">Connect<ChevronRight size={15}/></span></button>
      <button type="button" className="settings-destination" aria-label="Open Meta AI settings and plan" onClick={()=>openAccountSettings({type:'metaSettings',section:'general'})}><Settings2 size={19}/><span><strong>Meta AI settings &amp; plan</strong><small>Manage account preferences and view Meta AI upgrade options.</small></span><ChevronRight size={16}/></button>
      <button type="button" className="settings-destination" aria-label="Open Muse connected apps" onClick={()=>openAccountSettings({type:'serviceAction',action:'connections'})}><MessageCircle size={19}/><span><strong>Muse connected apps</strong><small>Manage the apps your personal assistant can access.</small></span><ChevronRight size={16}/></button>
    </div>
    <h4 className="settings-subheading">Muse Code</h4><div className="settings-destination-list"><button type="button" className="settings-destination" aria-label="Open coding connectors" onClick={()=>openCustomize('connectors')}><Plug size={19}/><span><strong>Coding connectors</strong><small>Browse connectors and manage MCP tools for coding tasks.</small></span><ChevronRight size={16}/></button></div>
    <p className="settings-note">Meta AI apps open in the official account page inside MuseBench. Some providers require browser sign-in. Connecting an app to Meta AI does not connect it to Muse Code.</p>
  </section>;
}
