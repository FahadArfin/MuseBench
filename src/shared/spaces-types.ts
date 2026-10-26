import type {WorkArtifact,WorkTeam} from './work-types';
export type SpaceRole='owner'|'editor'|'commenter'|'viewer';
export interface SpaceMember{id:string;name:string;role:SpaceRole;joinedAt:string;}
export interface SpaceInfo{id:string;name:string;description:string;createdAt:string;}
export interface SpacePageSummary{id:string;title:string;type:'note'|'artifact';revision:number;updatedAt:string;updatedBy:string;}
export interface SpacePage extends SpacePageSummary{body?:string;artifact?:WorkArtifact;}
export interface SpaceComment{id:string;text:string;by:string;createdAt:string;resolved:boolean;canResolve:boolean;}
export interface SpaceRevision{revision:number;title:string;by:string;at:string;}
export interface SpaceInvite{id:string;role:Exclude<SpaceRole,'owner'>;expiresAt:string;used:boolean;revoked:boolean;}
export interface SpaceSnapshot{space:SpaceInfo;self:SpaceMember;members:SpaceMember[];pages:SpacePageSummary[];invites:SpaceInvite[];}
export interface SpaceConnection{id:string;spaceId:string;name:string;url:string;local:boolean;}
export interface SpacesState{spaces:SpaceConnection[];activeId:string|null;snapshot:SpaceSnapshot|null;page:SpacePage|null;comments:SpaceComment[];history:SpaceRevision[];error:string|null;conflict:boolean;busy:boolean;lastSynced:string|null;invitation:{text:string;expiresAt:string}|null;hosting:{url:string;scope:'local'}|null;}
export type SpacesCommand=
 |{type:'create';name:string;description:string;displayName:string}
 |{type:'join';invitation:string;displayName:string}
 |{type:'select';id:string}
 |{type:'refresh'|'clearError'|'clearInvitation'}
 |{type:'openPage';pageId:string}
 |{type:'savePage';pageId?:string;expectedRevision?:number;title:string;body:string}
 |{type:'comment';pageId:string;text:string}
 |{type:'resolveComment';pageId:string;commentId:string;resolved:boolean}
 |{type:'restorePage';pageId:string;revision:number;expectedRevision:number}
 |{type:'invite';role:Exclude<SpaceRole,'owner'>}
 |{type:'revokeInvite';inviteId:string}
 |{type:'removeMember';memberId:string}
 |{type:'publishWork';workId:string;pageId?:string;expectedRevision?:number}
 |{type:'copyToWork';pageId:string;team:WorkTeam};
