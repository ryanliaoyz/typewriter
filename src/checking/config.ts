export const DEFAULT_MODEL = 'gemma2:9b-instruct-q4_K_M'
export const DEFAULT_SERVER_URL = 'http://127.0.0.1:11434'
export const MODEL_PROXY_PATH = '/ollama'

type ModelEnvironment = {
  readonly VITE_OLLAMA_MODEL?: string
  readonly VITE_OLLAMA_SERVER_URL?: string
}

/** Shared by Vite's proxy and the browser; the server URL excludes /v1. */
export function readModelConfig(environment: ModelEnvironment, development: boolean) {
  const model = environment.VITE_OLLAMA_MODEL?.trim() || DEFAULT_MODEL
  const serverUrl = (environment.VITE_OLLAMA_SERVER_URL?.trim() || DEFAULT_SERVER_URL)
    .replace(/\/+$/, '')
  const url = new URL(serverUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_OLLAMA_SERVER_URL must be an HTTP(S) server URL without credentials, query, or fragment.')
  }
  return { model, serverUrl, requestUrl: development ? MODEL_PROXY_PATH : serverUrl }
}
