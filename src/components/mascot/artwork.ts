import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RIVE_SRC } from './rive-asset';

/**
 * Whether the drawing is actually shipped. Server-only.
 *
 * This replaces a hand-flipped `HAS_ARTWORK` boolean, and the reason it is a
 * lookup rather than a constant has not changed: the boolean could lie in both
 * directions, and neither failure was visible in a diff.
 *
 * What changed is the price of getting it wrong. There are no still frames any
 * more — the figure is the Rive file or nothing — so a missing asset no longer
 * means a broken image on the day screen, it means no companion at all. That is
 * `MascotDock`'s first check, and it is why this has to be right.
 *
 * Read once at module load, so it costs one `existsSync` per process.
 * `public/` is copied next to `server.js` in the runner stage of the Dockerfile,
 * so `process.cwd()` resolves the same way in the container as in `next dev`.
 *
 * Consequence worth knowing: dropping the file in requires a restart, not a
 * rebuild.
 */
export const HAS_RIVE = existsSync(join(process.cwd(), 'public', RIVE_SRC));
