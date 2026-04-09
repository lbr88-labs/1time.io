# 1time.io Fork

Minimal self-hosted secret handoff for text and files.

This fork keeps the upstream crypto and backend model, but strips the frontend down to the core flow and publishes its own pinned GHCR images.

Original project: [shingrus/1time](https://github.com/shingrus/1time)

## What This Fork Changes

- The create flow is a single-page React/Vite app at `/`
- Text and file sharing are a UI toggle on the same page
- `/secure-file-sharing/` and `/share-password-securely/` are compatibility entrypoints only
- Link creation does not auto-copy to the clipboard
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
- `/secure-file-sharing/`
  Compatibility route. The SPA normalizes this back to `/` and opens file mode.
- `/share-password-securely/`
  Compatibility route. The SPA normalizes this back to `/` and opens text mode.

## Security Model

- Encryption happens in the browser with AES-256-GCM and HKDF-SHA256.
- The server stores ciphertext and a hash-based proof-of-knowledge, not plaintext.
- The decryption key stays in the URL fragment (`#`) and is not sent to the server.
- Text and file secrets are deleted after successful retrieval under the current one-time model.
- The app does not automatically overwrite the user clipboard when a link is created.

## Known Gaps

- Creator audit links are not implemented yet.
- The current container images still run as `root`; runtime hardening is still worth doing.
- Privacy docs will need to change if creator-visible IP logging is added.

The audit-trail proposal for this fork is documented in [docs/creator-audit-design.md](docs/creator-audit-design.md).

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

## Audit Trail Proposal

The creator-audit feature request for this fork is not a trivial add-on.

The important design constraints are:

- The current links use `/v/#<key><id>` and `/f/#<key><id>`
- Because the `id` is inside the fragment, the server cannot identify which secret page was merely opened
- That means you cannot reliably log "who opened the link" from the initial page request with the current URL format

The proposed fix is documented in [docs/creator-audit-design.md](docs/creator-audit-design.md).

## License

[MIT](LICENSE)
