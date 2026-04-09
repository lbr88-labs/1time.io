export default function Header() {
    return (
        <header className="app-header">
            <a href="/" className="app-logo" aria-label="Go to the home page">
                <span className="app-brand-mark" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <rect x="5" y="10" width="14" height="10" rx="3" fill="currentColor" />
                        <path d="M8 10V7.5a4 4 0 1 1 8 0V10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                        <circle cx="12" cy="15" r="1.5" fill="#fff" />
                    </svg>
                </span>
                <span className="app-brand-copy">
                    <span className="app-brand-title">Secure Handoff</span>
                    <span className="app-brand-subtitle">Encrypted one-time links</span>
                </span>
            </a>
        </header>
    );
}
