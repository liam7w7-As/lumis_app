import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

type Element = { type: unknown; props: Record<string, unknown> };
function render(footer?: Element) {
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const modules: Record<string, unknown> = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ...Object.fromEntries(['KeyboardAvoidingView', 'Pressable', 'ScrollView', 'Text', 'View'].map(name => [name, name])),
      Platform: { OS: 'android' }, StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 } },
    '@expo/vector-icons/Ionicons': { default: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
    '../theme/ThemeContext': { useTheme: () => ({ colors: { primary: '#5842f4', border: '#ddd', background: '#fff', surface: '#fff' } }) },
    './AppModal': { AppModal: 'AppModal' },
  };
  const source = readFileSync(new URL('../../apps/mobile/src/components/FormModal.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports = {} as { FormModal: (props: Record<string, unknown>) => Element };
  runInNewContext(outputText, { exports, require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  const scrollRef = { current: null };
  const content = jsx('Field', {});
  return { tree: exports.FormModal({ visible: true, title: 'Escaneo', onClose() {}, children: content, footer, scrollRef }), scrollRef, content };
}
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children)];
}
test('el pie del modal se monta fuera de su ScrollView y reenvía la referencia de navegación', () => {
  const button = { type: 'Button', props: { title: 'Añadir' } };
  const { tree, scrollRef, content } = render(button);
  const list = nodes(tree).find(node => node.type === 'ScrollView')!;
  assert.equal(list.props.ref, scrollRef);
  assert.equal(list.props.children, content);
  assert.ok(!nodes(list).includes(button));
  assert.ok(nodes(tree).includes(button));
});
test('los modales sin pie conservan su contenido y cierre habituales', () => {
  const { tree, content } = render();
  assert.equal(nodes(tree).filter(node => node.type === 'ScrollView').length, 1);
  assert.ok(nodes(tree).includes(content));
  assert.ok(nodes(tree).some(node => node.props.accessibilityLabel === 'Cerrar formulario'));
});

test('el arrastre del contenido no compite con un contenedor pulsable', () => {
  const { tree } = render({ type: 'Button', props: { title: 'Añadir' } });
  const visit = (element: Element, ancestors: Element[] = []): void => {
    if (element.type === 'ScrollView') {
      assert.ok(!ancestors.some(parent => parent.type === 'Pressable'), 'El contenedor no debe reclamar los gestos del ScrollView');
      assert.equal(element.props.keyboardDismissMode, 'on-drag');
      return;
    }
    const children = [element.props.children].flat(Infinity) as unknown[];
    for (const child of children) if (child && typeof child === 'object' && 'props' in child) visit(child as Element, [...ancestors, element]);
  };
  visit(tree);
  const backdrop = nodes(tree).find(node => node.type === 'Pressable' && node.props.accessible === false)!;
  assert.equal(typeof backdrop.props.onPress, 'function', 'Tocar fuera del formulario sigue cerrándolo');
});
