import { Stack } from 'expo-router';
import { useStackMotion } from '../../../src/hooks/useStackMotion';
import { DraftProvider } from '../../../src/context/DraftContext';

export default function NewSaleLayout() {
  const screenOptions = useStackMotion();
  return (
    <DraftProvider>
      <Stack screenOptions={screenOptions} />
    </DraftProvider>
  );
}
