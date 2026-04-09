const metaEnv = typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env
    : {};

const processEnv = typeof process !== 'undefined' && process.env
    ? process.env
    : {};

export function getEnvValue(name, fallback = undefined) {
    if (Object.prototype.hasOwnProperty.call(metaEnv, name)) {
        return metaEnv[name];
    }

    if (name.startsWith('NEXT_PUBLIC_')) {
        const viteName = `VITE_${name.slice('NEXT_PUBLIC_'.length)}`;
        if (Object.prototype.hasOwnProperty.call(metaEnv, viteName)) {
            return metaEnv[viteName];
        }
    }

    if (Object.prototype.hasOwnProperty.call(processEnv, name)) {
        return processEnv[name];
    }

    return fallback;
}

export function isDevelopmentEnv() {
    if (typeof metaEnv.DEV !== 'undefined') {
        return Boolean(metaEnv.DEV);
    }

    return processEnv.NODE_ENV === 'development';
}
