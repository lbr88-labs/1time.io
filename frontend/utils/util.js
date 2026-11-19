import {
    ProtocolConstants,
    buildSecretLink as buildProtocolSecretLink,
    decryptSecretMessage,
    encryptSecretMessage,
    getRandomString,
    hashSecretKey,
} from './protocol.mjs';
import {getEnvValue, isDevelopmentEnv} from './env';

export var Constants = {
    ...ProtocolConstants,
    isDebug: isDevelopmentEnv(),
    apiBaseUrl: getEnvValue('VITE_API_URL', '/api/'),
    maxFileSizeBytes: 10 * 1024 * 1024,
};

export const SHARE_DURATION_OPTIONS = [
    {value: 1, label: '1 day'},
    {value: 3, label: '3 days'},
    {value: 7, label: '7 days'},
    {value: 30, label: '30 days'},
];

export const MAX_VIEW_OPTIONS = [
    {value: 1, label: '1 open'},
    {value: 2, label: '2 opens'},
    {value: 3, label: '3 opens'},
    {value: 5, label: '5 opens'},
];

export {decryptSecretMessage, encryptSecretMessage, getRandomString, hashSecretKey};

export function buildSecretLink(randomString, newId) {
    return buildProtocolSecretLink(window.location.origin, randomString, newId);
}

export function buildFileLink(randomString, newId) {
    return `${window.location.origin}/f/#${randomString}${newId}`;
}

export function buildAuditLink(kind, auditRandomKey, newId) {
    const kindPrefix = kind === 'file' ? 'f' : 't';
    return `${window.location.origin}/a/#${kindPrefix}${auditRandomKey}${newId}`;
}

export async function createSecretLink(secretMessage, options = {}) {
    const {
        secretKey = '',
        durationDays = Constants.defaultDuration,
        maxViews = 1,
        auditEnabled = false,
    } = options;

    if (!secretMessage) {
        throw new Error('Secret message is required');
    }

    const randomKey = getRandomString(Constants.randomKeyLen);
    const fullSecretKey = secretKey + randomKey;
    const {encryptedMessage, hashedKey} = await encryptSecretMessage(secretMessage, fullSecretKey);
    const auditRandomKey = auditEnabled ? getRandomString(Constants.randomKeyLen) : '';
    const auditHashedKey = auditEnabled ? await hashSecretKey(auditRandomKey) : '';

    const data = await postJson('saveSecret', {
        secretMessage: encryptedMessage,
        hashedKey,
        duration: durationDays * 86400,
        auditEnabled,
        auditHashedKey,
        maxViews,
    });

    if (data.status !== 'ok' || !data.newId) {
        throw new Error('Failed to create secret link');
    }

    return {
        randomKey,
        newId: data.newId,
        link: buildSecretLink(randomKey, data.newId),
        auditLink: auditEnabled ? buildAuditLink('text', auditRandomKey, data.newId) : '',
        auditEnabled,
    };
}

export async function postJson(path, payload) {
    const response = await fetch(`${Constants.apiBaseUrl}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
}

export async function copyTextToClipboard(text) {
    if (!text) {
        return false;
    }

    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {}
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'absolute';
    textArea.style.left = '-9999px';

    document.body.appendChild(textArea);
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    let copied = false;
    try {
        copied = document.execCommand('copy');
    } catch (error) {}

    document.body.removeChild(textArea);
    return copied;
}
