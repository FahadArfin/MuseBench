import {realpath} from 'node:fs/promises';
import path from 'node:path';
// Only call with Electron's trusted app-data folder, never a renderer path.
// MSIX hosts can present Roaming as an alias of their physical LocalCache.
export async function workDataDirectory(appDataDirectory){
 return path.join(await realpath(appDataDirectory),'work');
}
