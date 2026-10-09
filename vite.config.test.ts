// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from 'vite'

afterEach(() => vi.unstubAllEnvs())

describe('development proxy', () => {
  it('uses the configured server, strips only the route prefix, and is absent from preview', async () => {
    vi.stubEnv('VITE_OLLAMA_SERVER_URL', 'http://127.0.0.1:12345')
    const config = await resolveConfig({}, 'serve')
    const proxy = config.server.proxy?.['/ollama']
    if (!proxy || typeof proxy === 'string') throw new Error('Missing development proxy')
    expect(proxy.target).toBe('http://127.0.0.1:12345')
    expect(proxy.changeOrigin).toBe(true)
    expect(proxy.rewrite?.('/ollama/v1/chat/completions')).toBe('/v1/chat/completions')
    expect(proxy.rewrite?.('/ollama/v1/models?name=ollama')).toBe('/v1/models?name=ollama')
    expect(config.preview.proxy).toEqual({})
  })
})
