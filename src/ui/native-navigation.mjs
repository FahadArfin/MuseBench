/** A render can acknowledge only its registered token and exact destination. */
export function createNavigationCommitGate(){
 let active;
 return {
  begin(request,expected){
   if(active)active.finish(Error('UI request was cancelled.'));
   return new Promise((resolve,reject)=>{
    const item={id:request.id,deadline:request.deadline,expected,finish(error,root){
     if(active!==item)return;clearTimeout(item.timer);active=undefined;
     if(error)reject(error);else resolve(root);
    }};
    active=item;item.timer=setTimeout(()=>item.finish(Error('UI request expired before destination committed.')),Math.max(0,request.deadline-Date.now()));
   });
  },
  commit(id,actual,root){
   const item=active;if(!item||item.id!==id)return false;
   if(Date.now()>=item.deadline){item.finish(Error('UI request expired.'));return false;}
   if(!root||!Object.entries(item.expected).every(([key,value])=>actual[key]===value))return false;
   item.finish(null,root);return true;
  },
  cancel(id){if(active&&(!id||active.id===id))active.finish(Error('UI request was cancelled.'));}
 };
}

/** Visual status is optional: never depend on a frame callback to acknowledge commit. */
export function settleNavigationVisuals(root,deadline,signal,{animations=()=>document.getAnimations()}={}){
 if(signal?.aborted)return Promise.resolve(false);
 const relevant=()=>animations().some(animation=>{
  if(animation.playState!=='running'||animation.playbackRate===0||!Number.isFinite(animation.effect?.getComputedTiming().endTime))return false;
  const target=animation.effect?.target;if(!target||!root.contains(target)||(target!==root&&!target.matches?.('.settings-content,.extensions-content,.composer-shell'))||target.closest?.('[hidden],[inert],[aria-hidden="true"]')||!target.checkVisibility?.({checkVisibilityCSS:true}))return false;
  // Ignore opacity here: a visible destination fading in is still relevant.
  const rect=target.getBoundingClientRect();return rect.width>0&&rect.height>0&&rect.bottom>0&&rect.right>0&&rect.top<(globalThis.innerHeight??Infinity)&&rect.left<(globalThis.innerWidth??Infinity);
 });
 return new Promise(resolve=>{
  const until=Math.min(deadline,Date.now()+400);let timer,budget,finished=false;
  const finish=value=>{if(finished)return;finished=true;clearTimeout(timer);clearTimeout(budget);signal?.removeEventListener('abort',abort);resolve(value);};
  const abort=()=>finish(false);
  const inspect=()=>{if(signal?.aborted)return finish(false);if(!relevant())return finish(true);if(Date.now()>=until)return finish(false);timer=setTimeout(inspect,Math.min(20,Math.max(0,until-Date.now())));};
  // A hard budget also covers stalled animation timelines (and stalled rAF).
  budget=setTimeout(()=>finish(false),Math.max(0,until-Date.now()));
  signal?.addEventListener('abort',abort,{once:true});
  inspect();
 });
}
