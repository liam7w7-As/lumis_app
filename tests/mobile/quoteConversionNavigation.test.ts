import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { sampleQuote } from './documentFixtures';

type Element = { type: unknown; props: Record<string, any> };

function screen(novaled: boolean, saleId: number, reject = false) {
  const routes: string[] = [], requests: { quoteId: number; token: string }[] = [], messages: string[] = [];
  let reloads = 0;
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  class ApiError extends Error {}
  const modules: Record<string, unknown> = {
    react: { useCallback: (fn: unknown) => fn, useRef: (value: unknown) => ({ current: value }), useState: (value: unknown) => [value, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'FlatList', 'Pressable', 'RefreshControl', 'Text', 'TextInput', 'View'].map(key => [key, key])), StyleSheet: { create: (value: unknown) => value } },
    '@expo/vector-icons/Ionicons': { default: 'Icon' },
    'expo-router': { router: { push: (path: string) => routes.push(path), back() {} } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../tutorials/TutorialElements': { TutorialTarget: 'Target', TutorialHelpButton: 'Help', useTutorialAvailability() {}, withTutorial: (component: unknown) => component },
    '../tutorials/TutorialContext': { useTutorial: () => ({ notify() {} }) },
    '../context/AuthContext': { useAuth: () => ({ token: 'conversion-session' }) },
    '../theme/ThemeContext': { useTheme: () => ({ colors: {} }) },
    '../lib/backend': { IS_NOVALED: novaled },
    '../lib/feedback': { feedback: { alert: (_title: string, message: string) => messages.push(message) } },
    '../lib/documentSearch': { searchTerm: (value: string) => value, matchesQuoteSearch: () => true },
    '../hooks/usePagedCollection': { usePagedCollection: () => ({ items: [sampleQuote], loading: false, error: null, load: () => { reloads++; }, loadMore() {}, setItems() {} }) },
    '../hooks/useDocumentEditAccess': { useDocumentEditAccess: () => ({ requestEdit: () => true }) },
    '../components/CollectionFooter': { CollectionFooter: 'Footer' },
    '../components/QuoteCard': { QuoteCard: 'QuoteCard' },
    '../lib/api': { ApiError, api: { saleFromQuote: async (quoteId: number, token: string) => {
      requests.push({ quoteId, token });
      if (reject) throw new ApiError('No se pudo convertir la cotización.');
      return { sale: { id: saleId, number: 800 } };
    } } },
  };
  const source = readFileSync(new URL('../../apps/mobile/src/screens/QuotesScreen.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports: Record<string, () => Element> = {};
  runInNewContext(outputText, { exports, require: (key: string) => { assert.ok(key in modules, key); return modules[key]; } });
  function nodes(value: unknown): Element[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== 'object' || !('props' in value)) return [];
    return [value as Element, ...nodes((value as Element).props.children)];
  }
  const list = nodes(exports.QuotesScreen()).find(node => node.type === 'FlatList');
  assert.ok(list);
  const card = list.props.renderItem({ item: sampleQuote, index: 0 });
  return { routes, requests, messages, reloads: () => reloads, convert: () => card.props.onGenerateSale() };
}

for (const novaled of [false, true]) {
  for (const id of [43, 8000000000000001]) {
    test(`${novaled ? 'Novaled App' : 'Lumis'} abre el detalle de la venta creada ${id} al convertir una cotización`, async () => {
      const app = screen(novaled, id);
      await app.convert();
      assert.deepEqual(app.requests, [{ quoteId: sampleQuote.id, token: 'conversion-session' }]);
      assert.deepEqual(app.routes, [`/pos/${id}`]);
      assert.equal(app.reloads(), 0);
      assert.deepEqual(app.messages, []);
    });
  }
  test(`${novaled ? 'Novaled App' : 'Lumis'} conserva la cotización si falla la conversión`, async () => {
    const app = screen(novaled, 43, true);
    await app.convert();
    assert.deepEqual(app.routes, []);
    assert.deepEqual(app.messages, ['No se pudo convertir la cotización.']);
  });
}
