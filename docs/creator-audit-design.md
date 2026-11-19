# Creator Audit Logging

This fork now supports optional sender notifications with a separate audit link.

## What It Does

- The sender can enable notification when creating a text secret or file share.
- The sender receives:
  - the normal recipient link
  - a separate creator-only audit link
- The result page shows live audit events so the sender can keep that page open after sending.
- The dedicated audit page shows:
  - share type
  - creation time
  - expiry time
  - how many times it has been opened successfully
  - each recorded event with time, country/network hints, browser, and outcome

## What Gets Logged

For audit-enabled shares, the backend records:

- `reveal_success` for text secrets
- `download_success` for file shares
- `wrong_key` attempts

The current implementation does not log plain page visits.

## Why Plain Page Views Are Not Logged

Recipient links still use this format:

```text
/v/#<randomKey><id>
/f/#<randomKey><id>
```

Because the secret id stays inside the URL fragment, the server does not know which specific secret page was loaded until the browser performs the API request.

That means the reliable signal is the sensitive action itself:

- reveal secret
- download file
- wrong-key attempt

This is the right tradeoff for this fork because it:

- avoids burning links on passive page load alone
- keeps preview bots from counting as successful opens unless they actually trigger the reveal/download path
- avoids exposing the configured open limit to recipients

## Recipient UX

When sender notification is enabled:

- the recipient sees a warning before reveal/download
- the warning states that the sender can see:
  - access time
  - country/network details
  - browser
- the recipient must explicitly acknowledge that warning before continuing

## Multiple Opens

The sender can allow more than one successful open.

This is primarily intended to reduce accidental burns from mail scanners, preview bots, or similar automated systems.

The configured limit is not shown to recipients.
The creator-facing audit UI shows only past successful opens.

## Data Model Summary

Each share can store:

- encrypted payload metadata
- `hashedKey`
- optional audit enable flag
- optional `auditHashedKey`
- `maxViews`
- `readCount`

Audit metadata is stored separately with TTL, and audit events are kept in Redis with matching expiry.

## Privacy Impact

Enabling sender notification changes the service behavior in a meaningful way.

For audit-enabled shares, recipient metadata becomes product data:

- timestamp
- derived country/network details
- user agent
- event outcome

Deployments using this feature should make that explicit in user-facing privacy text and operational policy.
