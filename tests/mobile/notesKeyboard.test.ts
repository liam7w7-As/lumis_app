import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function harness() {
  const slots: any[] = [], effects: (() => void)[] = [], cleanups: (() => void)[] = [];
  let cursor = 0, frameId = 0;
  const frames = new Map<number, () => void>(), listeners = new Map<string, () => void>();
  const scrolled: { y: number; animated: boolean }[] = [];
  const layout = { top: 20, height: 780, inputTop: 650, inputHeight: 90, keyboardTop: 500 as number | undefined, focused: true };
  let deferred: (() => void) | null = null, deferMeasure = false;
  const react = {
    useRef(value: unknown) { const i = cursor++; slots[i] ??= { current: value }; return slots[i]; },
    useState(value: unknown) { const i = cursor++; slots[i] ??= value; return [slots[i], (next: unknown) => { slots[i] = next; }]; },
    useCallback(callback: unknown, deps: unknown[]) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, j) => value !== previous.deps[j])) slots[i] = { callback, deps };
      return slots[i].callback;
    },
    useEffect(callback: () => () => void, deps: unknown[]) {
      const i = cursor++;
      if (!slots[i]) { slots[i] = deps; effects.push(() => cleanups.push(callback())); }
    },
  };
  const keyboard = {
    metrics: () => layout.keyboardTop === undefined ? undefined : { screenY: layout.keyboardTop },
    addListener(name: string, callback: () => void) { listeners.set(name, callback); return { remove: () => listeners.delete(name) }; },
  };
  const modules: Record<string, unknown> = { react, 'react-native': { Keyboard: keyboard },
    '../context/MotionContext': { useReducedMotion: () => true } };
  const source = readFileSync(new URL('../../apps/mobile/src/hooks/useKeyboardAwareNotes.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  const exports: Record<string, () => any> = {};
  runInNewContext(outputText, { exports,
    requestAnimationFrame(callback: () => void) { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame(id: number) { frames.delete(id); },
    require(name: string) { assert.ok(name in modules, name); return modules[name]; },
  });
  const input = { isFocused: () => layout.focused,
    measureInWindow(callback: (...args: number[]) => void) { callback(0, layout.inputTop, 300, layout.inputHeight); } };
  const scroll = { scrollTo(value: { y: number; animated: boolean }) { scrolled.push({ ...value }); },
    getNativeScrollRef: () => ({ measureInWindow(callback: (...args: number[]) => void) {
      const complete = () => callback(0, layout.top, 320, layout.height);
      if (deferMeasure) deferred = complete; else complete();
    } }),
  };
  let result: any;
  const render = () => {
    cursor = 0; result = exports.useKeyboardAwareNotes();
    result.scrollRef.current = scroll; result.inputRef.current = input;
    effects.splice(0).forEach(run => run()); return result;
  };
  render();
  return { layout, scrolled, listeners, render, notes: () => result,
    offset(y: number) { result.onScroll({ nativeEvent: { contentOffset: { y } } }); },
    flush() { const batch = [...frames.values()]; frames.clear(); batch.forEach(run => run()); },
    defer() { deferMeasure = true; }, completeMeasure() { deferred?.(); },
    unmount() { cleanups.forEach(run => run()); }, pending: () => frames.size,
  };
}

test('las notas bajo el teclado suben respetando el desplazamiento de una lista larga', () => {
  const app = harness(); app.offset(1800);
  app.listeners.get('keyboardDidShow')!(); app.flush();
  assert.deepEqual(app.scrolled, [{ y: 2064, animated: false }]);
  app.offset(2064); app.layout.inputTop = 386;
  app.notes().reveal(); app.flush();
  assert.equal(app.scrolled.length, 1, 'escribir con el cuadro visible no hace saltar la pantalla');
});

test('el cambio de tamaño del scroll revela las notas aunque Android no emita eventos del teclado', () => {
  const app = harness(); app.layout.keyboardTop = undefined; app.layout.height = 460; app.offset(1000);
  app.notes().reveal(); app.flush();
  assert.deepEqual(app.scrolled, [{ y: 1284, animated: false }]);
});

test('las notas largas se limitan al espacio visible antes de desplazar la página', () => {
  const app = harness(); app.layout.height = 200; app.layout.inputHeight = 500;
  app.notes().reveal(); app.flush();
  assert.equal(app.render().inputStyle.maxHeight, 152);
  assert.equal(app.scrolled.length, 0, 'espera el layout del editor para evitar saltos entre sus extremos');
  app.layout.inputHeight = 152; app.notes().reveal(); app.flush();
  assert.deepEqual(app.scrolled, [{ y: 606, animated: false }]);
});

test('las mediciones tardías no desplazan una pantalla desenfocada ni desmontada', () => {
  const app = harness(); app.defer(); app.notes().reveal(); app.flush();
  app.layout.focused = false; app.completeMeasure();
  assert.equal(app.scrolled.length, 0);
  app.layout.focused = true; app.notes().reveal(); app.flush(); app.unmount(); app.completeMeasure();
  assert.equal(app.scrolled.length, 0); assert.equal(app.listeners.size, 0);
});

test('selección, contenido y teclado comparten un frame y se cancelan al salir', () => {
  const app = harness(); app.notes().reveal(); app.notes().reveal();
  app.listeners.get('keyboardDidChangeFrame')!();
  assert.equal(app.pending(), 1);
  app.unmount(); assert.equal(app.pending(), 0); app.flush();
  assert.equal(app.scrolled.length, 0);
});
