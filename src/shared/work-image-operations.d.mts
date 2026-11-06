import type {SceneNode,ImageAdjustments} from './work-document-types';
export const defaultImageAdjustments:Required<ImageAdjustments>;
export function adjustImage(node:SceneNode,patch:ImageAdjustments):SceneNode;
export function cropImage(node:SceneNode,crop:NonNullable<ImageAdjustments['crop']>):SceneNode;
export function resetImage(node:SceneNode):SceneNode;
export function imageFilter(image?:ImageAdjustments):string;
