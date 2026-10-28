import {useLayoutEffect,useRef,type RefObject} from 'react';
import {enterSurface} from './motion.mjs';

export function useSurfaceMotion(ref:RefObject<HTMLElement|null>,identity:string,active=true){
 const stop=useRef<(()=>void)|undefined>(undefined);
 useLayoutEffect(()=>{
  if(!active){stop.current?.();return;}
  // enterSurface samples and cancels its predecessor before starting again.
  stop.current=enterSurface(ref.current);
 },[ref,identity,active]);
 useLayoutEffect(()=>()=>stop.current?.(),[]);
}
