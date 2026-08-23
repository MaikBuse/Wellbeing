import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { POSTER_SRC, RIVE_SRC } from './rive-asset';

/**
 * Whether the artwork is actually shipped. Server-only.
 *
 * This replaces a hand-flipped `HAS_ARTWORK` boolean, and the reason is that the
 * boolean could lie. Set to true without the files present, the day screen gets
 * four 404 images and a runtime chasing a missing .riv; left false after adding
 * them, the drawing silently never appears. Both failure modes are invisible in
 * a diff and obvious only on the running app.
 *
 * Read once at module load, so it costs two `existsSync` calls per process.
 * `public/` is copied next to `server.js` in the runner stage of the Dockerfile,
 * so `process.cwd()` resolves the same way in the container as in `next dev`.
 *
 * Consequence worth knowing: dropping the files in requires a restart, not a
 * rebuild. That is the right trade for never rendering a broken image.
 */
function shipped(publicPath: string): boolean {
  return existsSync(join(process.cwd(), 'public', publicPath));
}

/** All four stills. Partial artwork would show a broken box on one mood only. */
export const HAS_POSTERS = Object.values(POSTER_SRC).every(shipped);

/** The animated file. Independent: stills alone are a complete feature. */
export const HAS_RIVE = shipped(RIVE_SRC);

/** Whether anything at all needs crediting in the settings screen. */
export const HAS_ARTWORK = HAS_POSTERS || HAS_RIVE;
