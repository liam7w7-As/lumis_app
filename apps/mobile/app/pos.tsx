import { RequireAuth } from '../src/components/AuthGuard';
import { SalesScreen } from '../src/screens/SalesScreen';

export default function PosRoute() {
  return (
    <RequireAuth>
      <SalesScreen />
    </RequireAuth>
  );
}
