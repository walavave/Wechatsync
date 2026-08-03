import { afterEach, describe, expect, it, vi } from 'vitest'
import { WeixinAdapter } from '../../adapters/platforms/weixin'
import type { RuntimeInterface } from '../../runtime/interface'

describe('Weixin cover upload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uploads the article cover and passes the material URLs to the draft request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new Blob(['cover'], { type: 'image/jpeg' }),
      { status: 200 }
    )))

    let draftForm: URLSearchParams | undefined
    const runtime = {
      type: 'extension',
      fetch: async (url: string, options?: RequestInit) => {
        if (url.includes('action=upload_material')) {
          return new Response(JSON.stringify({
            cdn_url: 'https://mmbiz.qpic.cn/cover-original',
            cdn_235_1_url: 'https://mmbiz.qpic.cn/cover-235',
            cdn_1_1_url: 'https://mmbiz.qpic.cn/cover-square',
            cdn_url_back: 'https://mmbiz.qpic.cn/cover-backup',
            base_resp: { err_msg: 'ok', ret: 0 },
          }))
        }
        if (url.includes('operate_appmsg')) {
          draftForm = options?.body as URLSearchParams
          return new Response(JSON.stringify({ appMsgId: 'draft-id' }))
        }
        throw new Error(`Unexpected request: ${url}`)
      },
      cookies: {}, storage: {}, session: {}, dom: {},
    } as unknown as RuntimeInterface

    const adapter = new WeixinAdapter()
    await adapter.init(runtime)
    ;(adapter as any).weixinMeta = {
      token: 'token', userName: 'user', nickName: 'name', ticket: 'ticket', svrTime: 1, avatar: '',
    }

    const result = await adapter.publish({
      title: 'Cover test',
      html: '<figure><img src="https://mmbiz.qpic.cn/image" /><figcaption class="figure-caption">图片说明</figcaption></figure><p>Body</p>',
      markdown: 'Body',
      cover: 'https://example.com/cover.jpg',
    })

    expect(result.success).toBe(true)
    expect(draftForm?.get('cdn_url0')).toBe('https://mmbiz.qpic.cn/cover-original')
    expect(draftForm?.get('cdn_235_1_url0')).toBe('https://mmbiz.qpic.cn/cover-235')
    expect(draftForm?.get('cdn_1_1_url0')).toBe('https://mmbiz.qpic.cn/cover-square')
    expect(draftForm?.get('cdn_url_back0')).toBe('https://mmbiz.qpic.cn/cover-backup')
    expect(draftForm?.get('show_cover_pic0')).toBe('1')
    expect(draftForm?.get('content0')).toContain('<figcaption class="figure-caption" style="color: rgb(102, 102, 102); font-size: 14px;">图片说明</figcaption>')
  })
})
