import { RequireAuth } from '../src/components/AuthGuard';
import { HelpScreen } from '../src/screens/HelpScreen';
export default function HelpRoute() {
  return <RequireAuth><HelpScreen /></RequireAuth>;
}
