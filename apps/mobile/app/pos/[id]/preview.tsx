import { useLocalSearchParams } from 'expo-router';
import { RequireAuth } from '../../../src/components/AuthGuard';
import { DeliveryPreviewScreen } from '../../../src/screens/DeliveryPreviewScreen';

export default function SalePreviewRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireAuth>
      <DeliveryPreviewScreen saleId={Number(id)} documentType="sale" />
    </RequireAuth>
  );
}
