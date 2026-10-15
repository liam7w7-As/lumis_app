import { useLocalSearchParams } from 'expo-router';
import { RequireAuth } from '../../src/components/AuthGuard';
import { DraftProvider } from '../../src/context/DraftContext';
import { SaleEditorScreen } from '../../src/screens/SaleEditorScreen';

export default function SaleDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireAuth>
      <DraftProvider>
        <SaleEditorScreen saleId={Number(id)} />
      </DraftProvider>
    </RequireAuth>
  );
}
