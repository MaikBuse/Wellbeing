import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Wellbeing – Ernährungstagebuch',
    short_name: 'Wellbeing',
    description:
      'Mahlzeiten, Symptome und Medikamente festhalten – und Zusammenhänge finden.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    lang: 'de',
    dir: 'ltr',
    background_color: '#fcf8f9',
    theme_color: '#f1a885',
    categories: ['health', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        // Without a maskable variant Android crops the icon into a circle badly.
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    // Long-pressing the home screen icon jumps straight into a sheet, which
    // saves two taps on the most frequent actions.
    shortcuts: [
      { name: 'Mahlzeit erfassen', url: '/?add=meal' },
      { name: 'Barcode scannen', url: '/scan' },
      { name: 'Medikamente', url: '/medications' },
    ],
  };
}
