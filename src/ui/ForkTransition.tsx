import {useLayoutEffect,useRef,type RefObject} from 'react';
import {GitBranch} from 'lucide-react';
import {animateMotion} from './motion.mjs';
import './fork-transition.css';

export function ForkTransition({transcript}:{transcript:RefObject<HTMLDivElement|null>}){
 const notice=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>animateMotion(transcript.current,
  [{opacity:.65,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}],
  {duration:320,easing:'cubic-bezier(.22,1,.36,1)'}),[]);
 return <div ref={notice} className="fork-transition" role="status"><GitBranch size={17}/><div><strong>Conversation forked</strong><span>You’re now in a separate chat.</span></div></div>;
}
