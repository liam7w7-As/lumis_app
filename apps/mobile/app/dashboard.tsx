import { RequireAuth } from '../src/components/AuthGuard';
import { DashboardScreen } from '../src/screens/DashboardScreen';

export default function DashboardRoute() {
  return (
    <RequireAuth>
      <DashboardScreen />
    </RequireAuth>
  );
}
