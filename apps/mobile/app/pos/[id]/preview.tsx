import { useLocalSearchParams } from 'expo-router';
import { RequireAuth } from '../../../src/components/AuthGuard';
import { DeliveryPreviewScreen } from '../../../src/screens/DeliveryPreviewScreen';
import { NovaledSalePreviewScreen } from '../../../src/screens/NovaledSalePreviewScreen';
import { IS_NOVALED } from '../../../src/lib/backend';

export default function SalePreviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireAuth>
      {IS_NOVALED ? <NovaledSalePreviewScreen saleId={Number(id)} /> : <DeliveryPreviewScreen saleId={Number(id)} documentType="sale" />}
    </RequireAuth>
  );
}
