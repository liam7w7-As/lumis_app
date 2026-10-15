import { RequireAuth } from '../../../src/components/AuthGuard';
import { AddItemScreen } from '../../../src/screens/AddItemScreen';

export default function AddItemRoute() {
  return (
    <RequireAuth>
      <AddItemScreen />
    </RequireAuth>
  );
}
