import { AuthScreen } from '@/components/auth/AuthScreen';

export const metadata = { title: 'Sign in' };

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
