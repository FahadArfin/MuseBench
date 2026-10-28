import {useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode} from 'react';
import {MessagesSquare, Terminal} from 'lucide-react';
import {readPreferences} from './preferences.mjs';
import './launch-animation.css';

// Keep App mounted throughout: local state, fonts and the initial chat load in parallel.
export function LaunchExperience({enabled, children}: {enabled:boolean; children:ReactNode}) {
  const [active, setActive] = useState(enabled);
  const complete = useCallback(() => setActive(false), []);
  return <><div className="launch-content" inert={active}>{children}</div>{active && <LaunchAnimation onComplete={complete}/>}</>;
}

function LaunchAnimation({onComplete}: {onComplete:()=>void}) {
  const overlay = useRef<HTMLDivElement>(null);
  const wordmark = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const layer = overlay.current!, mark = wordmark.current!;
    const root = document.documentElement;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false, finished = false, frame = 0;
    const animations: Animation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (callback:()=>void, delay:number) => timers.push(setTimeout(callback, delay));
    const finish = () => {
      if (disposed || finished) return;
      finished = true;
      document.querySelectorAll('[data-launch-brand="personal"]').forEach(brand => brand.setAttribute('data-launch-arrived', 'true'));
      delete root.dataset.launchActive;
      // A separate native visibility gate keeps WebContentsViews behind this DOM layer.
      void window.musebench?.launch?.complete().catch(() => {});
      onComplete();
    };
    const animate = (element:Element, keyframes:Keyframe[], options:KeyframeAnimationOptions) => {
      const animation = element.animate(keyframes, {...options, fill:'forwards'});
      animations.push(animation);
      return animation;
    };
    const reduce = () => motion.matches || readPreferences().reducedMotion;
    const skip = (event:KeyboardEvent) => { if (event.key === 'Escape') finish(); };
    const onMotionChange = () => { if (reduce()) finish(); };
    const onVisibility = () => { if (document.hidden) finish(); };
    window.addEventListener('keydown', skip);
    window.addEventListener('resize', finish);
    document.addEventListener('visibilitychange', onVisibility);
    motion.addEventListener('change', onMotionChange);
    layer.addEventListener('pointerdown', finish);
    // This is a flourish, never a dependency of app readiness or an indefinite loader.
    later(finish, 1900);
    const begin = () => {
      if (disposed || finished) return;
      if (reduce() || document.hidden) { finish(); return; }
      const box = mark.getBoundingClientRect();
      const scale = Math.min(3.4, (innerWidth - 64) / box.width);
      const x = (innerWidth - box.width * scale) / 2;
      const y = (innerHeight - box.height * scale) / 2;
      const origin = `translate(${x}px, ${y}px) scale(${scale})`;
      mark.style.transform = origin;
      layer.dataset.phase = 'typing';
      later(() => {
        try {
          // Both product sidebars stay mounted; the first match can be the hidden one.
          const target = Array.from(document.querySelectorAll<HTMLElement>('[data-launch-brand="personal"]'))
            .find(brand => brand.getBoundingClientRect().width > 0);
          const text = target?.querySelector<HTMLElement>('.typed-text');
          const targetBox = target?.getBoundingClientRect();
          const textBox = text?.getBoundingClientRect();
          // Narrow/collapsed sidebars have no visible title; fade gracefully in place.
          if (!targetBox || !textBox || !targetBox.width || !textBox.width || targetBox.right <= 0 || targetBox.left >= innerWidth) {
            layer.dataset.phase = 'fading';
            animate(layer, [{opacity:1}, {opacity:0}], {duration:240});
            later(finish, 250);
            return;
          }
          layer.dataset.phase = 'moving';
          const size = parseFloat(getComputedStyle(text!).fontSize) / 17;
          const destination = `translate(${targetBox.left}px, ${targetBox.top + (targetBox.height - box.height * size) / 2}px) scale(${size})`;
          animate(mark, [{transform:origin, color:'#1877f2'}, {transform:destination, color:getComputedStyle(text!).color}], {duration:700, easing:'cubic-bezier(.22, 1, .36, 1)'});
          animate(layer.querySelector('.launch-backdrop')!, [{opacity:1}, {opacity:0}], {duration:480, delay:140, easing:'ease-in-out'});
          animate(layer.querySelector('.launch-terminal')!, [{opacity:1}, {opacity:0}], {duration:180, delay:480});
          animate(layer.querySelector('.launch-chat-icon')!, [{opacity:0}, {opacity:1}], {duration:180, delay:480});
          later(finish, 710);
        } catch { finish(); }
      }, 800);
    };
    // The bundled brand font is already fetching through CSS. Bound this wait so a
    // damaged font/cache cannot hold the launch screen; flight uses real DOM bounds.
    Promise.race([document.fonts.load('600 17px "Inter Variable"'), new Promise(resolve => later(() => resolve(null), 100))])
      .catch(() => {}).then(() => { if (!disposed && !finished) frame = requestAnimationFrame(begin); });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      timers.forEach(clearTimeout);
      animations.forEach(animation => animation.cancel());
      window.removeEventListener('keydown', skip);
      window.removeEventListener('resize', finish);
      document.removeEventListener('visibilitychange', onVisibility);
      motion.removeEventListener('change', onMotionChange);
      layer.removeEventListener('pointerdown', finish);
    };
  }, [onComplete]);
  return <div ref={overlay} className="launch-overlay" data-phase="preparing" role="status" aria-label="Opening Muse AI">
    <div className="launch-backdrop"/>
    <div ref={wordmark} className="launch-wordmark" aria-hidden="true">
      <span className="launch-symbol"><Terminal className="launch-terminal" size={28} strokeWidth={1.8}/><MessagesSquare className="launch-chat-icon" size={28} strokeWidth={1.8}/></span>
      <span className="launch-name">{Array.from('Muse AI').map((letter,index) => <span key={index} style={{'--launch-letter-delay':`${180 + index * 70}ms`} as CSSProperties}>{letter}</span>)}</span>
    </div>
  </div>;
}
