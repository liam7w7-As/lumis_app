import { RequireAuth } from '../src/components/AuthGuard';
import { SalesScreen } from '../src/screens/SalesScreen';
import { NovaledSalesScreen } from '../src/screens/NovaledSalesScreen';
import { IS_NOVALED } from '../src/lib/backend';

export default function PosRoute() {
  return (
    <RequireAuth>
      {IS_NOVALED ? <NovaledSalesScreen /> : <SalesScreen />}
    </RequireAuth>
  );
}
