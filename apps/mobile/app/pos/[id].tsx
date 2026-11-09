import { useLocalSearchParams } from 'expo-router';
import { RequireAuth } from '../../src/components/AuthGuard';
import { DraftProvider } from '../../src/context/DraftContext';
import { SaleEditorScreen } from '../../src/screens/SaleEditorScreen';
import { NovaledSaleDetailScreen } from '../../src/screens/NovaledSaleDetailScreen';
import { IS_NOVALED } from '../../src/lib/backend';

export default function SaleDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireAuth>
      <DraftProvider>
        {IS_NOVALED ? <NovaledSaleDetailScreen key={id} /> : <SaleEditorScreen saleId={Number(id)} />}
      </DraftProvider>
    </RequireAuth>
  );
}
