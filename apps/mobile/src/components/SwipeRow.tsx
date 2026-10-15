import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

export interface SwipeRowHandle {
  close: () => void;
}

interface SwipeRowProps {
  actionsWidth: number;
  renderRightActions: () => ReactNode;
  onOpen?: () => void;
  children: ReactNode;
}

const OPEN_THRESHOLD = 0.35;

export const SwipeRow = forwardRef<SwipeRowHandle, SwipeRowProps>(function SwipeRow(
  { actionsWidth, renderRightActions, onOpen, children },
  ref,
) {
  const translateX = useRef(new Animated.Value(0)).current;
  const settled = useRef(0);
  const callbacks = useRef({ onOpen });
  callbacks.current = { onOpen };

  const animateTo = (to: number) => {
    settled.current = to;
    Animated.spring(translateX, {
      toValue: to,
      useNativeDriver: true,
      stiffness: 300,
      damping: 30,
    }).start(({ finished }) => {
      if (finished && to !== 0) {
        callbacks.current.onOpen?.();
      }
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      close: () => {
        if (settled.current !== 0) {
          animateTo(0);
        }
      },
    }),
    [],
  );

  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gesture) => {
        const next = settled.current + gesture.dx;
        translateX.setValue(Math.max(-actionsWidth - 60, Math.min(next, 24)));
      },
      onPanResponderTerminate: () => {
        animateTo(settled.current);
      },
      onPanResponderRelease: (_, gesture) => {
        const width = actionsWidth;
        let to = settled.current;
        if (settled.current === 0) {
          if (gesture.dx < -width * OPEN_THRESHOLD || gesture.vx < -0.6) {
            to = -width;
          }
        } else if (gesture.dx > width * OPEN_THRESHOLD || gesture.vx > 0.6) {
          to = 0;
        }
        animateTo(to);
      },
    }),
  ).current;

  return (
    <View>
      <View style={[styles.actions, { width: actionsWidth }]}>{renderRightActions()}</View>
      <Animated.View
        style={[styles.content, { transform: [{ translateX }] }]}
        {...responder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  actions: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
  },
  content: {
    flex: 1,
  },
});
