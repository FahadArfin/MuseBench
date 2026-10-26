/** Modular tiles with a sparkle for added skills and capabilities. */
export function CustomizeIcon({size=18}:{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5"/>
    <path d="m17.5 2 1.4 3.1L22 6.5l-3.1 1.4-1.4 3.1-1.4-3.1L13 6.5l3.1-1.4Z"/>
  </svg>;
}
