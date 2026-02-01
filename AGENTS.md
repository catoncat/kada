# Repository Guidelines

## Project Structure & Module Organization

- `src/`: React 19 + TypeScript frontend (TanStack Router file routes live in `src/routes/`).
- `src/components/`: app/feature components (typically `PascalCase.tsx`).
- `src/components/ui/`: reusable UI primitives (typically `kebab-case.tsx`).
- `src/lib/`: shared utilities and domain helpers (use `@/` alias for `src/` imports).
- `public/`: static assets served by Vite.
- `sidecar/`: Node.js sidecar service (Hono + Drizzle + SQLite) used by the app at runtime.
- `src-tauri/`: Tauri 2 Rust shell and packaging config (includes bundled sidecar binaries).

Generated/build outputs you generally should not edit by hand: `dist/`, `sidecar/dist/`, `src/routeTree.gen.ts`, `.tanstack/`, `src-tauri/target/`.

## Build, Test, and Development Commands

- `pnpm install`: install frontend deps.
- `cd sidecar && pnpm install`: install sidecar deps.
- `pnpm dev`: run the frontend dev server (Vite, port `1420`).
- `pnpm dev:sidecar`: run the sidecar API (port `3001`).
- `pnpm dev:all`: run both (recommended for feature work).
- `pnpm build`: TypeScript typecheck + Vite build.
- `pnpm tauri:dev`: run the desktop app in dev mode.
- `pnpm tauri:build`: build sidecar, then package the Tauri app.

Sidecar database tooling (run in `sidecar/`): `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:studio`.

## Coding Style & Naming Conventions

- Indentation: 2 spaces; use semicolons and single quotes to match existing files.
- Prefer small, focused modules; avoid cross-layer imports (frontend ↔ sidecar) except via HTTP APIs.
- React: `PascalCase` component names; hooks named `useXxx` under `src/hooks/`.
- Tailwind CSS: keep class lists readable; use `cn()` from `src/lib/utils.ts` for conditional merging.

## Testing Guidelines

There is currently no dedicated `pnpm test` script or test framework configured. Validate changes by running `pnpm build` and doing a quick smoke test via `pnpm dev:all` (and `pnpm tauri:dev` when desktop integration is involved). If you introduce automated tests, add a `pnpm test` script and document how to run them in your PR.

## Commit & Pull Request Guidelines

This workspace may not include Git history; when in doubt, follow Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:` (optional scope like `feat(sidecar): ...`).

PRs should include: a short summary, how to test (commands + expected behavior), screenshots/GIFs for UI changes, and any DB migration notes (Drizzle) or breaking changes.

## Security & Configuration Tips

Do not commit API keys or provider credentials. Treat logs as sensitive (avoid printing secrets), and keep changes compatible with the default dev ports (`1420` frontend, `3001` sidecar).
