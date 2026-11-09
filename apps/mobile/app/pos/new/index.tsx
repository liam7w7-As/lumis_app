import { RequireAuth } from '../../../src/components/AuthGuard';
import { SaleEditorScreen } from '../../../src/screens/SaleEditorScreen';
import { NovaledQuoteEditorScreen } from '../../../src/screens/NovaledQuoteEditorScreen';
import { IS_NOVALED } from '../../../src/lib/backend';

export default function NewSaleRoute() {
  return (
    <RequireAuth>
      {IS_NOVALED ? <NovaledQuoteEditorScreen mode="sale" /> : <SaleEditorScreen />}
    </RequireAuth>
  );
}
