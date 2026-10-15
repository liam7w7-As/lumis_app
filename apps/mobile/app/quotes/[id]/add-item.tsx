import { useLocalSearchParams } from 'expo-router';
import { RequireAuth } from '../../../src/components/AuthGuard';
import { AddItemScreen } from '../../../src/screens/AddItemScreen';

export default function QuoteAddItemRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireAuth>
      <AddItemScreen quoteId={Number(id)} />
    </RequireAuth>
  );
}
