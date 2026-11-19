import {useEffect, useState} from 'react';
import {Constants, hashSecretKey} from '../utils/util';
import {getAuditLog} from '../utils/fileApi';

function formatTimestamp(unixSeconds) {
    if (!unixSeconds) {
        return 'Unknown';
    }

    return new Date(unixSeconds * 1000).toLocaleString();
}

function parseAuditLinkKey(linkKey) {
    if (!linkKey || linkKey.length <= Constants.randomKeyLen + 1) {
        return null;
    }

    const kindPrefix = linkKey.charAt(0);
    const kind = kindPrefix === 'f' ? 'file' : kindPrefix === 't' ? 'text' : '';
    if (!kind) {
        return null;
    }

    const auditRandomKey = linkKey.slice(1, Constants.randomKeyLen + 1);
    const id = linkKey.slice(Constants.randomKeyLen + 1);
    if (!auditRandomKey || !id) {
        return null;
    }

    return {kind, auditRandomKey, id};
}

export default function AuditLogPanel({
    auditLinkKey = '',
    heading = 'Creator audit log',
    emptyState = 'No audit events have been recorded yet.',
    pollIntervalMs = 5000,
}) {
    const [status, setStatus] = useState(auditLinkKey ? 'loading' : 'invalid');
    const [auditData, setAuditData] = useState(null);

    useEffect(() => {
        if (!auditLinkKey) {
            setStatus('invalid');
            setAuditData(null);
            return;
        }

        const parsed = parseAuditLinkKey(auditLinkKey);
        if (!parsed) {
            setStatus('invalid');
            setAuditData(null);
            return;
        }

        let mounted = true;

        const loadAudit = async () => {
            try {
                const auditHashedKey = await hashSecretKey(parsed.auditRandomKey);
                const data = await getAuditLog(parsed.id, parsed.kind, auditHashedKey);
                if (!mounted) {
                    return;
                }

                if (data.status === 'ok') {
                    setAuditData(data);
                    setStatus('ready');
                    return;
                }

                setAuditData(null);
                setStatus(data.status || 'error');
            } catch (error) {
                if (mounted) {
                    setAuditData(null);
                    setStatus('error');
                }
            }
        };

        void loadAudit();
        const intervalId = window.setInterval(() => {
            void loadAudit();
        }, pollIntervalMs);

        return () => {
            mounted = false;
            window.clearInterval(intervalId);
        };
    }, [auditLinkKey, pollIntervalMs]);

    if (status === 'loading') {
        return (
            <div className="message-panel audit-summary-panel">
                <div className="message-panel-header">{heading}</div>
                <div className="message-panel-body audit-page-loading">Loading audit log...</div>
            </div>
        );
    }

    if (status !== 'ready' || !auditData) {
        return (
            <div className="message-panel audit-summary-panel">
                <div className="message-panel-header">{heading}</div>
                <div className="message-panel-body">
                    <p className="form-help">This audit link is invalid, expired, or unavailable.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="audit-page">
            <div className="message-panel audit-summary-panel">
                <div className="message-panel-header">{heading}</div>
                <div className="message-panel-body audit-summary-grid">
                    <div className="audit-summary-item">
                        <span className="audit-summary-label">Type</span>
                        <strong>{auditData.kind === 'file' ? 'File share' : 'Text secret'}</strong>
                    </div>
                    <div className="audit-summary-item">
                        <span className="audit-summary-label">Created</span>
                        <strong>{formatTimestamp(auditData.createdAt)}</strong>
                    </div>
                    <div className="audit-summary-item">
                        <span className="audit-summary-label">Expires</span>
                        <strong>{formatTimestamp(auditData.expiresAt)}</strong>
                    </div>
                    <div className="audit-summary-item">
                        <span className="audit-summary-label">Opened</span>
                        <strong>{auditData.successfulReads}</strong>
                    </div>
                </div>
            </div>

            <div className="message-panel">
                <div className="message-panel-header">Access events</div>
                <div className="message-panel-body">
                    {auditData.events?.length ? (
                        <div className="audit-events">
                            {auditData.events.map((event, index) => (
                                <div className="audit-event-row" key={`${event.timestamp}-${event.eventType}-${index}`}>
                                    <div>
                                        <p className="audit-event-type">{event.eventType}</p>
                                        <p className="audit-event-time">{formatTimestamp(event.timestamp)}</p>
                                    </div>
                                    <div className="audit-event-meta">
                                        {event.country && <p>{event.country}</p>}
                                        <p>{event.network || 'Unknown network'}</p>
                                        <p>{event.userAgent || 'Unknown browser'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="form-help">{emptyState}</p>
                    )}
                </div>
            </div>
        </div>
    );
}
