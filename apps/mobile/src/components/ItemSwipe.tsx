import { TutorialTarget } from '../tutorials/TutorialElements';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SwipeActions, SWIPE_ACTIONS_WIDTH } from './SwipeActions';
import { SwipeRow, type SwipeRowHandle } from './SwipeRow';

export function ItemSwipe({ children, disabled, tutorialRow = false, proLocked=false, onEdit, onDelete, onDuplicate, onMove }: {
  children: ReactNode; disabled?: boolean; tutorialRow?: boolean;
  proLocked?:boolean;
  onEdit: () => void; onDelete: () => void; onDuplicate: () => void; onMove: () => void;
}) {
  const ref = useRef<SwipeRowHandle>(null);
  const actions = [
    { label: 'Editar', icon: 'pencil-outline', run: onEdit },
    { label: 'Eliminar', icon: 'trash-outline', run: onDelete },
    { label: 'Duplicar', icon: 'copy-outline', run: onDuplicate },
    { label: 'Mover', icon: 'move-outline', run: onMove },
  ] as const;
  const content = disabled ? <View>{children}</View> : <View style={styles.clip}>
    <SwipeRow ref={ref} actionsWidth={SWIPE_ACTIONS_WIDTH} renderRightActions={() =>
      <SwipeActions actions={actions.map((action) => ({ label: action.label+(proLocked?' · Pro':''), icon: proLocked?'lock-closed-outline':action.icon,
        onPress: () => { ref.current?.close(); action.run(); } }))} />}>
      {children}
    </SwipeRow>
  </View>;
  return tutorialRow ? <TutorialTarget id="row" onShow={() => { if (!disabled) ref.current?.open(); }}
    onHide={() => ref.current?.close()}>{content}</TutorialTarget> : content;
}
const styles = StyleSheet.create({
  clip: { borderRadius: 14, overflow: 'hidden' },
});
