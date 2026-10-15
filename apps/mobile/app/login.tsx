import { RequireGuest } from '../src/components/AuthGuard';
import { AuthScreen } from '../src/screens/AuthScreen';

export default function LoginRoute() {
  return (
    <RequireGuest>
      <AuthScreen />
    </RequireGuest>
  );
}
