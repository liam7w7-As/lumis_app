import { Redirect, useLocalSearchParams } from 'expo-router';
import { RequireAuth } from '../../../src/components/AuthGuard';
import { NovaledSalePreviewScreen } from '../../../src/screens/NovaledSalePreviewScreen';
import { IS_NOVALED } from '../../../src/lib/backend';

export default function DeliveryPreviewRoute() {
  const { id, signature, name } = useLocalSearchParams<{ id: string; signature?: string; name?: string }>();
  const mode = signature === 'otro' || signature === 'sin_nombre' ? signature : 'asesor';
  if (!IS_NOVALED) return <Redirect href="/dashboard" />;
  return <RequireAuth><NovaledSalePreviewScreen saleId={Number(id)} kind="delivery" signature={{ mode, name: name ?? '' }} /></RequireAuth>;
}
