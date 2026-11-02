import type {FileReviewFile} from '../shared/file-review.mjs';

export interface ReviewTreeNode {
 path:string;
 name:string;
 file?:FileReviewFile;
 children:ReviewTreeNode[];
 additions:number;
 deletions:number;
 unknownCounts:boolean;
 changed:number;
}

/** Metadata only: building the tree never reads file contents. */
export function buildReviewTree(files:FileReviewFile[]):ReviewTreeNode[] {
 const roots:ReviewTreeNode[]=[],folders=new Map<string,ReviewTreeNode>();
 for(const file of files){
  const parts=file.path.split('/');let siblings=roots,parent='';
  for(let index=0;index<parts.length;index++){
   const name=parts[index],path=parent?parent+'/'+name:name,last=index===parts.length-1;
   let node=last?undefined:folders.get(path);
   if(!node){node={path,name,children:[],additions:0,deletions:0,unknownCounts:false,changed:0,...(last?{file}:{})};siblings.push(node);if(!last)folders.set(path,node);}
   node.additions+=file.additions??0;node.deletions+=file.deletions??0;
   node.unknownCounts ||= file.status!=='unchanged'&&!file.countsKnown;
   node.changed+=file.status!=='unchanged'?1:0;
   siblings=node.children;parent=path;
  }
 }
 const sort=(nodes:ReviewTreeNode[])=>{nodes.sort((a,b)=>Number(!!a.file)-Number(!!b.file)||a.name.localeCompare(b.name));for(const node of nodes)sort(node.children);};sort(roots);
 return roots;
}

export function parentReviewPaths(path:string):string[]{const parts=path.split('/');return parts.slice(0,-1).map((_,index)=>parts.slice(0,index+1).join('/'));}
