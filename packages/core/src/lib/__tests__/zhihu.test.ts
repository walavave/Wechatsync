import { describe, expect, it } from 'vitest'
import { ZhihuAdapter, transformZhihuMath } from '../../adapters/platforms/zhihu'
import type { RuntimeInterface } from '../../runtime/interface'
import { markdownToHtml } from '../turndown'

describe('Zhihu formulas', () => {
  it('converts inline SVG formulas to native equation placeholders', () => {
    const html = '<p>公式 <span class="katex-inline" data-math-display="false" data-math-raw="x^2 &amp; y"><svg><path /></svg></span>。</p>'

    expect(transformZhihuMath(html)).toBe(
      '<p>公式 <img class="Formula-image" data-eeimg="true" eeimg="1" src="https://www.zhihu.com/equation?tex=x%5E2%20%26%20y" alt="x^2 &amp; y">。</p>'
    )
  })

  it('keeps display formulas in their own paragraph', () => {
    const html = '<p class="katex-block" data-math-display="true" data-math-raw="\\frac{a}{b}"><svg><path /></svg></p>'

    expect(transformZhihuMath(html)).toBe(
      '<p><img class="Formula-image" data-eeimg="true" eeimg="1" src="https://www.zhihu.com/equation?tex=%5Cdisplaystyle%20%5Cfrac%7Ba%7D%7Bb%7D" alt="\\frac{a}{b}" style="display: block; margin: 0 auto; max-width: 100%;"></p>'
    )
  })

  it('preserves data-eeimg through the complete Zhihu transform', () => {
    const adapter = new ZhihuAdapter() as unknown as {
      transformContent: (content: string) => string
    }
    const result = adapter.transformContent(
      '<p class="katex-block" data-math-display="true" data-math-raw="E=mc^2"><svg style="width: 8ex"><path /></svg></p>'
    )

    expect(result).toContain('class="Formula-image"')
    expect(result).toContain('data-eeimg="true"')
    expect(result).toContain('eeimg="1"')
    expect(result).toContain('src="https://www.zhihu.com/equation?tex=%5Cdisplaystyle%20E%3Dmc%5E2"')
    expect(result).toContain('alt="E=mc^2"')
    expect(result).toContain('style="display: block; margin: 0 auto; max-width: 100%;"')
    expect(result).not.toContain('src=""')
    expect(result).not.toContain('<svg')
    expect(result).not.toContain('data-math-raw')
    expect(result).not.toContain('<figure>')
  })

  it('submits a non-empty native equation URL in the draft PATCH request', async () => {
    let draftContent = ''
    const runtime = {
      type: 'extension',
      fetch: async (url: string, options?: RequestInit) => {
        if (url === 'https://zhuanlan.zhihu.com/api/articles/drafts') {
          return new Response(JSON.stringify({ id: 'draft-id' }))
        }
        if (url === 'https://zhuanlan.zhihu.com/api/articles/draft-id/draft') {
          draftContent = JSON.parse(String(options?.body)).content
          return new Response(null, { status: 204 })
        }
        throw new Error(`Unexpected request: ${url}`)
      },
      cookies: {},
      storage: {},
      session: {},
      dom: {},
    } as unknown as RuntimeInterface
    const adapter = new ZhihuAdapter()
    await adapter.init(runtime)

    const markdown = [
      '公式如下：',
      '',
      '$$',
      'm_{local}=z_{t+j+1}-z_{t+j}, m_{gloabl}=z_{goal}-z_{t+j} (j \\in [0,4])',
      '$$',
    ].join('\n')
    const result = await adapter.publish({
      title: 'Formula test',
      markdown,
      html: markdownToHtml(markdown),
    })

    expect(result.success).toBe(true)
    expect(draftContent).toContain('src="https://www.zhihu.com/equation?tex=%5Cdisplaystyle%20m_%7Blocal%7D%3Dz_%7Bt%2Bj%2B1%7D-z_%7Bt%2Bj%7D%2C%20m_%7Bgloabl%7D%3Dz_%7Bgoal%7D-z_%7Bt%2Bj%7D%20(j%20%5Cin%20%5B0%2C4%5D)"')
    expect(draftContent).toContain('alt="m_{local}=z_{t+j+1}-z_{t+j}, m_{gloabl}=z_{goal}-z_{t+j} (j \\in [0,4])"')
    expect(draftContent).toContain('style="display: block; margin: 0 auto; max-width: 100%;"')
    expect(draftContent).not.toContain('src=""')
    expect(draftContent).not.toContain('<svg')
    expect(draftContent).not.toContain('<p>$$</p>')
  })
})
