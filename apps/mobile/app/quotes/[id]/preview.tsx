import { useLocalSearchParams } from 'expo-router';
import { RequireAuth } from '../../../src/components/AuthGuard';
import { QuotePreviewScreen } from '../../../src/screens/QuotePreviewScreen';
import { NovaledQuotePreviewScreen } from '../../../src/screens/NovaledQuotePreviewScreen';
import { IS_NOVALED } from '../../../src/lib/backend';

export default function QuotePreviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireAuth>
      {IS_NOVALED ? <NovaledQuotePreviewScreen quoteId={Number(id)} /> : <QuotePreviewScreen quoteId={Number(id)} />}
    </RequireAuth>
  );
}
