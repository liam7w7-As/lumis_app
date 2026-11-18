import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView, type TextInput } from 'react-native';
import { useReducedMotion } from '../context/MotionContext';

/** Keeps a multiline editor inside the visible part of its document's scroll view. */
export function useKeyboardAwareNotes() {
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const offset = useRef(0);
  const pendingFrame = useRef<number | null>(null);
  const measurement = useRef(0);
  const mounted = useRef(true);
  const reducedMotion = useReducedMotion();
  const [maxHeight, setMaxHeight] = useState(200);

  const keepVisible = useCallback(() => {
    const input = inputRef.current, scroll = scrollRef.current;
    if (!mounted.current || !input?.isFocused() || !scroll) return;
    const request = ++measurement.current;
    const current = () => mounted.current && request === measurement.current
      && inputRef.current === input && scrollRef.current === scroll && input.isFocused();
    scroll.getNativeScrollRef()?.measureInWindow((_x, top, _width, height) => {
      if (!current() || height <= 0) return;
      const visibleTop = top + 24;
      const visibleBottom = Math.min(top + height, Keyboard.metrics()?.screenY ?? Infinity) - 24;
      const limit = Math.max(44, Math.min(200, Math.floor(visibleBottom - visibleTop)));
      setMaxHeight(limit);
      input.measureInWindow((_ix, inputTop, _iw, inputHeight) => {
        if (!current() || inputHeight <= 0 || visibleBottom <= visibleTop) return;
        // A bounded text field scrolls its own long text to keep the caret visible.
        // Its next onLayout measures the resized editor before moving the page.
        if (inputHeight > limit + 1) return;
        let next = offset.current;
        if (inputTop + inputHeight > visibleBottom) next += inputTop + inputHeight - visibleBottom;
        else if (inputTop < visibleTop) next += inputTop - visibleTop;
        next = Math.max(0, next);
        if (Math.abs(next - offset.current) > 1) scroll.scrollTo({ y: next, animated: !reducedMotion });
      });
    });
  }, [reducedMotion]);

  const reveal = useCallback(() => {
    if (!mounted.current) return;
    measurement.current += 1;
    if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = null;
      keepVisible();
    });
  }, [keepVisible]);

  useEffect(() => {
    mounted.current = true;
    const show = Keyboard.addListener('keyboardDidShow', reveal);
    const change = Keyboard.addListener('keyboardDidChangeFrame', reveal);
    return () => {
      mounted.current = false;
      measurement.current += 1;
      if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
      show.remove(); change.remove();
    };
  }, [reveal]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = event.nativeEvent.contentOffset.y;
  }, []);

  return { scrollRef, inputRef, onScroll, reveal, inputStyle: { minHeight: Math.min(90, maxHeight), maxHeight } };
}
