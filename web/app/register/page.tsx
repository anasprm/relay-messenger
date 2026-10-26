import { AuthScreen } from '@/components/auth/AuthScreen';

export const metadata = { title: 'Create account' };

export default function RegisterPage() {
  return <AuthScreen mode="register" />;
}
