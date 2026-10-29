import type {ModelSettingsView} from '../shared/model-settings.mjs';
import {reasoningLabels} from './ReasoningPicker';

export function ModelSettingsSummary({view}:{view:ModelSettingsView}){
 return <dl className="model-settings-summary" aria-label="Model settings status">
  <div><dt>{view.observed?.label??'Reported model'}</dt><dd>{view.observed?.model??'Not confirmed'}</dd></div>
  <div><dt>Effective effort</dt><dd>Not reported{view.submittedEffort&&<small>Requested {reasoningLabels[view.submittedEffort]}</small>}</dd></div>
  <div><dt>Next request</dt><dd>{view.requested.model}<small>{reasoningLabels[view.requested.effort]} effort{view.requested.unavailable?' · Unavailable in current catalog':''}</small></dd></div>
 </dl>;
}
