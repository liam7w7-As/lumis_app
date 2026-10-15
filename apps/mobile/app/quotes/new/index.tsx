import { RequireAuth } from '../../../src/components/AuthGuard';
import { NewQuoteScreen } from '../../../src/screens/NewQuoteScreen';

export default function NewQuoteIndexRoute() {
  return (
    <RequireAuth>
      <NewQuoteScreen />
    </RequireAuth>
  );
}
