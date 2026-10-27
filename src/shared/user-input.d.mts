export interface InputPrompt {kind:'input';sessionId:string;userInputId:string;turnId:string;revision:number;questions:{id:string;header:string;question:string;options:{label:string;description?:string}[];selection:{mode:'single'|'multiple';minSelections?:number;maxSelections?:number}}[]}
export interface InputAnswer {questionId:string;selectedLabel?:string;selectedLabels?:string[];freeText?:string}
export interface InputAction {sessionId:string;userInputId:string;turnId:string;revision:number;operation:'answer'|'cancel'|'engage';answers?:InputAnswer[]}
export function inputPrompt(value:unknown):InputPrompt|null;
export function validateInputAction(action:unknown):void;
export function validateInputAnswers(prompt:InputPrompt,action:InputAction):void;
export function confirmedInputText(receipt:unknown):string|null;
