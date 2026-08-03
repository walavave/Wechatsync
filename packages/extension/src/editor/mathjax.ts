type MathJaxApi = {
  startup?: { promise?: Promise<void> }
  texReset: () => void
  tex2svg: (tex: string, options?: { display?: boolean }) => HTMLElement
}

declare global {
  interface Window {
    MathJax?: MathJaxApi | Record<string, unknown>
  }
}

let mathJaxLoadPromise: Promise<MathJaxApi> | null = null

const PATH_PARAMETER_COUNTS: Record<string, number> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7,
}

const PATH_TOKEN_PATTERN = /[AaCcHhLlMmQqSsTtVvZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g

function negateNumber(value: string): string {
  const reflected = -Number(value)
  return Object.is(reflected, -0) ? '0' : String(reflected)
}

/** Reflect SVG path geometry across the x axis without relying on SVG transforms. */
export function reflectSvgPathData(pathData: string): string {
  const tokens = pathData.match(PATH_TOKEN_PATTERN)
  if (!tokens) return pathData

  let command = ''
  let parameterIndex = 0

  return tokens.map((token) => {
    if (/^[A-Za-z]$/.test(token)) {
      command = token.toUpperCase()
      parameterIndex = 0
      return token
    }

    const parameterCount = PATH_PARAMETER_COUNTS[command]
    if (!parameterCount) return token

    const index = parameterIndex % parameterCount
    parameterIndex++

    if (command === 'A') {
      if (index === 2 || index === 6) return negateNumber(token)
      if (index === 4) return Number(token) === 0 ? '1' : '0'
      return token
    }

    const yIndexes: Record<string, number[]> = {
      M: [1], L: [1], V: [0], C: [1, 3, 5], S: [1, 3], Q: [1, 3], T: [1],
    }
    return yIndexes[command]?.includes(index) ? negateNumber(token) : token
  }).join(' ')
}

/** Conjugate an SVG transform by a y-axis reflection. */
export function reflectSvgTransform(transform: string): string {
  return transform.replace(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi, (match, name, body) => {
    const values = body.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)
    if (!values) return match

    switch (name.toLowerCase()) {
      case 'matrix':
        if (values.length >= 6) {
          values[1] = negateNumber(values[1])
          values[2] = negateNumber(values[2])
          values[5] = negateNumber(values[5])
        }
        break
      case 'translate':
        if (values.length >= 2) values[1] = negateNumber(values[1])
        break
      case 'rotate':
        values[0] = negateNumber(values[0])
        if (values.length >= 3) values[2] = negateNumber(values[2])
        break
      case 'skewx':
      case 'skewy':
        values[0] = negateNumber(values[0])
        break
    }

    return `${name}(${values.join(' ')})`
  })
}

function reflectNumericAttribute(element: Element, attribute: string): void {
  const value = element.getAttribute(attribute)
  if (value !== null && Number.isFinite(Number(value))) {
    element.setAttribute(attribute, negateNumber(value))
  }
}

function reflectSvgGeometry(root: Element): void {
  const elements = [root, ...Array.from(root.querySelectorAll('*'))]

  for (const element of elements) {
    const transform = element.getAttribute('transform')
    if (transform) element.setAttribute('transform', reflectSvgTransform(transform))

    switch (element.localName) {
      case 'path': {
        const pathData = element.getAttribute('d')
        if (pathData) element.setAttribute('d', reflectSvgPathData(pathData))
        break
      }
      case 'rect':
      case 'image': {
        const y = Number(element.getAttribute('y') || 0)
        const height = Number(element.getAttribute('height') || 0)
        if (Number.isFinite(y) && Number.isFinite(height)) {
          element.setAttribute('y', String(-(y + height)))
        }
        break
      }
      case 'circle':
      case 'ellipse':
        reflectNumericAttribute(element, 'cy')
        break
      case 'line':
        reflectNumericAttribute(element, 'y1')
        reflectNumericAttribute(element, 'y2')
        break
      case 'use':
      case 'text':
        reflectNumericAttribute(element, 'y')
        break
      case 'polygon':
      case 'polyline': {
        const points = element.getAttribute('points')?.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g)
        if (points) {
          element.setAttribute('points', points.map((point, index) => index % 2 ? negateNumber(point) : point).join(' '))
        }
        break
      }
    }
  }
}

function prepareSvgForWeChat(svg: SVGSVGElement): void {
  const rootGroup = svg.firstElementChild
  const transform = rootGroup?.getAttribute('transform')?.replace(/\s+/g, '')

  // WeChat strips MathJax's negative root transform. Bake that reflection into every
  // descendant coordinate so the formula no longer depends on a negative transform.
  if (rootGroup?.localName === 'g' && transform === 'scale(1,-1)') {
    rootGroup.removeAttribute('transform')
    reflectSvgGeometry(rootGroup)
  }

  svg.style.color = '#333333'
  if (!svg.getAttribute('fill') || svg.getAttribute('fill') === 'currentColor') {
    svg.setAttribute('fill', '#333333')
  }
}

export function applyMathJaxSvgLayout(svg: SVGSVGElement): void {
  const width = svg.style.minWidth || svg.getAttribute('width') || ''
  svg.removeAttribute('width')
  // Preserve MathJax's natural ex dimensions and baseline. Constraining an inline
  // SVG to the article width makes short formulas reserve a full line in WeChat.
  svg.style.display = 'initial'
  svg.style.setProperty('max-width', '300vw', 'important')
  svg.style.flexShrink = '0'
  svg.style.width = width
}

export function normalizeMathJaxTex(tex: string): string {
  return tex.replace(/\\quad\b/g, '')
}

async function loadMathJax(): Promise<MathJaxApi> {
  const readyApi = window.MathJax as MathJaxApi | undefined
  if (typeof readyApi?.tex2svg === 'function') return readyApi
  if (mathJaxLoadPromise) return mathJaxLoadPromise

  window.MathJax = {
    tex: { tags: 'ams' },
    svg: { fontCache: 'none' },
    startup: { typeset: false },
  }

  // MathJax publishes this browser bundle without TypeScript declarations.
  // @ts-expect-error -- side-effect bundle initializes window.MathJax
  // The full bundle embeds extensions such as boldsymbol. The smaller tex-svg
  // bundle tries to load them at runtime using document.currentScript, which is
  // unreliable in a bundled content script and produces CSP-blocked http://../ URLs.
  mathJaxLoadPromise = import('mathjax/es5/tex-svg-full.js').then(async () => {
    const api = window.MathJax as MathJaxApi
    await api.startup?.promise
    if (typeof api.tex2svg !== 'function') {
      throw new Error('MathJax tex2svg is unavailable')
    }
    return api
  }).catch((error) => {
    mathJaxLoadPromise = null
    throw error
  })

  return mathJaxLoadPromise
}

/** Render extracted TeX as self-contained SVG, matching md-main's formula output. */
export async function renderExtractedMath(root: HTMLElement): Promise<void> {
  const formulas = Array.from(root.querySelectorAll<HTMLElement>('[data-math-raw]'))
    .filter(element => !element.querySelector('svg'))
  if (formulas.length === 0) return

  const mathJax = await loadMathJax()

  for (const formula of formulas) {
    const tex = formula.dataset.mathRaw?.trim()
    if (!tex) continue

    const display = formula.dataset.mathDisplay === 'true'
    const renderTex = normalizeMathJaxTex(tex)
    mathJax.texReset()
    const mathContainer = mathJax.tex2svg(renderTex, { display })
    const svg = mathContainer.firstElementChild as SVGSVGElement | null
    if (!svg) {
      throw new Error(`MathJax did not produce SVG for: ${tex.slice(0, 80)}`)
    }

    applyMathJaxSvgLayout(svg)
    prepareSvgForWeChat(svg)

    formula.replaceChildren(svg)
    formula.classList.remove('katex-pending')
    formula.removeAttribute('contenteditable')
  }

  if (root.querySelector('.katex-pending')) {
    throw new Error('Article still contains unrendered formulas')
  }
}
