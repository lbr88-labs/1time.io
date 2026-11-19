import '../styles/link.css';
import {useEffect, useRef, useState} from "react";
import {copyTextToClipboard} from '../utils/util';
import {createQrSvg} from '../utils/qr';
import AuditLogPanel from './AuditLogPanel';

function extractAuditLinkKey(auditLink) {
    if (!auditLink) {
        return '';
    }

    try {
        return new URL(auditLink).hash.replace(/^#/, '');
    } catch (error) {
        return '';
    }
}

export default function ShowNewLink({newLink = "", auditLink = "", auditEnabled = false, onReset}) {
    const [copiedTarget, setCopiedTarget] = useState("");
    const [isQrLoading, setIsQrLoading] = useState(false);
    const [qrSvg, setQrSvg] = useState("");
    const resetCopiedTimeoutRef = useRef(null);
    const auditLinkKey = extractAuditLinkKey(auditLink);

    useEffect(() => {
        return () => {
            if (resetCopiedTimeoutRef.current) {
                window.clearTimeout(resetCopiedTimeoutRef.current);
            }
        };
    }, []);

    const handleCopy = async (value, target) => {
        const didCopy = await copyTextToClipboard(value);
        if (didCopy) {
            setCopiedTarget(target);
            if (resetCopiedTimeoutRef.current) {
                window.clearTimeout(resetCopiedTimeoutRef.current);
            }
            resetCopiedTimeoutRef.current = window.setTimeout(() => setCopiedTarget(""), 3000);
        }
    };

    const handleReset = () => {
        if (onReset) {
            onReset();
            return;
        }

        if (typeof window !== 'undefined') {
            window.location.assign('/');
        }
    };

    const handleToggleQr = async () => {
        if (qrSvg) {
            setQrSvg("");
            return;
        }

        setIsQrLoading(true);

        try {
            setQrSvg(await createQrSvg(newLink));
        } finally {
            setIsQrLoading(false);
        }
    };

    return (
        <div className="link-display">
            {!newLink && (
                <>
                    <p className="link-display-label">This link is no longer available.</p>
                    <div className="link-actions">
                        <button
                            className="btn btn-secondary btn-lg"
                            type="button"
                            onClick={handleReset}
                        >Create another</button>
                    </div>
                </>
            )}
            {newLink && (
                <>
            <div style={{marginBottom: 24, color: 'var(--success)'}}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                    <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
            </div>
            <p className="link-display-label">Your secret link is ready</p>
            <div className="link-display-group">
                <p className="link-display-group-label">Recipient link</p>
                <input
                    className="link-display-input"
                    aria-label="Secret one-time link"
                    onClick={() => handleCopy(newLink, 'recipient')}
                    type="text"
                    value={newLink}
                    readOnly
                />
            </div>
            {auditEnabled && auditLink && (
                <div className="link-display-group link-display-group-secondary">
                    <p className="link-display-group-label">Audit link</p>
                    <input
                        className="link-display-input"
                        aria-label="Audit link"
                        onClick={() => handleCopy(auditLink, 'audit')}
                        type="text"
                        value={auditLink}
                        readOnly
                    />
                    <p className="link-display-group-note">Keep this private. Anyone with it can view the open log.</p>
                </div>
            )}
            {qrSvg && (
                <section className="link-qr-panel" aria-live="polite">
                    <p className="link-display-label" style={{marginBottom: 0}}>Scan from another device</p>
                    <p className="link-qr-panel-note">
                        This QR encodes the same one-time link shown above.
                    </p>
                    <div className="link-qr-panel-code">
                        <div
                            aria-label="Secret link QR code"
                            dangerouslySetInnerHTML={{__html: qrSvg}}
                        />
                    </div>
                </section>
            )}
            <div className="link-actions">
                <button
                    className="btn btn-success btn-lg"
                    onClick={() => handleCopy(newLink, 'recipient')}
                    type="button"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        {copiedTarget === 'recipient'
                            ? <polyline points="20 6 9 17 4 12"/>
                            : <><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>
                        }
                    </svg>
                    {copiedTarget === 'recipient' ? "Copied!" : "Copy link"}
                </button>
                {auditEnabled && auditLink && (
                    <button
                        className="btn btn-secondary btn-lg"
                        onClick={() => handleCopy(auditLink, 'audit')}
                        type="button"
                    >
                        {copiedTarget === 'audit' ? "Audit link copied!" : "Copy audit link"}
                    </button>
                )}
                <button
                    className="btn btn-secondary btn-lg"
                    disabled={isQrLoading}
                    type="button"
                    onClick={handleToggleQr}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 3h6v6H3z"/>
                        <path d="M15 3h6v6h-6z"/>
                        <path d="M3 15h6v6H3z"/>
                        <path d="M15 15h3"/>
                        <path d="M18 12v3"/>
                        <path d="M21 15v6"/>
                        <path d="M15 21h3"/>
                        <path d="M21 21h.01"/>
                    </svg>
                    {isQrLoading ? "Loading QR..." : qrSvg ? "Hide QR code" : "Show QR code"}
                </button>
            </div>
            <div className="link-actions">
                <button
                    className="btn btn-primary btn-lg"
                    type="button"
                    onClick={handleReset}
                >Create another</button>
            </div>
            <p className="link-notice">
                This link stays active until it expires or is no longer available.{' '}
                {auditEnabled
                    ? 'The recipient will see a warning before they reveal or download it, and you can monitor opens live below.'
                    : 'Encryption happens in your browser and the server never sees the plaintext.'}
            </p>
            {auditEnabled && auditLinkKey && (
                <div className="link-audit-panel">
                    <AuditLogPanel
                        auditLinkKey={auditLinkKey}
                        heading="Live open log"
                        emptyState="No opens have been recorded yet. Keep this page open to watch for activity."
                    />
                </div>
            )}
                </>
            )}
        </div>
    );
}
