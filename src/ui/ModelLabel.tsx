import {UsersRound} from 'lucide-react';
import {modelDisplayLabel} from '../shared/models.mjs';

export function ModelLabel({id,label}:{id?:string;label:string}){
 const contributor=!!id&&/^muse-(spark|wonder)-\d+\.\d+-contributor$/.test(id);
 const name=contributor?modelDisplayLabel(id!.replace(/-contributor$/,'')):label;
 return <span className="compact-model-label"><span className="compact-model-name">{name}</span>{contributor&&<span className="contributor-badge" role="img" aria-label="Contributor model" title="Contributor model"><UsersRound size={13} aria-hidden="true"/></span>}</span>;
}
