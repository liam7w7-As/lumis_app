import { RequireAuth } from '../src/components/AuthGuard';
import { DashboardScreen } from '../src/screens/DashboardScreen';
import { NovaledQuotesScreen } from '../src/screens/NovaledQuotesScreen';
import { IS_NOVALED } from '../src/lib/backend';
import { NovaledSalesScreen } from '../src/screens/NovaledSalesScreen';
import { useAuth } from '../src/context/AuthContext';

export default function DashboardRoute() {
  const { user } = useAuth();
  return (
    <RequireAuth>
      {IS_NOVALED ? user?.permissions?.viewQuotes ? <NovaledQuotesScreen home /> : <NovaledSalesScreen home /> : <DashboardScreen />}
    </RequireAuth>
  );
}
