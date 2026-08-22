import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge has to be told about the custom scales in globals.css.
 *
 * Without this it classifies `text-section` as a *colour* utility, so
 * `cn('text-section font-semibold text-fg')` silently drops the size and only
 * `text-fg` survives. That failure is invisible in review — the class is simply
 * absent from the output — so every custom --text-* key belongs in this list.
 *
 * The radius and animate groups are registered for the same reason, so that two
 * competing values collapse to the last one instead of both being emitted.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['display', 'title', 'section', 'metric', 'eyebrow'] },
      ],
      rounded: [{ rounded: ['control', 'card', 'sheet', 'pill'] }],
      animate: [{ animate: ['rise', 'fade-in', 'pop', 'check', 'scan'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
