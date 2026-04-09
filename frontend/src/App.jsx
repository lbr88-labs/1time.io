import {useEffect, useState} from 'react';
import Header from '../components/Header';
import NewMessage from '../components/NewMessage';
import SecureFileShare from '../components/SecureFileShare';
import ViewSecretMessage from '../components/ViewSecretMessage';
import ViewSecretFile from '../components/ViewSecretFile';
import {siteHost} from '../utils/siteConfig';

function normalizePath(pathname) {
  if (!pathname || pathname === '/') {
    return '/';
  }

  return pathname.replace(/\/+$/, '') || '/';
}

function getStoredShareMode() {
  if (typeof window === 'undefined') {
    return null;
  }

  const storedMode = window.sessionStorage.getItem('shareMode');
  return storedMode === 'file' || storedMode === 'text' ? storedMode : null;
}

function resolveInitialShareMode(pathname) {
  if (pathname === '/secure-file-sharing') {
    return 'file';
  }

  if (pathname === '/share-password-securely') {
    return 'text';
  }

  return getStoredShareMode() || 'text';
}

function persistShareMode(mode) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem('shareMode', mode);
}

function ShareModeNav({active, onChangeMode}) {
  return (
    <nav className="share-mode-nav" aria-label="Choose sharing mode">
      <button
        type="button"
        className={`share-mode-link ${active === 'text' ? 'share-mode-link-active' : ''}`}
        aria-pressed={active === 'text'}
        onClick={() => onChangeMode('text')}
      >
        Text Secret
      </button>
      <button
        type="button"
        className={`share-mode-link ${active === 'file' ? 'share-mode-link-active' : ''}`}
        aria-pressed={active === 'file'}
        onClick={() => onChangeMode('file')}
      >
        Secure File Sharing
      </button>
    </nav>
  );
}

function HomePage({shareMode, onChangeMode}) {
  return (
    <div className="share-flow-page">
      <ShareModeNav active={shareMode} onChangeMode={onChangeMode} />
      {shareMode === 'file' ? <SecureFileShare /> : <NewMessage />}
    </div>
  );
}

function AboutPage() {
  return (
    <div className="about-page">
      <h1>About {siteHost}</h1>
      <p className="subtitle">Secure one-time secret sharing, built for simplicity.</p>

      <div className="about-section">
        <h2>Why {siteHost}?</h2>
        <p>
          {siteHost} creates encrypted, self-destructing links for passwords, keys, notes, and small files.
          The browser encrypts the data before upload and the server never sees the plaintext.
        </p>
      </div>

      <div className="about-section">
        <h2>Security model</h2>
        <ul>
          <li>End-to-end encryption in the browser</li>
          <li>One-time access with automatic deletion</li>
          <li>Optional extra passphrase for the recipient</li>
          <li>No account required</li>
        </ul>
      </div>
    </div>
  );
}

function PrivacyPage() {
  return (
    <div className="about-page">
      <h1>Privacy Policy</h1>
      <p className="subtitle">Zero-knowledge architecture. No cookies. Minimal service logging.</p>

      <div className="about-section">
        <h2>What we store</h2>
        <ul>
          <li>Encrypted secrets or encrypted file blobs until they are read or expire</li>
          <li>Standard web server logs for operational security and abuse control</li>
          <li>No plaintext secrets and no decryption keys</li>
        </ul>
      </div>

      <div className="about-section">
        <h2>What we do not collect</h2>
        <ul>
          <li>No accounts</li>
          <li>No cookies</li>
          <li>No third-party analytics or advertising trackers</li>
        </ul>
      </div>
    </div>
  );
}

function NotFoundPage() {
  return (
    <div className="error-page">
      <h2>404</h2>
      <p>This page doesn&apos;t exist.</p>
      <a className="btn btn-primary" href="/">
        Go home
      </a>
    </div>
  );
}

function getPageTitle(pathname, shareMode) {
  switch (pathname) {
    case '/':
    case '/share-password-securely':
    case '/secure-file-sharing':
      return shareMode === 'file'
        ? `Secure File Sharing | ${siteHost}`
        : `Share Passwords Securely | ${siteHost}`;
    case '/v':
      return `Read Secret | ${siteHost}`;
    case '/f':
      return `Download File | ${siteHost}`;
    case '/about':
      return `About ${siteHost}`;
    case '/privacy':
      return `Privacy Policy | ${siteHost}`;
    default:
      return `Secure Handoff | ${siteHost}`;
  }
}

function renderPage(pathname, shareMode, onChangeMode) {
  switch (pathname) {
    case '/':
    case '/share-password-securely':
    case '/secure-file-sharing':
      return <HomePage shareMode={shareMode} onChangeMode={onChangeMode} />;
    case '/v':
      return <ViewSecretMessage />;
    case '/f':
      return <ViewSecretFile />;
    case '/about':
      return <AboutPage />;
    case '/privacy':
      return <PrivacyPage />;
    default:
      return <NotFoundPage />;
  }
}

export default function App() {
  const initialPathname = typeof window !== 'undefined' ? normalizePath(window.location.pathname) : '/';
  const [pathname, setPathname] = useState(initialPathname);
  const [shareMode, setShareMode] = useState(() => resolveInitialShareMode(initialPathname));

  useEffect(() => {
    persistShareMode(shareMode);
  }, [shareMode]);

  useEffect(() => {
    if (pathname === '/secure-file-sharing' || pathname === '/share-password-securely') {
      window.history.replaceState({}, '', '/');
      setPathname('/');
    }
  }, [pathname]);

  useEffect(() => {
    document.title = getPageTitle(pathname, shareMode);
  }, [pathname, shareMode]);

  return (
    <div className="app-layout">
      <Header />
      <main className="app-main">
        {renderPage(pathname, shareMode, setShareMode)}
      </main>
      <footer className="app-footer">
        <p className="app-footer-text">
          Originally created by{' '}
          <a href="https://github.com/shingrus" target="_blank" rel="noopener noreferrer">Igor Yermako</a>
          {' '}at{' '}
          <a href="https://github.com/shingrus/1time" target="_blank" rel="noopener noreferrer">shingrus/1time</a>.
        </p>
      </footer>
    </div>
  );
}
