# Creator Audit Design

This document captures the requested creator-visible audit trail before implementation.

## Requested Behavior

- The sender gets a second link for auditing.
- That audit link is protected by a separate secret.
- The audit page shows a trail of access attempts.
- The trail should include timestamp and source IP.
- The recipient link should not be trivially burned by mail-preview bots or link followers.
- The sender wants the option to allow more than one successful open.

## Critical Constraint In The Current Design

The current recipient URLs look like this:

```text
/v/#<randomKey><id>
/f/#<randomKey><id>
```

Because both the key and the secret id live in the URL fragment, the server never sees either value on the initial page request.

That has an important consequence:

- The server can serve `/v/` or `/f/`
- But it cannot know which specific secret was opened until client-side JavaScript reads the fragment and calls the API

So with the current URL format, you cannot build a reliable creator audit log of plain page opens.

## Recommended URL Change

Move the secret id into the path and keep only the decryption secret in the fragment:

```text
/v/<id>#<randomKey>
/f/<id>#<randomKey>
/a/<id>#<auditKey>
```

That preserves the zero-knowledge property for the decryption key while letting the server identify which secret page was requested.

## Recommended Event Model

The system should log distinct event types instead of treating every hit as the same thing.

Recommended event types:

- `page_view`
  The recipient page was requested.
- `reveal_attempt`
  The browser asked to decrypt or download.
- `reveal_success`
  The correct key was supplied and the secret was released.
- `wrong_key`
  A reveal attempt used the wrong key.
- `expired`
  The secret no longer existed.

For file shares, `reveal_success` is the successful file release event.

## Recommended UX

On create:

- Show the normal recipient link.
- Show a separate creator audit link.
- Optionally let the sender choose allowed successful opens, for example `1`, `2`, `3`, or `5`.

On audit page:

- Show creation time.
- Show remaining successful opens.
- Show each event with:
  - timestamp
  - IP address
  - user agent
  - event type

## Recommended Data Model

Store the main secret record with:

- `hashed_key`
- `hashed_audit_key`
- `expires_at`
- `max_successful_reads`
- `successful_reads`
- ciphertext metadata

Store audit events separately with TTL:

- `secret_id`
- `timestamp`
- `ip`
- `user_agent`
- `event_type`
- optional derived `source_hint`

`source_hint` can be a best-effort classifier for known preview bots, but it must not be treated as authoritative.

## Privacy Impact

This feature changes the privacy model.

Today the service stores ciphertext and operational logs.
If creator audit is added, the service will intentionally store viewer metadata for the creator.

That means:

- IP addresses become product data, not just infrastructure logs
- the privacy notice must explicitly disclose this
- retention must be short and deliberate
- the UI should warn the sender that enabling audit logging records recipient metadata

Recommended retention:

- keep audit events only until secret expiry plus a short grace period
- default grace period recommendation: 7 days

## Preview-Bot Problem

The safest way to avoid preview bots burning links is to separate:

- visiting the page
- successfully revealing the secret

The current UI already uses an explicit user action for reveal/download, which is good.
The audit feature should preserve that split and log both stages separately.

If the sender also wants multiple successful reveals, make that an explicit policy on create instead of silently weakening one-time semantics.

## Recommended Implementation Order

1. Change recipient links to `/v/<id>#<key>` and `/f/<id>#<key>`.
2. Add separate audit keys and `/a/<id>#<auditKey>`.
3. Add audit event storage and creator audit API.
4. Update frontend create/result views to show both links.
5. Add privacy copy and retention rules.
6. Add optional `max_successful_reads` setting.

## Recommendation For This Fork

Do not implement raw IP audit logging as an invisible backend detail.

If this feature is added, it should be:

- explicit
- creator-visible
- separately authenticated
- documented in the privacy text
- paired with the URL-format change above
