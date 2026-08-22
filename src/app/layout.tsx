import type { Metadata, Viewport } from 'next';
import { Fraunces, Source_Sans_3 } from 'next/font/google';
import { Toaster } from 'sonner';
import { RegisterSW } from '@/components/pwa/register-sw';
import './globals.css';

// next/font self-hosts the files: no request to Google, no third-party cookie,
// no layout shift. That matters here beyond performance — this app holds health
// data and should not phone home to render a heading.
const display = Fraunces({
  subsets: ['latin', 'latin-ext'],
  // Without naming the axes, next/font downloads the wght axis only and the
  // font-variation-settings in globals.css would silently do nothing.
  axes: ['SOFT', 'opsz'],
  variable: '--font-fraunces',
  display: 'swap',
});

const sans = Source_Sans_3({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-source-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Wellbeing',
  description: 'Ernährung, Symptome und Medikamente festhalten.',
  applicationName: 'Wellbeing',
  // iOS ignores manifest icons for the home screen icon; without this you get
  // a screenshot of the page as the icon.
  appleWebApp: {
    capable: true,
    title: 'Wellbeing',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      // Smallest first: browsers pick the first adequate size, and a tab
      // rendering the 192px file loses the leaf entirely.
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false, date: false, address: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never maximumScale: 1 — that is an accessibility failure.
  maximumScale: 5,
  viewportFit: 'cover',
  // Matches --color-bg. Without it the standalone PWA draws default white
  // browser chrome above a warm off-white page.
  themeColor: '#fcf8f9',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${display.variable} ${sans.variable}`}>
      <body className="antialiased">
        {children}
        <Toaster position="top-center" richColors closeButton />
        <RegisterSW />
      </body>
    </html>
  );
}
