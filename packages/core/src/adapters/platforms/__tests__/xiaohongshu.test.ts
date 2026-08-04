import { describe, expect, it, vi } from 'vitest'
import { createXhsSignature, XiaohongshuAdapter } from '../private/xiaohongshu'
import type { RuntimeInterface } from '../../../runtime/interface'

function createRuntime(overrides: Partial<RuntimeInterface> = {}): RuntimeInterface {
  return {
    type: 'extension',
    fetch: vi.fn(async () => new Response(JSON.stringify({
      success: true,
      data: { userId: '123', userName: 'Ada', userAvatar: 'avatar.jpg' },
    }), { status: 200 })),
    cookies: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    storage: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    session: { get: vi.fn(), set: vi.fn() },
    dom: {
      parseHTML: vi.fn(),
      querySelector: vi.fn(),
      querySelectorAll: vi.fn(),
      getTextContent: vi.fn(),
      getInnerHTML: vi.fn(),
    },
    ...overrides,
  } as RuntimeInterface
}

describe('XiaohongshuAdapter', () => {
  it('creates stable web API signatures', () => {
    const signature = createXhsSignature(
      '/web_api/sns/v2/note',
      { common: { type: 'normal', title: 'test' } },
      'test-a1',
      1700000000000
    )
    expect(signature['x-t']).toBe('1700000000000')
    expect(signature['x-s']).toHaveLength(44)
    expect(signature['x-s-common']).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  it('parses the current creator user info response', async () => {
    const adapter = new XiaohongshuAdapter()
    await adapter.init(createRuntime())

    await expect(adapter.checkAuth()).resolves.toEqual({
      isAuthenticated: true,
      userId: '123',
      username: 'Ada',
      avatar: 'avatar.jpg',
    })
  })

  it('parses nested raw-fetch response envelopes', async () => {
    const adapter = new XiaohongshuAdapter()
    await adapter.init(createRuntime({
      fetch: vi.fn(async () => new Response(JSON.stringify({
        code: 0,
        data: {
          success: true,
          data: { userId: 'nested', userName: 'Nested user' },
        },
      }), { status: 200 })),
    }))

    await expect(adapter.checkAuth()).resolves.toMatchObject({
      isAuthenticated: true,
      userId: 'nested',
      username: 'Nested user',
    })
  })

  it('prefers login state stored by an open creator page', async () => {
    const fetch = vi.fn()
    const adapter = new XiaohongshuAdapter()
    await adapter.init(createRuntime({
      fetch,
      tabs: {
        query: vi.fn(async () => [{ id: 9, url: 'https://creator.xiaohongshu.com/' }]),
        create: vi.fn(),
        waitForLoad: vi.fn(),
        executeScript: vi.fn(async () => ({
          userId: 'page-user',
          userName: 'Page user',
          userAvatar: 'page-avatar.jpg',
        })),
      },
    }))

    await expect(adapter.checkAuth()).resolves.toEqual({
      isAuthenticated: true,
      userId: 'page-user',
      username: 'Page user',
      avatar: 'page-avatar.jpg',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses long-form article mode by default and keeps the full markdown', () => {
    const adapter = new XiaohongshuAdapter()
    const markdown = '正文\n\n'.repeat(700)
    const payload = adapter.createEditorPayload({ title: '一篇长文', markdown })

    expect(payload.mode).toBe('article')
    expect(payload.content).toBe(markdown.trim())
  })

  it('supports explicit image-note mode and applies Xiaohongshu limits', () => {
    const adapter = new XiaohongshuAdapter()
    const payload = adapter.createEditorPayload({
      title: '这是一个超过二十个字符的小红书图文笔记标题用于测试截断',
      category: '图文笔记',
      markdown: `${'文'.repeat(1100)}\n![one](https://img.example/1.jpg)`,
      html: '<p>正文</p><img src="https://img.example/1.jpg"><img src="https://img.example/2.jpg">',
      cover: 'https://img.example/cover.jpg',
    })

    expect(payload.mode).toBe('image')
    expect(payload.title).toHaveLength(20)
    expect(payload.content).toHaveLength(1000)
    expect(payload.content).not.toContain('![one]')
    expect(payload.imageUrls).toEqual([
      'https://img.example/1.jpg',
      'https://img.example/2.jpg',
      'https://img.example/cover.jpg',
    ])
  })

  it('uploads images and creates a private note through the API', async () => {
    const requests: Array<{ url: string; options?: RequestInit }> = []
    const fetch = vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = String(input)
      requests.push({ url, options })
      if (url.includes('/api/galaxy/user/info')) {
        return new Response(JSON.stringify({ data: { userId: '123', userName: 'Ada' } }))
      }
      if (url === 'https://img.example/1.jpg') {
        return new Response(new Blob(['image'], { type: 'image/jpeg' }))
      }
      if (url.includes('/api/media/v1/upload/web/permit')) {
        return new Response(JSON.stringify({ data: {
          uploadTempPermits: [{ fileIds: ['spectrum/file-id'], token: 'upload-token' }],
        } }))
      }
      if (url.includes('ros-upload.xiaohongshu.com')) return new Response('', { status: 200 })
      if (url.endsWith('/web_api/sns/v2/note')) {
        return new Response(JSON.stringify({ data: { id: 'note-id' } }))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    const adapter = new XiaohongshuAdapter()
    await adapter.init(createRuntime({
      fetch,
      getCookie: vi.fn(async () => 'a1-cookie'),
    }))

    const result = await adapter.publish({
      title: '图文标题',
      markdown: '正文\n![image](https://img.example/1.jpg)',
    }, { draftOnly: true })

    expect(result).toMatchObject({
      success: true,
      postId: 'note-id',
      postUrl: 'https://creator.xiaohongshu.com/new/note-manager',
      draftOnly: true,
      message: '已创建仅自己可见的小红书私密笔记',
    })
    const upload = requests.find(request => request.url.includes('ros-upload.xiaohongshu.com'))
    expect(upload?.options?.method).toBe('PUT')
    const create = requests.find(request => request.url.endsWith('/web_api/sns/v2/note'))
    const body = JSON.parse(String(create?.options?.body))
    expect(body.common.privacy_info.type).toBe(1)
    expect(body.image_info.images[0].file_id).toBe('spectrum/file-id')
    expect((create?.options?.headers as Record<string, string>)['x-s']).toHaveLength(44)
  })

  it('opens the real editor and reports a saved draft', async () => {
    const executeScript = vi.fn(async () => ({
      success: true,
      url: 'https://creator.xiaohongshu.com/publish/publish?target=article',
    }))
    const runtime = createRuntime({
      tabs: {
        query: vi.fn(async () => []),
        create: vi.fn(async () => ({ id: 7 })),
        waitForLoad: vi.fn(async () => undefined),
        executeScript,
      },
    })
    const adapter = new XiaohongshuAdapter()
    await adapter.init(runtime)

    const result = await adapter.publish({ title: '标题', markdown: '正文' })

    expect(runtime.tabs?.create).toHaveBeenCalledWith(
      'https://creator.xiaohongshu.com/publish/publish?target=article',
      true
    )
    expect(executeScript).toHaveBeenCalledOnce()
    expect(result.success).toBe(true)
    expect(result.draftOnly).toBe(true)
  })
})
