export interface AuthMarker {authBindingRevision:string}
export interface SourceCommand {taskId:string;sourceId:string;sourceRevision:string}
export interface AttemptCommand {taskId:string;attemptId:string}
export interface ReviewedAuthAction {reviewRevision:string;reviewed:true}
export type DiscoveryAuthCommand =
 | (SourceCommand & {type:'inspect'})
 | (SourceCommand & {type:'prepare';reviewedEndpoint:true})
 | (AttemptCommand & ReviewedAuthAction & {type:'reviewDestination';destinationChoiceId:string})
 | (AttemptCommand & ReviewedAuthAction & {type:'selectIssuer';issuerChoiceId:string})
 | (AttemptCommand & ReviewedAuthAction & {type:'savePublicClient';clientId:string;callbackPort:number})
 | (AttemptCommand & ReviewedAuthAction & {type:'begin'|'retrySave'})
 | (AttemptCommand & {type:'status'|'cancel'})
 | (SourceCommand & ReviewedAuthAction & {type:'forget';bindingRevision:string});
export type AuthStatus='not-configured'|'discovering'|'issuer-review'|'review-required'|'registration-required'|'waiting-browser'|'exchanging'|'saving'|'ready'|'refreshing'|'scope-review-required'|'needs-sign-in'|'storage-unavailable'|'save-recovery'|'cancelled'|'failed'|'forget-review';
export interface SafeAuthState {
 sourceId:string;sourceRevision:string;status:AuthStatus;credentialAvailable:boolean;
 bindingRevision?:string;reviewRevision?:string;attemptId?:string;deadline?:number;
 origin?:string;issuerOrigin?:string;resourceOrigin?:string;registrationOrigin?:string;tokenOrigin?:string;
 urlTemplate?:string;environmentNames?:string[];scopes?:string[];
 issuerChoices?:Array<{id:string;origin:string}>;destinationChoices?:Array<{id:string;origin:string}>;
 registrationMethod?:'stored'|'preregistered'|'cimd'|'dcr'|'manual';callbackPort?:number;
 canPrepare?:boolean;canBegin?:boolean;canCancel?:boolean;canRetrySave?:boolean;canForget?:boolean;
 canSavePublicClient?:boolean;canSelectIssuer?:boolean;canReviewDestination?:boolean;
 reasonCode?:string;reason?:string;
}
export function validateDiscoveryAuthCommand(value:unknown):DiscoveryAuthCommand;
export function safeAuthState(value:unknown):SafeAuthState;
