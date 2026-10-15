import { useLocalSearchParams } from 'expo-router';
import { RequireAuth } from '../../../src/components/AuthGuard';
import { DraftProvider } from '../../../src/context/DraftContext';
import { AddItemScreen } from '../../../src/screens/AddItemScreen';

export default function SaleItemRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireAuth>
      <DraftProvider>
        <AddItemScreen saleId={Number(id)} />
      </DraftProvider>
    </RequireAuth>
  );
}
