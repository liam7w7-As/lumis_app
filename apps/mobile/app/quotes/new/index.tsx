import { RequireAuth } from '../../../src/components/AuthGuard';
import { NewQuoteScreen } from '../../../src/screens/NewQuoteScreen';
import { NovaledQuoteEditorScreen } from '../../../src/screens/NovaledQuoteEditorScreen';
import { IS_NOVALED } from '../../../src/lib/backend';

export default function NewQuoteIndexRoute() {
  return (
    <RequireAuth>
      {IS_NOVALED ? <NovaledQuoteEditorScreen /> : <NewQuoteScreen />}
    </RequireAuth>
  );
}
