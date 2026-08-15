/**
 * @typedef {'idle'|'hello'|'thinking'|'searching'|'talking'|'happy'|'confused'|'sleeping'} NovaState
 * @typedef {'user'|'assistant'|'system'} NovaMessageRole
 * @typedef {{id:string, role:NovaMessageRole, text:string, createdAt:number, status?:'sent'|'error'}} NovaMessage
 * @typedef {{key:string, label:string, path:string, title:string}} NovaPageContext
 * @typedef {{state:NovaState, isChatOpen:boolean, isLoading:boolean, error:string|null, speech:string, messages:NovaMessage[], context:NovaPageContext}} NovaStoreState
 * @typedef {{text:string, requiresSearch?:boolean, suggestions?:string[]}} NovaApiResponse
 */

export const NOVA_STATES = Object.freeze([
  'idle', 'hello', 'thinking', 'searching', 'talking', 'happy', 'confused', 'sleeping'
]);

export function isNovaState(value) {
  return NOVA_STATES.includes(value);
}

