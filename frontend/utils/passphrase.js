function requireWebCrypto() {
    if (!globalThis.crypto?.getRandomValues) {
        throw new Error('Web Crypto API is unavailable');
    }

    return globalThis.crypto;
}

function randomIndex(size, crypto) {
    if (!Number.isInteger(size) || size <= 0) {
        throw new Error('Size must be a positive integer');
    }

    const limit = Math.floor(0x100000000 / size) * size;
    const random = new Uint32Array(1);

    while (true) {
        crypto.getRandomValues(random);
        if (random[0] < limit) {
            return random[0] % size;
        }
    }
}

function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

export async function generateShortPassphrase() {
    const crypto = requireWebCrypto();
    const {default: wordlist} = await import('./wordlist');
    const words = [];

    for (let index = 0; index < 3; index += 1) {
        words.push(capitalize(wordlist[randomIndex(wordlist.length, crypto)]));
    }

    const suffix = String(randomIndex(100, crypto)).padStart(2, '0');
    return `${words.join('-')}-${suffix}`;
}
