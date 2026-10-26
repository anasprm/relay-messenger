import { WelcomeScreen } from '@/components/marketing/WelcomeScreen';

export const metadata = {
  title: 'Relay — Secure Workspace Messaging',
  description:
    'Relay is a focused realtime messaging workspace with direct threads, voice and video notes, secure calls, and server-side privacy controls.',
};

export default function HomePage() {
  return <WelcomeScreen />;
}
