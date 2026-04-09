import React from 'react';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import App from './App';
import NewMessage from '../components/NewMessage';
import ShowNewLink from '../components/ShowNewLink';
import ViewSecretMessage from '../components/ViewSecretMessage';
import {Constants, decryptSecretMessage, encryptSecretMessage, getRandomString, hashSecretKey} from '../utils/util';

const mockClipboardWriteText = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    mockClipboardWriteText.mockResolvedValue(undefined);
    window.history.pushState({}, '', '/');
    window.sessionStorage.clear();
    global.fetch = vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({
            status: 'ok',
        }),
    }));
    window.scrollTo = vi.fn();
    Object.defineProperty(window.navigator, 'clipboard', {
        configurable: true,
        value: {
            writeText: mockClipboardWriteText,
        },
    });
});

describe('App shell', () => {
    it('rewrites the old file-sharing route to root and keeps file mode selected', async () => {
        window.history.pushState({}, '', '/secure-file-sharing/');

        render(<App />);

        expect(screen.getByText('Secure Handoff')).toBeInTheDocument();
        expect(screen.getByText('Encrypted one-time links')).toBeInTheDocument();
        expect(screen.getByText(/your file, end-to-end encrypted/i)).toBeInTheDocument();
        expect(document.title).toContain('Secure File Sharing');

        await waitFor(() => {
            expect(window.location.pathname).toBe('/');
        });
    });

    it('switches modes on the same page without changing the URL', async () => {
        const user = userEvent.setup();

        render(<App />);

        expect(screen.getByLabelText(/your secret message/i)).toBeInTheDocument();
        expect(window.location.pathname).toBe('/');

        await user.click(screen.getByRole('button', {name: /secure file sharing/i}));

        expect(screen.getByText(/your file, end-to-end encrypted/i)).toBeInTheDocument();
        expect(window.location.pathname).toBe('/');
        expect(window.sessionStorage.getItem('shareMode')).toBe('file');
    });
});

describe('NewMessage component', () => {
    it('renders the message form with always-visible options', async () => {
        const user = userEvent.setup();

        render(<NewMessage />);

        const submitButton = screen.getByRole('button', {name: /create secret link/i});
        expect(submitButton).toBeDisabled();
        expect(screen.getByLabelText(/additional passphrase/i)).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /generate one/i})).toBeInTheDocument();
        expect(screen.getByLabelText(/expire after/i)).toBeInTheDocument();

        await user.type(screen.getByLabelText(/your secret message/i), 'top secret');
        expect(submitButton).toBeEnabled();
    });

    it('submits a new secret and shows the generated link', async () => {
        const user = userEvent.setup();
        fetch.mockImplementation(async () => ({
            ok: true,
            json: async () => ({
                status: 'ok',
                newId: 'abc123',
            }),
        }));

        render(<NewMessage />);

        await user.type(screen.getByLabelText(/your secret message/i), 'ship it');
        await user.click(screen.getByRole('button', {name: /create secret link/i}));

        await waitFor(() => {
            expect(fetch.mock.calls.some(([url]) => url === '/api/saveSecret')).toBe(true);
        });

        const saveSecretCall = fetch.mock.calls.find(([url]) => url === '/api/saveSecret');
        expect(saveSecretCall).toEqual([
            '/api/saveSecret',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: expect.any(String),
            }),
        ]);

        const requestPayload = JSON.parse(saveSecretCall[1].body);
        expect(requestPayload).toEqual(expect.objectContaining({
            secretMessage: expect.any(String),
            hashedKey: expect.any(String),
            duration: Constants.defaultDuration * 86400,
        }));

        const linkInput = await screen.findByLabelText(/secret one-time link/i);
        expect(linkInput.value).toContain('/v/#');
        expect(linkInput.value).toContain('abc123');
    });
});

describe('ShowNewLink component', () => {
    it('displays the generated link without touching the clipboard automatically', async () => {
        render(<ShowNewLink newLink="http://localhost:3001/v/#AbCdEfGhIjKlMnOpQr-_testId123" onReset={vi.fn()} />);

        const linkInput = await screen.findByLabelText(/secret one-time link/i);
        expect(linkInput).toBeInTheDocument();
        expect(linkInput.value).toContain('/v/#');
        expect(linkInput.value).toContain('AbCdEfGhIjKlMnOpQr-_');
        expect(linkInput.value).toContain('testId123');
        expect(screen.getByRole('button', {name: /copy link/i})).toBeInTheDocument();
        expect(mockClipboardWriteText).not.toHaveBeenCalled();
    });

    it('loads the QR UI only after the user requests it', async () => {
        const user = userEvent.setup();

        render(
            <ShowNewLink
                newLink="http://localhost:3001/v/#AbCdEfGhIjKlMnOpQr-_testId123"
                onReset={vi.fn()}
            />,
        );

        expect(screen.queryByLabelText(/secret link qr code/i)).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', {name: /show qr code/i}));

        await screen.findByText(/scan from another device/i);
        expect(await screen.findByLabelText(/secret link qr code/i)).toBeInTheDocument();
    });
});

describe('ViewSecretMessage component', () => {
    it('shows the pre-read state with decrypt button', () => {
        render(<ViewSecretMessage />);

        expect(screen.getByText(/encrypted message/i)).toBeInTheDocument();
        expect(screen.getByRole('button', {name: /decrypt & read/i})).toBeInTheDocument();
    });

    it('loads the QR UI on the view page only after the user requests it', async () => {
        const user = userEvent.setup();
        window.history.pushState({}, '', '/v/#AbCdEfGhIjKlMnOpQr-_testId123');

        render(<ViewSecretMessage />);

        expect(screen.queryByLabelText(/secret link qr code/i)).not.toBeInTheDocument();

        await user.click(await screen.findByRole('button', {name: /show qr code/i}));

        await screen.findByText(/scan from another device/i);
        expect(await screen.findByLabelText(/secret link qr code/i)).toBeInTheDocument();
    });

    it('treats invalid view links as destroyed after submit', async () => {
        const user = userEvent.setup();

        render(<ViewSecretMessage />);

        await user.click(await screen.findByRole('button', {name: /decrypt & read/i}));

        expect(await screen.findByText(/already been read or has expired/i)).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('crypto util', () => {
    it('round-trips HKDF-derived encryption and auth for a secret', async () => {
        const fullSecretKey = 'extra-passphraseAbCd1234';
        const {encryptedMessage, hashedKey} = await encryptSecretMessage('hello hkdf', fullSecretKey);

        await expect(hashSecretKey(fullSecretKey)).resolves.toBe(hashedKey);
        await expect(decryptSecretMessage(encryptedMessage, fullSecretKey)).resolves.toBe('hello hkdf');
    });

    it('generates 20-character url-safe random keys', () => {
        const randomKey = getRandomString(Constants.randomKeyLen);

        expect(Constants.randomKeyLen).toBe(20);
        expect(randomKey).toHaveLength(20);
        expect(randomKey).toMatch(/^[A-Za-z0-9_-]+$/);
    });
});
