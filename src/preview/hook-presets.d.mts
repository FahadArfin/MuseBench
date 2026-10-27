import type {CustomizeCommand,HookPresetState} from '../shared/customize-types';
export function createPreviewHookPresets():{snapshot():Promise<HookPresetState>;dispatch(command:CustomizeCommand):Promise<HookPresetState|null>};
