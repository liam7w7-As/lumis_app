import { useLocalSearchParams } from 'expo-router';
import { RequireAuth } from '../../../src/components/AuthGuard';
import { DeliveryPreviewScreen } from '../../../src/screens/DeliveryPreviewScreen';
import { NovaledDeliveryScreen } from '../../../src/screens/NovaledDeliveryScreen';
import { IS_NOVALED } from '../../../src/lib/backend';

export default function SaleDeliveryRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <RequireAuth>
      {IS_NOVALED ? <NovaledDeliveryScreen key={id} /> : <DeliveryPreviewScreen saleId={Number(id)} />}
    </RequireAuth>
  );
}
