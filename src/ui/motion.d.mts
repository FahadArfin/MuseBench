export function reducedMotion():boolean;
export function motionScrollBehavior():'instant'|'smooth';
export function enterSurface(element:HTMLElement|null):()=>void;
export function animateMotion(element:HTMLElement|null,keyframes:Keyframe[],options:KeyframeAnimationOptions):()=>void;
export function observeMotionPreference():()=>void;
export function observeDetailsMotion(root:HTMLElement):()=>void;
