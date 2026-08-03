import { describe, expect, it, vi } from 'vitest'
import {
  getBlogAdminEntryLocation,
  loadBlogAdminEntryPayload,
  resolveBlogAdminCoverUrl,
} from '../src/content/blog-admin-cover'

describe('blog admin cover extraction', () => {
  const pageUrl = 'http://localhost:4321/blog/admin/content/essay/_edit/notes/26-7-29?panel=info'

  it('derives the editor API endpoint from a nested entry route', () => {
    expect(getBlogAdminEntryLocation(pageUrl)).toEqual({
      apiUrl: 'http://localhost:4321/blog/api/admin/content/entry/?collection=essay&entryId=notes%2F26-7-29',
      collection: 'essay',
      entryId: 'notes/26-7-29',
    })
  })

  it('resolves a source-relative cover through the blog content-assets route', () => {
    expect(resolveBlogAdminCoverUrl(
      './26-7-29-assets/snap.webp',
      'src/content/essay/notes/26-7-29.md',
      pageUrl,
    )).toBe('http://localhost:4321/blog/content-assets/essay/notes/26-7-29-assets/snap.webp')
  })

  it.each([
    ['public/essay/26-7-31.png', 'http://localhost:4321/blog/essay/26-7-31.png'],
    ['/public/essay/26-7-31.png', 'http://localhost:4321/blog/essay/26-7-31.png'],
    ['/essay/26-7-31.png', 'http://localhost:4321/blog/essay/26-7-31.png'],
    ['/blog/essay/26-7-31.png', 'http://localhost:4321/blog/essay/26-7-31.png'],
  ])('resolves public cover %s through the blog deployment base', (cover, expected) => {
    expect(resolveBlogAdminCoverUrl(
      cover,
      'src/content/essay/26-7-31.md',
      pageUrl,
    )).toBe(expected)
  })

  it('loads the saved cover while the article info panel is closed', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      payload: {
        relativePath: 'src/content/essay/26-7-29.md',
        values: { cover: './26-7-29-assets/snap.webp' },
      },
    }))) as unknown as typeof fetch

    const payload = await loadBlogAdminEntryPayload(pageUrl, fetchImpl)

    expect(payload?.values?.cover).toBe('./26-7-29-assets/snap.webp')
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://localhost:4321/blog/api/admin/content/entry/?collection=essay&entryId=notes%2F26-7-29',
      expect.objectContaining({ credentials: 'include' }),
    )
  })
})
