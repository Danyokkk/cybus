import './globals.css';
import { LanguageProvider } from '../context/LanguageContext';

export const metadata = {
  title: 'CyBus | Live Cyprus Bus Tracker',
  description: 'Track live bus locations, routes, and timetables across Cyprus including Nicosia, Limassol, Paphos, and Larnaca. Real-time GTFS data at your fingertips.',
  keywords: 'Cyprus bus, bus tracker, live bus tracker, Limassol bus, Nicosia bus, Cyprus public transport, bus timetable Cyprus',
  manifest: '/manifest.json',
  openGraph: {
    title: 'CyBus | Live Cyprus Bus Tracker',
    description: 'Real-time bus tracking for all of Cyprus.',
    url: 'https://cyfinal.onrender.com',
    siteName: 'CyBus',
    type: 'website',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#44bd32',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body suppressHydrationWarning={true}>
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}

import { SpeedInsights } from '@vercel/speed-insights/next';
 
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <title>Next.js</title>
      </head>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}