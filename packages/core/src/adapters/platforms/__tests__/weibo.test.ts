import { describe, expect, it } from 'vitest'
import { WeiboAdapter } from '../weibo'
import type { RuntimeInterface } from '../../../runtime/interface'

describe('Weibo authentication', () => {
  it('uses the current profile endpoint before the retired editor-page config', async () => {
    const requestedUrls: string[] = []
    const runtime = {
      type: 'extension',
      fetch: async (url: string) => {
        requestedUrls.push(url)
        return new Response(JSON.stringify({
          data: {
            user: {
              id: '12345',
              screen_name: 'Weibo User',
              avatar_large: 'https://example.com/avatar.jpg',
            },
          },
        }))
      },
      cookies: {},
      storage: {},
      session: {},
      dom: {},
    } as unknown as RuntimeInterface
    const adapter = new WeiboAdapter()
    await adapter.init(runtime)

    await expect(adapter.checkAuth()).resolves.toMatchObject({
      isAuthenticated: true,
      userId: '12345',
      username: 'Weibo User',
    })
    expect(requestedUrls).toEqual(['https://weibo.com/ajax/profile/me'])
  })

  it('does not request the retired editor page when the profile endpoint is unavailable', async () => {
    const requestedUrls: string[] = []
    const runtime = {
      type: 'extension',
      fetch: async (url: string) => {
        requestedUrls.push(url)
        return new Response(null, { status: 404 })
      },
      cookies: {},
      storage: {},
      session: {},
      dom: {},
    } as unknown as RuntimeInterface
    const adapter = new WeiboAdapter()
    await adapter.init(runtime)

    await expect(adapter.checkAuth()).resolves.toMatchObject({ isAuthenticated: false })
    expect(requestedUrls).toEqual(['https://weibo.com/ajax/profile/me'])
  })
})
