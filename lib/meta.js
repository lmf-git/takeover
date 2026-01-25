/**
 * SEO and meta tag utilities
 * @module lib/meta
 */

const isBrowser = typeof window !== 'undefined';

/**
 * Update document title
 * @param {string} title - Page title
 * @param {string} [suffix] - Optional suffix (e.g., ' | My App')
 */
export function setTitle(title, suffix = '') {
  if (isBrowser) document.title = title + suffix;
}

/**
 * Update or create a meta tag
 * @param {string} name - Meta name or property
 * @param {string} content - Meta content
 * @param {boolean} [isProperty=false] - Use property instead of name
 */
export function setMeta(name, content, isProperty = false) {
  if (!isBrowser) return;
  const attr = isProperty ? 'property' : 'name';
  let meta = document.querySelector(`meta[${attr}="${name}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attr, name);
    document.head.appendChild(meta);
  }
  meta.content = content;
}

/**
 * Set multiple meta tags at once
 * @param {Object} metas - { description: '...', 'og:title': '...' }
 */
export function setMetas(metas) {
  for (const [name, content] of Object.entries(metas)) {
    setMeta(name, content, name.startsWith('og:') || name.startsWith('twitter:'));
  }
}

/**
 * Set canonical URL
 * @param {string} url - Canonical URL
 */
export function setCanonical(url) {
  if (!isBrowser) return;
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = url;
}

/**
 * Build complete page meta with OpenGraph and Twitter cards
 * @param {Object} options - Meta options
 * @param {string} options.title - Page title
 * @param {string} [options.description] - Page description
 * @param {string} [options.image] - OG image URL
 * @param {string} [options.url] - Canonical URL
 * @param {string} [options.type='website'] - OG type
 * @param {string} [options.twitterCard='summary_large_image'] - Twitter card type
 * @param {string} [options.siteName] - Site name for OG
 * @param {string} [options.titleSuffix=''] - Suffix to add to title
 */
export function setPageMeta({
  title,
  description,
  image,
  url,
  type = 'website',
  twitterCard = 'summary_large_image',
  siteName,
  titleSuffix = ''
}) {
  if (!isBrowser) return;

  setTitle(title, titleSuffix);

  const metas = {};
  if (description) metas.description = description;
  if (title) metas['og:title'] = title;
  if (description) metas['og:description'] = description;
  if (image) metas['og:image'] = image;
  if (url) metas['og:url'] = url;
  if (type) metas['og:type'] = type;
  if (siteName) metas['og:site_name'] = siteName;
  if (twitterCard) metas['twitter:card'] = twitterCard;
  if (title) metas['twitter:title'] = title;
  if (description) metas['twitter:description'] = description;
  if (image) metas['twitter:image'] = image;

  setMetas(metas);
  if (url) setCanonical(url);
}

/**
 * Add JSON-LD structured data
 * @param {Object} data - Structured data object
 * @param {string} [id] - Optional ID for updating existing script
 */
export function setStructuredData(data, id = 'structured-data') {
  if (!isBrowser) return;
  let script = document.getElementById(id);
  if (!script) {
    script = document.createElement('script');
    script.id = id;
    script.type = 'application/ld+json';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

/**
 * Create breadcrumb structured data
 * @param {Array<{name: string, url: string}>} items - Breadcrumb items
 * @returns {Object} JSON-LD breadcrumb
 */
export function createBreadcrumb(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url
    }))
  };
}

export default { setTitle, setMeta, setMetas, setCanonical, setPageMeta, setStructuredData, createBreadcrumb };
