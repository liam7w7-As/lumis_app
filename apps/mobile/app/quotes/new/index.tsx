import { RequireAuth } from '../../../src/components/AuthGuard';
import { NewQuoteScreen } from '../../../src/screens/NewQuoteScreen';
export default function NewQuoteRoute() { return <RequireAuth><NewQuoteScreen /></RequireAuth>; }
