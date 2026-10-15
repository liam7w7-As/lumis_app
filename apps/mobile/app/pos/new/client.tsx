import { RequireAuth } from '../../../src/components/AuthGuard';
import { AddClientScreen } from '../../../src/screens/AddClientScreen';

export default function NewSaleClientRoute() {
  return (
    <RequireAuth>
      <AddClientScreen />
    </RequireAuth>
  );
}
