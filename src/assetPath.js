const BASE_URL = import.meta.env.BASE_URL || '/';

export function assetPath(path) {
    const normalizedBase = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
    const normalizedPath = String(path).replace(/^\/+/, '');
    return `${normalizedBase}${normalizedPath}`;
}
