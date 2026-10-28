import {useId} from 'react';

// Keep the order stable: saved profiles use mascot-0 through mascot-11.
export const museAvatarPresets = [
  {name:'Ocean',personality:'Classic',colors:['#59b9fa','#2266c4'],expression:'smile',accessory:'none'},
  {name:'Violet',personality:'Stargazer',colors:['#b29af6','#7050b5'],expression:'calm',accessory:'star'},
  {name:'Rose',personality:'Joy',colors:['#f3a3bc','#c25486'],expression:'happy',accessory:'none'},
  {name:'Coral',personality:'Hello',colors:['#f8ad88','#d46b57'],expression:'wink',accessory:'wave'},
  {name:'Amber',personality:'Thinker',colors:['#f5cb79','#c08b39'],expression:'smile',accessory:'glasses'},
  {name:'Mint',personality:'Sprout',colors:['#9bd9b3','#45977e'],expression:'happy',accessory:'leaf'},
  {name:'Teal',personality:'Listener',colors:['#71c9cf','#287b91'],expression:'calm',accessory:'headphones'},
  {name:'Sky',personality:'Daydream',colors:['#a7daf6','#578fca'],expression:'smile',accessory:'beanie'},
  {name:'Indigo',personality:'Explorer',colors:['#8f9beb','#4b55a2'],expression:'curious',accessory:'stars'},
  {name:'Plum',personality:'Charmed',colors:['#d8a8d5','#955f9d'],expression:'wink',accessory:'bow'},
  {name:'Slate',personality:'Focus',colors:['#a6bdcb','#557487'],expression:'smile',accessory:'square-glasses'},
  {name:'Sand',personality:'Cozy',colors:['#e2ccaa','#b29570'],expression:'calm',accessory:'scarf'},
] as const;

export function museAvatarIndex(seed:string) {
  const preset = /^mascot-(\d+)$/.exec(seed);
  const presetIndex = preset ? Number(preset[1]) : NaN;
  return Number.isFinite(presetIndex) ? presetIndex % museAvatarPresets.length : Array.from(seed).reduce((hash,char)=>(Math.imul(hash,31)+char.codePointAt(0)!)>>>0,0) % museAvatarPresets.length;
}

export function MuseAvatar({variant,size=32}:{variant:number;size?:number}) {
  const id = useId(), {expression,accessory} = museAvatarPresets[variant];
  const glasses = accessory === 'glasses' || accessory === 'square-glasses';
  return <svg className="muse-mascot" width={size} height={size} viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-hood`} x1="24" y1="15" x2="58" y2="78" gradientUnits="userSpaceOnUse"><stop stopColor="#fffdf7"/><stop offset=".6" stopColor="#f4eee2"/><stop offset="1" stopColor="#dbd5cb"/></linearGradient>
      <linearGradient id={`${id}-face`} x1="32" y1="27" x2="48" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor="#f6e5cc"/><stop offset="1" stopColor="#e7c9a4"/></linearGradient>
      <radialGradient id={`${id}-light`}><stop stopColor="#fff" stopOpacity=".28"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></radialGradient>
    </defs>
    <circle cx="23" cy="16" r="42" fill={`url(#${id}-light)`}/>
    <circle cx="67" cy="60" r="28" stroke="#fff" strokeOpacity=".09" strokeWidth="12"/>
    <ellipse cx="41" cy="76" rx="26" ry="9" fill="#172b49" opacity=".14"/>
    <path d="M15 71V39C15 22 24 13 40 13s25 9 25 26v32c0 13-50 13-50 0Z" fill={`url(#${id}-hood)`} stroke="#fffdf7" strokeWidth="2.8"/>
    <path d="M20 71c1-7 6-10 12-11m16 0c6 1 11 4 12 11" stroke="#d1c7b7" strokeOpacity=".55" strokeWidth="1.5" strokeLinecap="round"/>
    <ellipse cx="40" cy="42" rx="18.5" ry="21.5" fill={`url(#${id}-face)`}/>
    <path d="M26 33c2-7 7-10 14-10" stroke="#fff8e9" strokeOpacity=".8" strokeWidth="2" strokeLinecap="round"/>
    <ellipse cx="28" cy="47" rx="3.5" ry="2" fill="#df967e" opacity=".42"/>
    <ellipse cx="52" cy="47" rx="3.5" ry="2" fill="#df967e" opacity=".42"/>
    <g stroke="#43372f" strokeWidth="2.1" strokeLinecap="round">
      {expression === 'happy' ? <><path d="M29 41q3-5 6 0"/><path d="M45 41q3-5 6 0"/></>
        : expression === 'calm' ? <><path d="M29 40q3 4 6 0"/><path d="M45 40q3 4 6 0"/></>
        : <><ellipse cx="32" cy="40" rx="1.8" ry="2.6" fill="#43372f" stroke="none"/>{expression === 'wink' ? <path d="M45 40q3-3 6 0"/> : <ellipse cx="48" cy="40" rx="1.8" ry="2.6" fill="#43372f" stroke="none"/>}</>}
      {expression === 'curious' && <path d="M45 33q3-2 6 0" strokeWidth="1.5"/>}
      {expression === 'happy' ? <path d="M35 48q5 8 10 0Z" fill="#775248" stroke="#775248" strokeWidth="1"/>
        : expression === 'curious' ? <ellipse cx="40" cy="50" rx="2" ry="2.5" stroke="#886353" strokeWidth="1.5"/>
        : <path d="M36 49q4 4 8 0" stroke="#886353" strokeWidth="1.7"/>}
    </g>
    {glasses && <g stroke={accessory === 'glasses'?'#9b6436':'#425d70'} strokeWidth="2" fill="#fff" fillOpacity=".12">
      {accessory === 'glasses' ? <><circle cx="31" cy="40" r="7"/><circle cx="49" cy="40" r="7"/></> : <><rect x="24" y="34" width="14" height="12" rx="4"/><rect x="42" y="34" width="14" height="12" rx="4"/></>}
      <path d="M38 39q2-2 4 0M24 38l-3-1m35 1 3-1" fill="none"/>
    </g>}
    {accessory === 'headphones' && <g stroke="#314c65" strokeWidth="3.5"><path d="M12 43v-7a28 28 0 0156 0v7"/><rect x="10" y="39" width="8" height="17" rx="4" fill="#e0f0ed"/><rect x="62" y="39" width="8" height="17" rx="4" fill="#e0f0ed"/></g>}
    {accessory === 'beanie' && <><path d="M17 30c1-15 9-22 23-22s22 7 23 22" fill="#b7d6ec" stroke="#fff8ef" strokeWidth="2"/><path d="M29 11 26 26m14-17v17m11-15 3 15" stroke="#7fa7c8" strokeWidth="1.8" strokeLinecap="round"/><rect x="16" y="25" width="48" height="9" rx="4.5" fill="#dae9ee" stroke="#fff8ef" strokeWidth="2"/><circle cx="40" cy="8" r="5" fill="#f7f4e9"/></>}
    {accessory === 'leaf' && <g stroke="#edf8e8" strokeWidth="1.7" strokeLinejoin="round"><path d="M42 19C29 21 28 10 29 7c10 0 15 4 13 12Z" fill="#6a9c64"/><path d="M42 19c-1-10 7-14 15-12 0 9-5 15-15 12Z" fill="#9bc581"/></g>}
    {(accessory === 'star' || accessory === 'stars') && <g fill="#ffe6a1" stroke="#fff6d7" strokeWidth="1.5" strokeLinejoin="round"><path d="m60 14 2.4 5.2 5.6.8-4 4 .9 5.6-4.9-2.7-5 2.7 1-5.6-4-4 5.6-.8Z"/>{accessory === 'stars'&&<path d="m15 30 1.5 3.3 3.6.5-2.6 2.5.6 3.6-3.1-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5Z"/>}</g>}
    {accessory === 'bow' && <g fill="#bd75a7" stroke="#ffe2ed" strokeWidth="1.7" strokeLinejoin="round"><path d="M55 21c-12-13-17-2-5 5-5 12 12 12 11-2l-6-3Z"/><circle cx="54" cy="24" r="3.5" fill="#ebacd0"/></g>}
    {accessory === 'scarf' && <><path d="m27 65-2 16 10 1 3-17" fill="#ba8161" stroke="#fff2dd" strokeWidth="1.5"/><path d="M22 59c12 7 24 7 36 0v8c-12 6-24 6-36 0Z" fill="#d3a17c" stroke="#fff2dd" strokeWidth="1.5"/><path d="M29 64v5m9-3v5m9-5v4" stroke="#b7805d" strokeWidth="1.5"/></>}
    {accessory === 'wave' && <g><path d="M60 69c10-1 13-8 10-16" stroke="#fffdf7" strokeWidth="11" strokeLinecap="round"/><ellipse cx="69" cy="50" rx="5" ry="7" transform="rotate(-16 69 50)" fill="#ead1af" stroke="#fff6e6" strokeWidth="1.5"/></g>}
  </svg>;
}
