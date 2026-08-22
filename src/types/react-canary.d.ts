/**
 * Pulls in the React canary type declarations, which is where `ViewTransition`
 * and `addTransitionType` live.
 *
 * `<ViewTransition>` works at runtime because the App Router resolves `react`
 * to Next's own vendored build (`next/dist/compiled/react`), which exports it.
 * The `react@19.2.0` package in node_modules does NOT, and @types/react only
 * declares it in `react/canary` — so without this reference `npm run type-check`
 * fails, and type-check is part of `pre-deploy`.
 *
 * Deliberately a triple-slash reference rather than a `"types"` array in
 * tsconfig.json: adding that array would switch off automatic @types
 * resolution for everything else.
 */

/// <reference types="react/canary" />
