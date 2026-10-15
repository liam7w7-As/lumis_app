import { useLocalSearchParams } from 'expo-router';
import { RequireAuth } from '../../../src/components/AuthGuard';
import { QuotePreviewScreen } from '../../../src/screens/QuotePreviewScreen';

export default function QuotePreviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireAuth>
      <QuotePreviewScreen quoteId={Number(id)} />
    </RequireAuth>
  );
}
