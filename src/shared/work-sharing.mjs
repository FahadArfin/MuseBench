/** Existing Sites/Spaces renderers support saved v1 artifact snapshots only.
 * Creative documents need a reviewed media-capable viewer before sharing. */
export function isWorkSharingSupported(item){return Boolean(item&&['dashboard','motion','document','slides'].includes(item.kind)&&(item.documentVersion===undefined||item.documentVersion===1)&&item.documentRevision===undefined);}
export const WORK_SHARING_LIMITATION='Creative projects stay private. Export a file or portable project package from Work; Sites and Spaces currently support legacy artifact snapshots only.';
