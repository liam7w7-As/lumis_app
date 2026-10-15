import { RequireAuth } from '../src/components/AuthGuard';
import { SettingsScreen } from '../src/screens/SettingsScreen';

export default function SettingsRoute() {
  return (
    <RequireAuth>
      <SettingsScreen />
    </RequireAuth>
  );
}
