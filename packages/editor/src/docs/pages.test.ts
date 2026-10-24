import { describe, expect, it } from 'vitest';
import { ASSETS, HOME, navigation, PAGES, renderPage, resolveLink, titleOf } from './pages';

describe('bundled docs', () => {
  it('include the reference, tutorials, guides and block pictures', () => {
    expect(PAGES[HOME]).toContain('# Language reference');
    expect(Object.keys(PAGES)).toContain('docs/tutorials/first-game-scratch.md');
    expect(Object.keys(ASSETS).filter((p) => p.startsWith('docs/blocks/')).length).toBeGreaterThan(
      150,
    );
    expect(Object.keys(PAGES).some((p) => p.startsWith('docs/api/'))).toBe(false);
  });

  it('lists every page in the sidebar once, with titles', () => {
    const listed = navigation().flatMap((g) => g.pages);
    expect([...listed].sort()).toEqual(Object.keys(PAGES).sort());
    expect(titleOf(HOME)).toBe('Language reference');
  });

  it('resolves links between pages, to pictures, outside and into the source', () => {
    expect(resolveLink('departures.md#d4', 'docs/reference.md')).toMatchObject({
      kind: 'page',
      path: 'docs/departures.md',
      anchor: 'd4',
    });
    expect(resolveLink('#values', 'docs/reference.md')).toMatchObject({
      kind: 'page',
      path: 'docs/reference.md',
    });
    expect(resolveLink('../reference.md', 'docs/tutorials/first-game-pico8.md')).toMatchObject({
      path: 'docs/reference.md',
    });
    expect(resolveLink('blocks/move.svg', 'docs/reference.md').kind).toBe('asset');
    expect(resolveLink('https://example.com', 'README.md')).toEqual({
      kind: 'external',
      url: 'https://example.com',
    });
    expect(resolveLink('../CLAUDE.md', 'docs/plan.md')).toEqual({
      kind: 'source',
      path: 'CLAUDE.md',
    });
  });

  it('renders pages with heading anchors and working pictures', () => {
    const html = renderPage(HOME);
    expect(html).toContain('id="values"');
    expect(html).toMatch(/<img src="(data:image\/svg\+xml|\/)[^"]*"/);
    expect(html).not.toContain('src="blocks/');
    expect(html).toContain('href="docs.html?page=docs%2Fdepartures.md');
  });

  it('leaves no link on any page unresolved', () => {
    for (const path of Object.keys(PAGES)) {
      const html = renderPage(path);
      const bad = [...html.matchAll(/\s(?:href|src)="([^"]*)"/g)]
        .map((m) => m[1]!)
        .filter((u) => !/^(docs\.html|https?:|mailto:|\/|data:|favicon|logo)/.test(u));
      expect(bad, path).toEqual([]);
    }
  });
});
