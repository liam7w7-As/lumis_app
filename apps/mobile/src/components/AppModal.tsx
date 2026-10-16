import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { Modal, Platform, View } from 'react-native';
import type { ModalProps } from 'react-native';
import { useReducedMotion } from '../context/MotionContext';
import {
  activeFeedbackHost, feedback, getFeedbackSnapshot, registerFeedbackHost,
  subscribeFeedback, unregisterFeedbackHost,
} from '../lib/feedback';
import { FeedbackLayer } from './FeedbackDialog';

/** Las notificaciones se dibujan dentro del modal activo, también en iOS. */
export function AppModal({ visible = true, children, onRequestClose, onDismiss, ...props }: ModalProps) {
  const id = useId();
  const reducedMotion = useReducedMotion();
  const pendingRemoval = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshot = useSyncExternalStore(subscribeFeedback, getFeedbackSnapshot);
  const hasFeedback = activeFeedbackHost(snapshot) === id && snapshot.messages.length > 0;
  useEffect(() => {
    if (!visible) return;
    if (pendingRemoval.current) clearTimeout(pendingRemoval.current);
    registerFeedbackHost(id);
    return () => {
      if (Platform.OS === 'ios') pendingRemoval.current = setTimeout(() => unregisterFeedbackHost(id), 350);
      else unregisterFeedbackHost(id);
    };
  }, [id, visible]);

  return (
    <Modal {...props} visible={visible} transparent={props.transparent ?? true}
      statusBarTranslucent={props.statusBarTranslucent ?? true}
      animationType={reducedMotion ? 'none' : (props.animationType ?? 'fade')}
      onDismiss={() => { if (!visible) unregisterFeedbackHost(id); onDismiss?.(); }}
      onRequestClose={(event) => { if (hasFeedback) feedback.dismiss(); else onRequestClose?.(event); }}>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }} accessibilityElementsHidden={hasFeedback}
          importantForAccessibility={hasFeedback ? 'no-hide-descendants' : 'auto'}>
          {children}
        </View>
        <FeedbackLayer hostId={id} />
      </View>
    </Modal>
  );
}
