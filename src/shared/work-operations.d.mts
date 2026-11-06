import type {WorkAsset,WorkDocument} from './work-document-types';

export type WorkEditOperation=
  | {type:'replaceData';data:WorkDocument['data']}
  | {type:'rename';title:string}
  | {type:'replaceAssets';assets:WorkAsset[]};

/** Returns an independent, fully schema-validated document with unchanged
 * identity and revision. The store owns revision/timestamp advancement. */
export function applyWorkOperations(document:WorkDocument,operations:readonly WorkEditOperation[]):WorkDocument;
