import { describe, expect, it } from 'vitest'
import { JuejinAdapter } from '../juejin'

describe('Juejin formula preprocessing', () => {
  it('preserves data-math-raw until the Markdown converter restores TeX', () => {
    const adapter = new JuejinAdapter()

    expect(adapter.preprocessConfig).toMatchObject({
      outputFormat: 'markdown',
      removeDataAttributes: false,
    })
  })
})
