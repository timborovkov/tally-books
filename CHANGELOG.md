# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Next.js 16 (App Router) + TypeScript (strict, with `noUncheckedIndexedAccess` and friends).
- Tailwind v4 with shadcn/ui base setup (`Button`, `Input`, `cn` utility, slate theme tokens).
- Strict ESLint flat config (Next core-web-vitals + TypeScript, unused-imports, prettier-compat).
- Prettier with Tailwind class sorting.
- Knip for dead code / unused dependency detection.
- Vitest with jsdom + Testing Library, sample test for `cn`.
- GitHub Actions CI: parallel lint, typecheck, knip, unit, integration jobs.
- Husky pre-push hook running lint-staged on the diff being pushed.
- MIT license, contributor guide, GitHub issue + PR templates.
- Multi-stage Dockerfile (deps → build → runtime, distroless-friendly).
- `docker-compose.yml` for local dev (`app`, `postgres`, `minio`, `qdrant`).
- `docker-compose.prod.yml` reference for self-hosters.
- `.env.example` with all required environment keys documented.
- `/api/health` and `/api/ready` endpoints.
- `robots.txt` disallow-all + `X-Robots-Tag: noindex` headers (no search engine indexing).
