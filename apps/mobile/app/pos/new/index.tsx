import { RequireAuth } from '../../../src/components/AuthGuard';
import { SaleEditorScreen } from '../../../src/screens/SaleEditorScreen';

export default function NewSaleRoute() {
  return (
    <RequireAuth>
      <SaleEditorScreen />
    </RequireAuth>
  );
}
