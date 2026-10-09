// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL, DEFAULT_SERVER_URL, readModelConfig } from './config'

describe('model configuration', () => {
  it('defaults to the selected model and loopback server, with a development-only proxy', () => {
    expect(readModelConfig({}, true)).toEqual({
      model: DEFAULT_MODEL, serverUrl: DEFAULT_SERVER_URL, requestUrl: '/ollama',
    })
    expect(readModelConfig({}, false).requestUrl).toBe(DEFAULT_SERVER_URL)
  })

  it('reads custom model and server values and removes surrounding whitespace/trailing slashes', () => {
    const environment = {
      VITE_OLLAMA_MODEL: ' custom-model ',
      VITE_OLLAMA_SERVER_URL: ' https://example.test/models/// ',
    }
    expect(readModelConfig(environment, false)).toEqual({
      model: 'custom-model', serverUrl: 'https://example.test/models', requestUrl: 'https://example.test/models',
    })
    expect(readModelConfig(environment, true).requestUrl).toBe('/ollama')
    expect(readModelConfig({ VITE_OLLAMA_MODEL: ' ', VITE_OLLAMA_SERVER_URL: '' }, false).model).toBe(DEFAULT_MODEL)
  })

  it.each(['file:///tmp/server', '/relative', 'http://user:password@localhost', 'http://localhost?a=1', 'http://localhost/#fragment'])('rejects unsafe or ambiguous server URL %s', (serverUrl) => {
    expect(() => readModelConfig({ VITE_OLLAMA_SERVER_URL: serverUrl }, true)).toThrow()
  })
})
