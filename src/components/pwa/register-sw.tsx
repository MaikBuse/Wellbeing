'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker in production only — in dev a SW fights
 * Turbopack HMR. The worker exists to satisfy the install criteria and to
 * serve an offline page; it caches no HTML and no API responses.
 */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // A failed registration must never break the app.
    });
  }, []);
  return null;
}
