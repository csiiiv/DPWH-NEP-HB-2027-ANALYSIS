// Share pages are static entrypoints for crawlers. In-app hash links remain valid.
export function highlightShareUrl(storyId, pageUrl = window.location.href) {
  if (!/^[a-z0-9-]+$/.test(storyId)) throw new Error('Invalid highlight story identifier');
  const current = new URL(pageUrl);
  return new URL('share/' + storyId + '/', current.origin + current.pathname).href;
}

export function currentShareUrl(pageUrl = window.location.href) {
  const current = new URL(pageUrl);
  const hash = current.hash.replace(/^#\/?/, '');
  const [route, query = ''] = hash.split('?');
  const story = new URLSearchParams(query).get('story');
  if (route === 'highlights' && story && /^[a-z0-9-]+$/.test(story)) {
    return highlightShareUrl(story, pageUrl);
  }
  return current.href;
}
