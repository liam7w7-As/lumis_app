import { RequireAuth } from '../../src/components/AuthGuard';
import { QuotesScreen } from '../../src/screens/QuotesScreen';
export default function QuotesRoute() { return <RequireAuth><QuotesScreen /></RequireAuth>; }
