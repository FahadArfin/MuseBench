import {useCallback,useLayoutEffect,useRef,useState,type RefObject} from 'react';

type Position={anchor:string|null;offset:number;top:number;following:boolean};
type Session={element:HTMLDivElement;following:boolean;lastTop:number;capture:()=>void;cancelCorrection:()=>void;latest:()=>void};
const CAPACITY=100,CORRECTION_MS=1200;

// Positions live only for this mounted workspace. The DOM identity is scoped by
// project/chat; identical message IDs in another chat never share an anchor.
export function useTranscriptPosition(transcript:RefObject<HTMLDivElement|null>,projectId?:string,taskId?:string){
 const key=projectId&&taskId?JSON.stringify([projectId,taskId]):null;
 const positions=useRef(new Map<string,Position>()),session=useRef<Session|null>(null);
 const [scrolledUp,setScrolledUp]=useState(false);
 const releaseForNavigation=useCallback(()=>{
  const current=session.current;if(!current)return;
  current.cancelCorrection();current.following=false;setScrolledUp(true);current.capture();
 },[]);
 const jumpToLatest=useCallback(()=>{
  const current=session.current;if(!current)return;
  current.cancelCorrection();current.following=true;setScrolledUp(false);current.latest();current.capture();
 },[]);
 const onScroll=useCallback(()=>{
  const current=session.current;if(!current)return;
  // Scrollbars/accessibility scrolling may not produce a wheel/key event.
  // A narrower transcript can become shorter on resize. Its browser-clamped
  // bottom is layout, while wheel/key/touch listeners capture upward intent
  // even at the very bottom before a scroll event arrives.
  if(current.element.scrollTop<current.lastTop-1&&current.element.scrollHeight-current.element.scrollTop-current.element.clientHeight>1)releaseForNavigation();
  current.lastTop=current.element.scrollTop;current.capture();
 },[releaseForNavigation]);

 useLayoutEffect(()=>{
  const element=transcript.current;if(!key||!element){setScrolledUp(false);return;}
  const cache=positions.current,saved=cache.get(key);
  // Refresh insertion order on visits, evicting the least recently visited chat.
  cache.delete(key);if(saved)cache.set(key,saved);
  let disposed=false,frame=0,correcting=Boolean(saved&&!saved.following),touchY:number|undefined;
  const previousAnchor=element.style.overflowAnchor; element.style.overflowAnchor='none';
  const capture=()=>{
   if(disposed)return;
   let anchor:HTMLElement|undefined,offset=0;
   if(!current.following){
    const bounds=element.getBoundingClientRect(),anchors=element.querySelectorAll<HTMLElement>('[data-transcript-anchor]');
    let low=0,high=anchors.length;
    while(low<high){const middle=Math.floor((low+high)/2);if(anchors[middle].getBoundingClientRect().bottom<=bounds.top)low=middle+1;else high=middle;}
    anchor=anchors[low];if(anchor)offset=anchor.getBoundingClientRect().top-bounds.top;
   }
   cache.set(key,{anchor:anchor?.dataset.transcriptAnchor??null,offset,top:element.scrollTop,following:current.following});
   while(cache.size>CAPACITY)cache.delete(cache.keys().next().value!);
  };
  const setTop=(top:number)=>{element.scrollTo({top,behavior:'instant'});current.lastTop=element.scrollTop;};
  const latest=()=>setTop(element.scrollHeight);
  const cancelCorrection=()=>{correcting=false;cancelAnimationFrame(frame);frame=0;};
  const current:Session={element,following:saved?.following??true,lastTop:element.scrollTop,capture,cancelCorrection,latest};session.current=current;
  const restore=()=>{
   if(!saved)return;
   const anchor=[...element.querySelectorAll<HTMLElement>('[data-transcript-anchor]')].find(node=>node.dataset.transcriptAnchor===saved.anchor);
   setTop(anchor?element.scrollTop+anchor.getBoundingClientRect().top-element.getBoundingClientRect().top-saved.offset:saved.top);
  };
  const update=()=>{frame=0;if(disposed)return;if(current.following)latest();else if(correcting)restore();capture();};
  const schedule=()=>{if(!frame&&!disposed)frame=requestAnimationFrame(update);};
  // Layout effects restore before paint. Corrections only react to actual DOM
  // layout changes, never to cloned message-array identity or draft typing.
  if(current.following)latest();else restore();setScrolledUp(!current.following);capture();schedule();
  const deadline=setTimeout(()=>{correcting=false;},CORRECTION_MS);
  const mutation=new MutationObserver(schedule);mutation.observe(element,{subtree:true,childList:true,characterData:true});
  const resize=new ResizeObserver(schedule);resize.observe(element);if(element.firstElementChild)resize.observe(element.firstElementChild);
  const wheel=(event:WheelEvent)=>{cancelCorrection();if(event.deltaY<0)releaseForNavigation();};
  const keydown=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||(event.target as HTMLElement).closest('input,textarea,[contenteditable="true"]'))return;
   if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))cancelCorrection();
   if(['ArrowUp','PageUp','Home'].includes(event.key)||(event.key===' '&&event.shiftKey))releaseForNavigation();
  };
  const touchstart=(event:TouchEvent)=>{cancelCorrection();touchY=event.touches[0]?.clientY;};
  const touchmove=(event:TouchEvent)=>{const next=event.touches[0]?.clientY;if(next!==undefined&&touchY!==undefined&&next>touchY)releaseForNavigation();touchY=next;};
  const pointer=()=>cancelCorrection();
  element.addEventListener('wheel',wheel,{passive:true});element.addEventListener('keydown',keydown);element.addEventListener('touchstart',touchstart,{passive:true});element.addEventListener('touchmove',touchmove,{passive:true});element.addEventListener('pointerdown',pointer);
  return()=>{
   // The previous DOM may already contain the next chat. Its final scroll
   // snapshot was captured by the handlers, so never recapture during cleanup.
   disposed=true;cancelCorrection();clearTimeout(deadline);mutation.disconnect();resize.disconnect();
   element.removeEventListener('wheel',wheel);element.removeEventListener('keydown',keydown);element.removeEventListener('touchstart',touchstart);element.removeEventListener('touchmove',touchmove);element.removeEventListener('pointerdown',pointer);element.style.overflowAnchor=previousAnchor;
   if(session.current===current)session.current=null;
  };
 },[key,transcript,releaseForNavigation]);
 return {scrolledUp,onScroll,jumpToLatest,releaseForNavigation};
}
