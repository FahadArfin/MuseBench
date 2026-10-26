import {createContext} from 'react';
import type {ReactNode} from 'react';
import type {PersonalState} from '../shared/types';
import type {WorkArtifact} from '../shared/work-types';

// Optional browser-only renderers. The desktop entry has no provider.
export const BrowserPreviewContext=createContext<{
 personal?:(state:PersonalState|null)=>ReactNode;
 artifact?:(artifact:WorkArtifact,theme:string)=>string;
 siteDocument?:(url:string)=>string|undefined;
}>({});
