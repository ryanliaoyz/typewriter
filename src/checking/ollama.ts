import prompt from '../../prompt.txt?raw'
import { createOllamaChecker as createChecker } from './ollamaCore'

export { MAX_EDIT_PASSES, REQUEST_TIMEOUT_MS, UnusableResponseError } from './ollamaCore'

/** Browser adapter: use the repository prompt without a separate copy. */
export function createOllamaChecker(options: Omit<Parameters<typeof createChecker>[0], 'prompt'>) {
  return createChecker({ ...options, prompt })
}
