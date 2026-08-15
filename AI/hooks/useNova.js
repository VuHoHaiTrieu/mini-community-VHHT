import { nova } from '../store/NOVAController.js';

/**
 * Framework-neutral hook-like accessor. Components can import this instead of
 * depending on the store implementation, making a future React/Vue adapter easy.
 */
export function useNova() {
  return nova;
}

