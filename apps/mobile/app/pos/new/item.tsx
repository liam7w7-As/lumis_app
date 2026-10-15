import { RequireAuth } from '../../../src/components/AuthGuard';
import { AddItemScreen } from '../../../src/screens/AddItemScreen';

export default function NewSaleItemRoute() {
  return (
    <RequireAuth>
      <AddItemScreen />
    </RequireAuth>
  );
}
