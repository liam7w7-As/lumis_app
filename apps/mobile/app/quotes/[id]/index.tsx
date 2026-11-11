import { RequireAuth } from '../../../src/components/AuthGuard';
import { QuoteDetailScreen } from '../../../src/screens/QuoteDetailScreen';
export default function QuoteRoute() { return <RequireAuth><QuoteDetailScreen /></RequireAuth>; }
