import { describe, expect, it, vi } from 'vitest'
import { applyMathJaxSvgLayout, normalizeMathJaxTex, reflectSvgPathData, reflectSvgTransform } from '../src/editor/mathjax.ts'

describe('MathJax SVG reflection', () => {
  it('bakes the y-axis reflection into path coordinates', () => {
    expect(reflectSvgPathData('M 10 -20 C 30 40 50 -60 70 80 V -90 H 100 Z'))
      .toBe('M 10 20 C 30 -40 50 60 70 -80 V 90 H 100 Z')
  })

  it('reflects arc rotation, sweep and endpoint', () => {
    expect(reflectSvgPathData('M0 0 A 10 20 30 0 1 40 -50'))
      .toBe('M 0 0 A 10 20 -30 0 0 40 50')
  })

  it('conjugates nested translations and matrices', () => {
    expect(reflectSvgTransform('translate(120, -30) matrix(1 2 3 4 5 6) rotate(15 4 -8)'))
      .toBe('translate(120 30) matrix(1 -2 -3 4 5 -6) rotate(-15 4 8)')
  })
})

describe('MathJax SVG layout', () => {
  it('preserves the natural MathJax size for inline formulas', () => {
    const setProperty = vi.fn()
    const removeAttribute = vi.fn()
    const svg = {
      style: {
        minWidth: '4.23ex',
        display: '',
        flexShrink: '',
        width: '',
        setProperty,
      },
      getAttribute: vi.fn(() => '99ex'),
      removeAttribute,
    } as unknown as SVGSVGElement

    applyMathJaxSvgLayout(svg)

    expect(removeAttribute).toHaveBeenCalledWith('width')
    expect(svg.style.display).toBe('initial')
    expect(svg.style.width).toBe('4.23ex')
    expect(svg.style.flexShrink).toBe('0')
    expect(setProperty).toHaveBeenCalledWith('max-width', '300vw', 'important')
  })

  it('omits quad spacing from MathJax SVG input', () => {
    expect(normalizeMathJaxTex('a\\quad b \\qquad c')).toBe('a b \\qquad c')
  })

  it('prevents WeChat from expanding spacing after mathematical commas', () => {
    expect(normalizeMathJaxTex('a,b')).toBe('a\\mathord{,}b')
    expect(normalizeMathJaxTex(String.raw`u=\frac{1,2,\dots,N}{N+1},q_{\mathcal{N}}=\text{Normal}(0,1).\text{icdf}(u)`))
      .toBe(String.raw`u=\frac{1\mathord{,}2\mathord{,}\dots\mathord{,}N}{N+1}\mathord{,}q_{\mathcal{N}}=\text{Normal}(0\mathord{,}1).\text{icdf}(u)`)
  })
})
