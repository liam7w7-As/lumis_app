import { Redirect, useLocalSearchParams } from 'expo-router';
import { RequireAuth } from '../../../src/components/AuthGuard';
import { NovaledSalePreviewScreen } from '../../../src/screens/NovaledSalePreviewScreen';
import { IS_NOVALED } from '../../../src/lib/backend';

export default function PaymentProofRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!IS_NOVALED) return <Redirect href="/dashboard" />;
  return <RequireAuth><NovaledSalePreviewScreen saleId={Number(id)} kind="payment-proof" /></RequireAuth>;
}
