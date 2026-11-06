import type { WorkMediaMetadata } from '../shared/work-media-types';
export const WORK_MEDIA_LIMITS: Readonly<{maxBytes:number;maxDuration:number;maxDimension:number;maxStreams:number;maxDerivativeBytes:number;maxWaveformSamples:number}>;
export function normalizeMediaProbe(raw:unknown,capabilities?:{decoders?:string[]}):WorkMediaMetadata;
export function mediaIdentityMatches(original:{hash:string;bytes:number},replacement:{hash:string;bytes:number}):boolean;
