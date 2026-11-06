const fail=code=>Object.assign(Error(code==='STALE_RESULT'?'The image changed. Review this result against its original revision.':'Invalid image mask or edit result.'),{code});
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
export function canvasPointToSource(point,node,source){
 if(!finite(source?.width,1,16384)||!finite(source?.height,1,16384)||!finite(node?.width,.01,100000)||!finite(node?.height,.01,100000)||![point?.x,point?.y,node.x,node.y,node.rotation??0].every(Number.isFinite))throw fail('INVALID_TRANSFORM');
 const angle=-(node.rotation??0)*Math.PI/180,dx=point.x-node.x-node.width/2,dy=point.y-node.y-node.height/2;
 let u=(dx*Math.cos(angle)-dy*Math.sin(angle))/node.width+.5,v=(dx*Math.sin(angle)+dy*Math.cos(angle))/node.height+.5;
 if(u<-1e-9||u>1+1e-9||v<-1e-9||v>1+1e-9)return null;
 u=Math.max(0,Math.min(1,u));v=Math.max(0,Math.min(1,v));if(node.image?.flipX)u=1-u;if(node.image?.flipY)v=1-v;
 const crop=node.image?.crop??{x:0,y:0,width:1,height:1};if(!finite(crop.x,0,1)||!finite(crop.y,0,1)||!finite(crop.width,.000001,1)||!finite(crop.height,.000001,1)||crop.x+crop.width>1||crop.y+crop.height>1)throw fail('INVALID_TRANSFORM');
 // Match the cropped img element's object-fit box (including contain letterboxing / cover clipping).
 const elementWidth=node.width/crop.width,elementHeight=node.height/crop.height,scale=(node.image?.fit==='cover'?Math.max:Math.min)(elementWidth/source.width,elementHeight/source.height);
 const left=-node.width*crop.x/crop.width+(elementWidth-source.width*scale)/2,top=-node.height*crop.y/crop.height+(elementHeight-source.height*scale)/2;
 const x=(u*node.width-left)/scale,y=(v*node.height-top)/scale;if(x<-1e-9||y<-1e-9||x>source.width+1e-9||y>source.height+1e-9)return null;
 return{x:Math.max(0,Math.min(source.width,x)),y:Math.max(0,Math.min(source.height,y))};
}
export function createImageMask({sourceAssetId,width,height,feather=0,inverted=false}){
 if(typeof sourceAssetId!=='string'||!sourceAssetId||!Number.isInteger(width)||!Number.isInteger(height)||!finite(width,1,16384)||!finite(height,1,16384)||!finite(feather,0,256)||typeof inverted!=='boolean')throw fail('INVALID_MASK');
 return{version:1,sourceAssetId,width,height,feather,inverted,strokes:[]};
}
export function addMaskStroke(mask,stroke){
 createImageMask(mask);
 if(!Array.isArray(mask.strokes)||mask.strokes.length>=2000||!['brush','erase'].includes(stroke?.mode)||!finite(stroke.radius,.01,16384)||!Array.isArray(stroke.points)||!stroke.points.length||stroke.points.length>20000||stroke.points.some(p=>!finite(p.x,0,mask.width)||!finite(p.y,0,mask.height)))throw fail('INVALID_MASK');
 return{...structuredClone(mask),strokes:[...structuredClone(mask.strokes),structuredClone(stroke)]};
}
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=dx||dy?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy))):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
/** Alpha=1 is selected; feather is linear falloff outside each brush radius. Erase subtracts selection. */
export function maskAlphaAt(mask,p){
 if(!finite(p.x,0,mask.width)||!finite(p.y,0,mask.height))return 0;
 let alpha=0;for(const stroke of mask.strokes){let d=Infinity;for(let i=0;i<stroke.points.length;i++)d=Math.min(d,distance(p,stroke.points[Math.max(0,i-1)],stroke.points[i]));const strength=d<=stroke.radius?1:mask.feather?Math.max(0,1-(d-stroke.radius)/mask.feather):0;alpha=stroke.mode==='brush'?alpha+(1-alpha)*strength:alpha*(1-strength);}return mask.inverted?1-alpha:alpha;
}
/** Accept as a separate layer; original bytes and node stay untouched. Caller validates/commits once. */
export function acceptImageEdit(document,proposal,{nodeId}){
 if(document.id!==proposal.itemId||document.revision!==proposal.revision)throw fail('STALE_RESULT');
 if(!['image','design'].includes(document.kind)||proposal.status!=='completed'||!nodeId||!proposal.asset?.mediaType?.startsWith('image/')||!finite(proposal.asset.width,1,16384)||!finite(proposal.asset.height,1,16384))throw fail('INVALID_RESULT');
 const board=document.data.artboards.find(a=>a.id===proposal.surfaceId),source=board?.nodes.find(n=>n.id===proposal.nodeId);
 if(!source||source.assetId!==proposal.sourceAssetId)throw fail('STALE_RESULT');
 if(document.data.artboards.some(b=>b.nodes.some(n=>n.id===nodeId))||document.assets.some(a=>a.id===proposal.asset.id))throw fail('DUPLICATE_ID');
 const next=structuredClone(document),target=next.data.artboards.find(a=>a.id===proposal.surfaceId);
 // Provider output is a new complete image. Reset source crop/flip so it is never cropped twice.
 const layer={...structuredClone(source),id:nodeId,assetId:proposal.asset.id,locked:false,image:{...source.image,crop:{x:0,y:0,width:1,height:1},flipX:false,flipY:false,brightness:0,contrast:1,saturation:1}};
 target.nodes.splice(target.nodes.findIndex(n=>n.id===source.id)+1,0,layer);next.assets.push(structuredClone(proposal.asset));return next;
}
