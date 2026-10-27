import type {CSSProperties} from 'react';
import './typed-text.css';

// Keep the complete text in layout; only its visibility changes while typing.
export function TypedText({text,delay=300,interval=60}:{text:string;delay?:number;interval?:number}) {
  return <span className="typed-text" aria-hidden="true">{Array.from(text).map((letter,index)=><span key={index} style={{'--type-delay':`${delay+index*interval}ms`} as CSSProperties}>{letter}</span>)}</span>;
}
