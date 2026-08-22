import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { RegisterSW } from '@/components/pwa/register-sw';
import './globals.css';

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
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className="antialiased">
        {children}
        <Toaster position="top-center" richColors closeButton />
        <RegisterSW />
      </body>
    </html>
  );
}
