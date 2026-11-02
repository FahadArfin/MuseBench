import {createContext,useContext,type ReactNode} from 'react';
import {FileText} from 'lucide-react';
import {localPreviewPath} from '../shared/file-preview.mjs';
export const FilePreviewLinksContext=createContext<{root:string;open:(path:string)=>void}>({root:'',open:()=>{}});
export function FilePreviewLink({href,children}:{href?:string;children:ReactNode}){
 const context=useContext(FilePreviewLinksContext),path=localPreviewPath(href,context.root);
 return path?<button type="button" className="file-preview-link" title={`Preview ${path}`} onClick={()=>context.open(path)}><FileText size={13}/>{children}</button>:<span className="message-link" title={href}>{children}</span>;
}
// React Markdown normally strips Windows/file URLs before the link component.
// Keep them as data only; FilePreviewLink admits only bounded project references.
export const previewLinkTransform=(url:string)=>url;
