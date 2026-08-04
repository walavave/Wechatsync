export interface BlogAdminEntryLocation {
  apiUrl: string
  collection: string
  entryId: string
}

export interface BlogAdminEntryPayload {
  relativePath?: string
  values?: {
    cover?: string
  }
}

const ADMIN_ROUTE_MARKER = '/admin/content/'

function getBlogBasePath(url: URL): string {
  const markerIndex = url.pathname.indexOf(ADMIN_ROUTE_MARKER)
  return markerIndex >= 0 ? url.pathname.slice(0, markerIndex) : ''
}

function resolvePublicCoverUrl(cover: string, url: URL): string | undefined {
  const basePath = getBlogBasePath(url)
  const publicPathMatch = cover.match(/^\/?public\/(.+)$/i)
  const publicPath = publicPathMatch?.[1]
  if (publicPath) {
    return new URL(`${basePath}/${publicPath}`, url.origin).toString()
  }

  if (!cover.startsWith('/') || cover.startsWith('//')) return undefined
  if (!basePath || cover === basePath || cover.startsWith(`${basePath}/`)) {
    return new URL(cover, url.origin).toString()
  }
  return new URL(`${basePath}${cover}`, url.origin).toString()
}

export function getBlogAdminEntryLocation(pageUrl: string): BlogAdminEntryLocation | null {
  const url = new URL(pageUrl)
  const markerIndex = url.pathname.indexOf(ADMIN_ROUTE_MARKER)
  if (markerIndex < 0) return null

  const routeParts = url.pathname
    .slice(markerIndex + ADMIN_ROUTE_MARKER.length)
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))

  const editIndex = routeParts.indexOf('_edit')
  if (editIndex !== 1 || routeParts.length < 3) return null

  const collection = routeParts[0]
  const entryId = routeParts.slice(2).join('/')
  const basePath = url.pathname.slice(0, markerIndex)
  const apiUrl = new URL(`${basePath}/api/admin/content/entry/`, url.origin)
  apiUrl.searchParams.set('collection', collection)
  apiUrl.searchParams.set('entryId', entryId)

  return { apiUrl: apiUrl.toString(), collection, entryId }
}

export function resolveBlogAdminCoverUrl(
  coverValue: string,
  relativeSourcePath: string,
  pageUrl: string,
): string | undefined {
  const cover = coverValue.trim()
  if (!cover) return undefined

  const url = new URL(pageUrl)
  if (/^(?:data|blob):/i.test(cover)) return cover
  if (/^[a-z][a-z\d+.-]*:/i.test(cover) || cover.startsWith('//')) {
    return new URL(cover, url).toString()
  }

  const publicCoverUrl = resolvePublicCoverUrl(cover, url)
  if (publicCoverUrl) return publicCoverUrl

  const normalizedSource = relativeSourcePath.trim().replace(/\\/g, '/')
  const contentMarker = 'src/content/'
  const contentIndex = normalizedSource.indexOf(contentMarker)
  if (contentIndex < 0) {
    return new URL(cover, url).toString()
  }

  const contentRelativePath = normalizedSource.slice(contentIndex + contentMarker.length)
  const sourceDirectory = contentRelativePath.includes('/')
    ? contentRelativePath.slice(0, contentRelativePath.lastIndexOf('/') + 1)
    : ''
  const basePath = getBlogBasePath(url)
  const assetBase = new URL(`${basePath}/content-assets/${sourceDirectory}`, url.origin)
  const resolved = new URL(cover, assetBase)

  const expectedPrefix = `${basePath}/content-assets/`
  if (!resolved.pathname.startsWith(expectedPrefix)) return undefined
  return resolved.toString()
}

export async function loadBlogAdminEntryPayload(
  pageUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BlogAdminEntryPayload | null> {
  const location = getBlogAdminEntryLocation(pageUrl)
  if (!location) return null

  try {
    const response = await fetchImpl(location.apiUrl, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null

    const result = await response.json() as { ok?: boolean; payload?: BlogAdminEntryPayload }
    return result.ok && result.payload ? result.payload : null
  } catch {
    return null
  }
}
