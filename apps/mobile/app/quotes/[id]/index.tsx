import { RequireAuth } from '../../../src/components/AuthGuard';
import { QuoteDetailScreen } from '../../../src/screens/QuoteDetailScreen';

export default function QuoteDetailIndexRoute() {
  return (
    <RequireAuth>
      <QuoteDetailScreen />
    </RequireAuth>
  );
}
