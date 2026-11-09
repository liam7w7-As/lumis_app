import { RequireAuth } from '../../src/components/AuthGuard';
import { QuotesScreen } from '../../src/screens/QuotesScreen';
import { NovaledQuotesScreen } from '../../src/screens/NovaledQuotesScreen';
import { IS_NOVALED } from '../../src/lib/backend';

export default function QuotesIndexRoute() {
  return (
    <RequireAuth>
      {IS_NOVALED ? <NovaledQuotesScreen /> : <QuotesScreen />}
    </RequireAuth>
  );
}
