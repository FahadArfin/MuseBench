import {useCallback, useLayoutEffect, useRef, useState, type ReactNode} from 'react';
import {MessagesSquare} from 'lucide-react';
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
    const deadline = performance.now() + 2100;
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
    const finishAfterPaint = (animation:Animation) => {
      void animation.finished.then(() => {
        if (disposed || finished) return;
        // Keep one fully landed frame before revealing the real sidebar title.
        frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish); });
      }, () => { if (!disposed) finish(); });
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
    later(finish, 2100);
    const begin = () => {
      if (disposed || finished) return;
      if (reduce() || document.hidden) { finish(); return; }
      // Measure before scaling so the cursor can follow actual glyph advances,
      // including the space. Keep the full title in layout throughout typing.
      const box = mark.getBoundingClientRect();
      const letters = Array.from(mark.querySelectorAll<HTMLElement>('.launch-name>span'));
      const cursor = mark.querySelector<HTMLElement>('.launch-cursor')!;
      const advances = letters.map(letter => letter.getBoundingClientRect().right - box.left + 1.5);
      const scale = Math.min(2.85, (innerWidth - 64) / (box.width + 9));
      const x = (innerWidth - box.width * scale) / 2;
      const y = (innerHeight - box.height * scale) / 2;
      const origin = `translate(${x}px, ${y}px) scale(${scale})`;
      mark.style.transform = origin;
      layer.dataset.phase = 'typing';
      try {
        animate(mark, [{opacity:0}, {opacity:1}], {duration:160, easing:'ease-out'});
        animate(mark.querySelector('.launch-terminal path')!, [{strokeDashoffset:1}, {strokeDashoffset:0}], {duration:220, easing:'cubic-bezier(.4,0,.2,1)'});
        // A restrained cadence, with a little breathing room before "AI".
        const beats = [180, 238, 292, 352, 410, 490, 556];
        letters.forEach((letter, index) => later(() => {
          if (disposed || finished) return;
          try {
            cursor.style.transform = `translateX(${advances[index]}px)`;
            animate(letter, [{opacity:0}, {opacity:1}], {duration:90, easing:'ease-out'});
          } catch { finish(); }
        }, beats[index]));
        later(() => {
          if (!disposed && !finished) {
            try { animate(cursor, [{opacity:1}, {opacity:0}], {duration:100}); }
            catch { finish(); }
          }
        }, 720);
      } catch { finish(); return; }
      later(() => {
        if (disposed || finished) return;
        try {
          // Both product sidebars stay mounted; the first match can be the hidden one.
          const target = Array.from(document.querySelectorAll<HTMLElement>('[data-launch-brand="personal"]'))
            .find(brand => brand.getBoundingClientRect().width > 0);
          const text = target?.querySelector<HTMLElement>('.typed-text');
          const targetBox = target?.getBoundingClientRect();
          const textBox = text?.getBoundingClientRect();
          // A busy cold renderer may consume some of the presentation budget.
          // Shorten the flight as a whole instead of cutting it off mid-frame.
          const available = Math.max(0, deadline - performance.now() - 100);
          // Narrow/collapsed sidebars have no visible title; fade gracefully in place.
          if (!targetBox || !textBox || !targetBox.width || !textBox.width || targetBox.right <= 0 || targetBox.left >= innerWidth || available < 240) {
            layer.dataset.phase = 'fading';
            finishAfterPaint(animate(layer, [{opacity:1}, {opacity:0}], {duration:Math.min(240, available)}));
            return;
          }
          layer.dataset.phase = 'moving';
          const targetStyle = getComputedStyle(target!), textStyle = getComputedStyle(text!);
          const destination = `translate(${targetBox.left}px, ${targetBox.top}px) scale(1)`;
          // Start at rest, accelerate, and settle. A pure ease-out would launch
          // toward the corner at full speed and make the mark feel disconnected.
          const travel = {duration:Math.min(740, available), easing:'cubic-bezier(.65, 0, .22, 1)'};
          const pace = travel.duration / 740;
          // The sidebar uses a 28px icon beside smaller type. Scaling the whole
          // wordmark to its font size would leave a visible jump at handoff.
          const flight = animate(mark, [
            {transform:origin, color:'#1877f2', fontSize:'17px', fontWeight:'500', lineHeight:'17px', gap:'5px', height:'28px'},
            {transform:destination, color:textStyle.color, fontSize:textStyle.fontSize, fontWeight:textStyle.fontWeight, lineHeight:`${textBox.height}px`, gap:targetStyle.columnGap, height:`${targetBox.height}px`},
          ], travel);
          animate(layer.querySelector('.launch-symbol')!, [{width:'20px'}, {width:'28px'}], travel);
          animate(layer.querySelector('.launch-backdrop')!, [{opacity:1}, {opacity:0}], {duration:560*pace, delay:100*pace, easing:'cubic-bezier(.4, 0, .2, 1)'});
          animate(layer.querySelector('.launch-terminal')!, [{opacity:1}, {opacity:0}], {duration:160*pace, delay:530*pace});
          animate(layer.querySelector('.launch-chat-icon')!, [{opacity:0}, {opacity:1}], {duration:160*pace, delay:530*pace});
          finishAfterPaint(flight);
        } catch { finish(); }
      }, 850);
    };
    // The bundled brand font is already fetching through CSS. Bound this wait so a
    // damaged font/cache cannot hold the launch screen; flight uses real DOM bounds.
    Promise.race([document.fonts.load('500 17px "Inter Variable"'), new Promise(resolve => later(() => resolve(null), 100))])
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
      <span className="launch-symbol"><svg className="launch-terminal" width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="m8 8 6 6-6 6" pathLength="1" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"/></svg><MessagesSquare className="launch-chat-icon" size={28} strokeWidth={1.8}/></span>
      <span className="launch-name">{Array.from('Muse AI').map((letter,index) => <span key={index}>{letter}</span>)}</span>
      <span className="launch-cursor"/>
    </div>
  </div>;
}
