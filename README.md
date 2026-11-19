# 1time.io Fork

Minimal self-hosted secret handoff for text and files.

This fork keeps the upstream crypto and backend model, but strips the frontend down to the core flow and publishes its own pinned GHCR images.

Original project: [shingrus/1time](https://github.com/shingrus/1time)

## What This Fork Changes

- The create flow is a single-page React/Vite app at `/`
- Text and file sharing are a UI toggle on the same page
- `/secure-file-sharing/` and `/share-password-securely/` are compatibility entrypoints only
- Link creation does not auto-copy to the clipboard
- Senders can optionally enable recipient-open notifications with a separate audit link
- Audit-enabled shares can be opened more than once to reduce mail-scanner burns
- The GitHub workflow publishes fork-owned images to:
  - `ghcr.io/<owner>/1time-backend`
  - `ghcr.io/<owner>/1time-web`
- Deployment is intended to use pinned image digests, not mutable upstream `latest`

## Current Routes

- `/`
  Creates either a text secret or a file share, depending on the selected toggle.
- `/v/#<randomKey><id>`
  Opens a text secret.
- `/f/#<randomKey><id>`
  Opens a file share.
- `/a/#<kindPrefix><auditRandomKey><id>`
  Opens the creator-only audit log for a share.
- `/secure-file-sharing/`
  Compatibility route. The SPA normalizes this back to `/` and opens file mode.
- `/share-password-securely/`
  Compatibility route. The SPA normalizes this back to `/` and opens text mode.

## Security Model

- Encryption happens in the browser with AES-256-GCM and HKDF-SHA256.
- The server stores ciphertext and a hash-based proof-of-knowledge, not plaintext.
- The decryption key stays in the URL fragment (`#`) and is not sent to the server.
- Audit-enabled shares use a separate audit secret and creator-only audit URL.
- Recipients see a warning before reveal/download when sender notification is enabled.
- Audit-enabled shares can record reveal/download time, derived country/network details, browser, and outcome for the sender.
- Text and file secrets are deleted after their allowed successful opens are exhausted or when they expire.
- The app does not automatically overwrite the user clipboard when a link is created.

## Known Gaps

- The current container images still run as `root`; runtime hardening is still worth doing.
- The audit log currently records successful reveals/downloads and wrong-key attempts, not passive page visits.
- Privacy impact is higher when sender notifications are enabled, so deployment and user-facing policy should be reviewed carefully.

The audit feature details are documented in [docs/creator-audit-design.md](docs/creator-audit-design.md).

## Repo Commands

Run these from the repository root.

```bash
# Frontend dev server
npm run dev

# Frontend production build
npm run build

# Frontend tests
npm run test

# Backend tests
npm run test:backend
```

The root `npm` commands bootstrap frontend dependencies automatically.

## Local Development Stack

To build the full app from source with Docker:

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d --build
```

That starts:

- `redis`
- `backend`
- `web`

Default local URL:

```text
http://127.0.0.1:8080
```

## Image Publishing

The GitHub Actions workflow in [.github/workflows/docker-publish.yml](.github/workflows/docker-publish.yml) publishes:

- `ghcr.io/<owner>/1time-backend`
- `ghcr.io/<owner>/1time-web`

Tag behavior:

- Push to `master`: publishes `sha-<12>`, `master`, and `latest`
- Push tag `v*`: publishes `sha-<12>`, the version tag, and `latest`

The workflow builds multi-arch images for `linux/amd64` and `linux/arm64`.

## Deployment

This repo contains a digest-pinned deployment compose file in [docker-compose.yml](docker-compose.yml).

```bash
cp .env.example .env
# set APP_HOSTNAME, BACKEND_IMAGE, WEB_IMAGE
docker compose up -d
```

Relevant variables from [.env.example](.env.example):

- `APP_HOSTNAME`
- `BACKEND_IMAGE`
- `WEB_IMAGE`
- `APP_PORT`
- `DATA_DIR`

Pin `BACKEND_IMAGE` and `WEB_IMAGE` to exact digests from your own GHCR packages.

## Build Notes

- The deployment frontend is static output served by nginx from `frontend/dist`.
- The web image build happens in [Dockerfile.web](Dockerfile.web).
- The backend binary build happens in [Dockerfile.backend](Dockerfile.backend).
- `make build` still produces:
  - `bin/1time-api`
  - `frontend/dist`

## Sender Notifications

Sender notifications are opt-in per share.

When enabled:

- the sender gets a second audit URL
- the recipient sees a warning before revealing or downloading the secret
- the sender audit page shows past opens, country/network hints, and wrong-key attempts
- the audit page can also be watched live from the link-result screen after sending

Because the current recipient links keep the secret id in the fragment, the system logs actual reveal/download actions, not passive page visits. That avoids exposing the allowed-open count to recipients while still making preview-bot burns less likely.

## License

[MIT](LICENSE)
