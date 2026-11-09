import { RequireAuth } from '../src/components/AuthGuard';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import { NovaledAccountScreen } from '../src/screens/NovaledAccountScreen';
import { IS_NOVALED } from '../src/lib/backend';

export default function SettingsRoute() {
  return (
    <RequireAuth>
      {IS_NOVALED ? <NovaledAccountScreen /> : <SettingsScreen />}
    </RequireAuth>
  );
}
