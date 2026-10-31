import {useEffect,useRef,type RefObject} from 'react';
import {mountPromptTimeline} from '../shared/prompt-timeline.mjs';
export function PromptTimeline({transcript,active,context,onNavigate}:{transcript:RefObject<HTMLDivElement|null>;active:boolean;context:string;onNavigate?:()=>void}){
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!active||!host.current||!transcript.current)return;
  // A fresh host allows Shadow DOM to be disposed and recreated across chats.
  const element=document.createElement('div');element.setAttribute('data-musebench-timeline','');host.current.append(element);
  const dispose=mountPromptTimeline({host:element,root:transcript.current,scrollElement:transcript.current,userSelector:'[data-timeline-prompt]',answerSelector:'[data-timeline-answer]',onNavigate});
  return()=>{dispose();element.remove();};
 },[active,context,transcript,onNavigate]);
 return <div ref={host}/>;
}
