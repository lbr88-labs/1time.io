import {lazy, Suspense, useState} from "react";
import {Constants, createSecretLink, MAX_VIEW_OPTIONS, SHARE_DURATION_OPTIONS} from '../utils/util';
import {generateShortPassphrase} from '../utils/passphrase';

const ShowNewLink = lazy(() => import('./ShowNewLink'));

function LinkReadyFallback() {
    return (
        <p className="link-ready-fallback" style={{color: 'var(--text-secondary)', padding: '20px 0', textAlign: 'center'}}>
            Preparing secure link...
        </p>
    );
}

export default function NewMessage() {
    const [secretMessage, setSecretMessage] = useState("");
    const [secretKey, setSecretKey] = useState("");
    const [duration, setDuration] = useState(Constants.defaultDuration);
    const [maxViews, setMaxViews] = useState(1);
    const [auditEnabled, setAuditEnabled] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingPassphrase, setIsGeneratingPassphrase] = useState(false);
    const [shareResult, setShareResult] = useState(null);

    const handleGeneratePassphrase = async () => {
        setIsGeneratingPassphrase(true);

        try {
            setSecretKey(await generateShortPassphrase());
        } catch (error) {
        } finally {
            setIsGeneratingPassphrase(false);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setIsLoading(true);

        try {
            const result = await createSecretLink(secretMessage, {
                secretKey,
                durationDays: duration,
                maxViews,
                auditEnabled,
            });

            if (result.link) {
                setSecretMessage("");
                setSecretKey("");
                setDuration(Constants.defaultDuration);
                setMaxViews(1);
                setAuditEnabled(false);
                setIsLoading(false);
                setShareResult(result);
                return;
            }
        } catch (error) {}

        setIsLoading(false);
    };

    if (shareResult?.link) {
        return (
            <Suspense fallback={<LinkReadyFallback />}>
                <ShowNewLink
                    newLink={shareResult.link}
                    auditLink={shareResult.auditLink}
                    auditEnabled={shareResult.auditEnabled}
                    onReset={() => setShareResult(null)}
                />
            </Suspense>
        );
    }

    return (
        <form onSubmit={handleSubmit}>
            <div className="form-field">
                <label className="form-label" htmlFor="secretMessage">Your secret message, end-to-end encrypted.</label>
                <textarea
                    autoFocus
                    className="form-textarea"
                    id="secretMessage"
                    placeholder="Paste a password, API key, private note, or any sensitive text..."
                    rows={5}
                    value={secretMessage}
                    onChange={(event) => setSecretMessage(event.target.value)}
                />
            </div>

            <div className="form-actions share-primary-actions">
                <button
                    className="btn btn-primary btn-lg"
                    disabled={secretMessage.length === 0 || isLoading}
                    type="submit"
                >
                    {!isLoading ? "Create secret link" : "Encrypting..."}
                </button>
            </div>

            <div className="options-grid">
                <div className="form-field" style={{marginBottom: 0}}>
                    <div className="form-label-row">
                        <label className="form-label" htmlFor="secretKey">Additional passphrase</label>
                        <button
                            className="passphrase-generate-btn"
                            type="button"
                            onClick={handleGeneratePassphrase}
                            disabled={isGeneratingPassphrase}
                        >
                            {isGeneratingPassphrase ? 'Generating...' : 'Generate one'}
                        </button>
                    </div>
                    <input
                        className="form-input"
                        id="secretKey"
                        placeholder="Optional extra security"
                        value={secretKey}
                        onChange={(event) => setSecretKey(event.target.value)}
                        type="text"
                    />
                    <p className="form-help">Recipient will need this to decrypt</p>
                </div>
                <div className="form-field" style={{marginBottom: 0}}>
                    <label className="form-label" htmlFor="duration">Expire after</label>
                    <select
                        className="form-select"
                        id="duration"
                        value={duration}
                        onChange={(event) => setDuration(Number(event.target.value))}
                    >
                        {SHARE_DURATION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <p className="form-help">Link expires even if unread</p>
                </div>
                <div className="form-field" style={{marginBottom: 0}}>
                    <label className="form-label" htmlFor="maxViews">Allowed opens</label>
                    <select
                        className="form-select"
                        id="maxViews"
                        value={maxViews}
                        onChange={(event) => setMaxViews(Number(event.target.value))}
                    >
                        {MAX_VIEW_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                    <p className="form-help">Use more than one if mail scanners might trigger the link</p>
                </div>
                <div className="form-field form-checkbox-field form-checkbox-field-wide" style={{marginBottom: 0}}>
                    <label className="form-checkbox-row" htmlFor="auditEnabled">
                        <input
                            id="auditEnabled"
                            type="checkbox"
                            checked={auditEnabled}
                            onChange={(event) => setAuditEnabled(event.target.checked)}
                        />
                        <span>Notify me when someone opens it</span>
                    </label>
                    <p className="form-help">Adds a separate audit link and warns the recipient before reveal</p>
                </div>
            </div>
        </form>
    );
}
