import {useEffect, useState} from 'react';
import AuditLogPanel from './AuditLogPanel';

export default function ViewAuditLog() {
    const [linkKey, setLinkKey] = useState('');

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const hash = window.location.hash;
        if (hash && hash.length > 1) {
            setLinkKey(hash.slice(1));
        }
    }, []);

    return (
        <AuditLogPanel
            auditLinkKey={linkKey}
            heading="Creator audit log"
            emptyState="No opens have been recorded yet."
        />
    );
}
