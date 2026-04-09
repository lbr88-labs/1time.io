import {getEnvValue} from './env';

export const siteHostDefault = '1time.io';
export const siteHost = typeof window !== 'undefined' && window.location?.host
    ? window.location.host
    : getEnvValue('VITE_SITE_HOST', siteHostDefault);

export const siteUrl = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : `https://${siteHost}`;

export function isBlogEnabled() {
    return getEnvValue('VITE_SHOW_BLOG', 'false') !== 'false';
}

export function absoluteUrl(path = '/') {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return new URL(normalizedPath, `${siteUrl}/`).toString();
}
