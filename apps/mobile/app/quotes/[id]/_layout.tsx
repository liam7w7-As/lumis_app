import { Stack } from 'expo-router';
import { DraftProvider } from '../../../src/context/DraftContext';

export default function QuoteDetailLayout() {
  return (
    <DraftProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </DraftProvider>
  );
}
