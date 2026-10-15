import { RequireAuth } from '../../../src/components/AuthGuard';
import { AddClientScreen } from '../../../src/screens/AddClientScreen';

export default function AddClientRoute() {
  return (
    <RequireAuth>
      <AddClientScreen />
    </RequireAuth>
  );
}
