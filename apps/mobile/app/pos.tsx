import { RequireAuth } from '../src/components/AuthGuard';
import { SalesScreen } from '../src/screens/SalesScreen';
export default function SalesRoute() { return <RequireAuth><SalesScreen /></RequireAuth>; }
