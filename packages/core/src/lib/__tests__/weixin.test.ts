import { describe, expect, it } from 'vitest'
import { normalizeWeixinListItems } from '../../adapters/platforms/weixin'

describe('Weixin list normalization', () => {
  it('wraps a simple list item containing an inline formula in one paragraph', () => {
    const html = '<ol><li><span class="katex-inline"><svg></svg></span>：当前画面的视觉潜向量</li></ol>'

    expect(normalizeWeixinListItems(html)).toBe(
      '<ol><li><p><span class="katex-inline"><svg></svg></span>：当前画面的视觉潜向量</p></li></ol>'
    )
  })

  it('does not change list items that already have paragraph or block content', () => {
    const html = '<ul><li><p>已有段落</p></li><li><pre><code>code</code></pre></li></ul>'

    expect(normalizeWeixinListItems(html)).toBe(html)
  })

  it('only normalizes the inner item of a nested list', () => {
    const html = '<ul><li>父项<ul><li>子项</li></ul></li></ul>'

    expect(normalizeWeixinListItems(html)).toBe(
      '<ul><li>父项<ul><li><p>子项</p></li></ul></li></ul>'
    )
  })
})
