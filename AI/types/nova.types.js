/**
 * @typedef {'idle'|'hello'|'thinking'|'searching'|'talking'|'happy'|'confused'|'sleeping'|'wave'|'reading'|'typing'|'celebrate'|'dance'|'create'} NovaState
 * @typedef {'user'|'assistant'|'system'} NovaMessageRole
 * @typedef {{id:string, role:NovaMessageRole, text:string, createdAt:number, status?:'sent'|'error', actions?:Array<{id:string,label:string,icon?:string}>}} NovaMessage
 * @typedef {{key:string, label:string, path:string, title:string}} NovaPageContext
 * @typedef {{state:NovaState, isChatOpen:boolean, isLoading:boolean, error:string|null, speech:string, messages:NovaMessage[], context:NovaPageContext}} NovaStoreState
 * @typedef {{text:string, requiresSearch?:boolean, suggestions?:string[]}} NovaApiResponse
 */

export const NOVA_STATES = Object.freeze([
  'idle', 'hello', 'thinking', 'searching', 'talking', 'happy', 'confused', 'sleeping',
  'wave', 'reading', 'typing', 'celebrate', 'dance', 'create'
]);

export function isNovaState(value) {
  return NOVA_STATES.includes(value);
}
