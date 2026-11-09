import { RequireAuth } from '../../../src/components/AuthGuard';
import { QuoteDetailScreen } from '../../../src/screens/QuoteDetailScreen';
import { NovaledQuoteDetailScreen } from '../../../src/screens/NovaledQuoteDetailScreen';
import { IS_NOVALED } from '../../../src/lib/backend';

export default function QuoteDetailIndexRoute() {
  return (
    <RequireAuth>
      {IS_NOVALED ? <NovaledQuoteDetailScreen /> : <QuoteDetailScreen />}
    </RequireAuth>
  );
}
