import { RequireAuth } from '../src/components/AuthGuard';
import { LicenseScreen } from '../src/screens/LicenseScreen';
export default function LicenseRoute() {
  return (
    <RequireAuth>
      <LicenseScreen />
    </RequireAuth>
  );
}
