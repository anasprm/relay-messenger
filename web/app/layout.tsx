import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/AuthProvider';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { UiStyleProvider } from '@/lib/UiStyleProvider';
import { ToastProvider } from '@/lib/ToastProvider';

export const metadata: Metadata = {
  title: {
    default: 'Relay — Secure Workspace Messaging',
    template: '%s · Relay',
  },
  description:
    'Relay is a focused realtime messaging workspace with direct threads, voice and video notes, secure calls, and privacy controls.',
  applicationName: 'Relay',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#eef1f4' },
    { media: '(prefers-color-scheme: dark)', color: '#0b141a' },
  ],
};

const themeScript = `
(function () {
  try {
    var host = location.hostname;
    var site =
      host.indexOf('valiyakath') === 0
        ? 'whatsapp'
        : host.indexOf('relay-messengerpro') === 0
          ? 'formal'
          : 'whatsapp';
    document.documentElement.dataset.site = site;

    var storedTheme = localStorage.getItem('relay.theme');
    var dark = storedTheme
      ? storedTheme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';

    var storedUi = localStorage.getItem('relay.ui');
    var ui =
      storedUi === 'minimal' || storedUi === 'official'
        ? storedUi
        : site === 'formal'
          ? 'minimal'
          : 'official';
    document.documentElement.dataset.ui = ui;
  } catch (error) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-app text-ink antialiased">
        <ThemeProvider>
          <UiStyleProvider>
            <AuthProvider>
              <ToastProvider>{children}</ToastProvider>
            </AuthProvider>
          </UiStyleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
