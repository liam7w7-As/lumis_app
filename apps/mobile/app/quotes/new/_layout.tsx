import { Stack } from 'expo-router';
import { useStackMotion } from '../../../src/hooks/useStackMotion';
import { DraftProvider } from '../../../src/context/DraftContext';

export default function NewQuoteLayout() {
  const screenOptions = useStackMotion();
  return (
    <DraftProvider>
      <Stack screenOptions={screenOptions} />
    </DraftProvider>
  );
}
