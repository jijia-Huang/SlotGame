const EXTERNAL_URL_PATTERN = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;

export function assetUrl(path: string): string {
  if (EXTERNAL_URL_PATTERN.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }

  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

  return `${base}${normalizedPath}`;
}
