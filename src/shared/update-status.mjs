/** Main-process restart observations. Do not traverse transcripts or artifacts. */
export function updateStateFlags(state){
 const runtime=state.runtime,task=state.task;
 return{busy:!!state.busy,runtime:{status:runtime?.status??null,operationBusy:!!runtime?.operationBusy,childrenBusy:!!runtime?.childrenBusy,cleanup:runtime?.cleanup??null,pending:!!runtime?.pending},task:{check:{status:task?.check?.status??null},validationRun:{status:task?.validationRun?.status??null},goal:{driver:{armed:!!task?.goal?.driver?.armed}}}};
}
