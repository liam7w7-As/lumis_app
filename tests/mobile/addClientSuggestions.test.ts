import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { Client } from '../../apps/mobile/src/lib/api';
import { matchingClients } from '../../apps/mobile/src/lib/clientSuggestions';

type Element = { type: unknown; props: Record<string, any> };
type Form = { name: string; phone: string; email: string };
type Effect = { deps: unknown[]; cleanup?: () => void; focus: boolean; active: boolean };
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const saved = (id: number, name: string, phone: string | null = null): Client => ({ id, name, phone, email: null });

function harness(options: { initial?: Partial<Form>; clients?: Client[]; clear?: () => Promise<void> } = {}) {
  const hooks: any[] = [];
  let cursor = 0, effects: (() => void)[] = [], focused = true;
  let form: Form = { name: '', phone: '', email: '', ...options.initial };
  let token: string | null = 'client-session', backs = 0, clearCalls = 0, keyboardDismisses = 0;
  const selected: Client[] = [];
  const messages: { title: string; message: string }[] = [];
  const requests: { body: Form; token: string; result: ReturnType<typeof deferred<{ client: Client }>> }[] = [];
  const suggestionCalls: { name: string; token: string | null; enabled: boolean }[] = [];
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (value: unknown) => { hooks[index] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(hooks[index]) : value; }];
    },
    useRef(initial: unknown) { const index = cursor++; if (!(index in hooks)) hooks[index] = { current: initial }; return hooks[index]; },
    useCallback(value: unknown, deps: unknown[]) {
      const index = cursor++, previous = hooks[index];
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) hooks[index] = { value, deps };
      return hooks[index].value;
    },
    useLayoutEffect: (callback: () => void | (() => void), deps: unknown[]) => effect(callback, deps),
  };
  function effect(callback: () => void | (() => void), deps: unknown[], focus = false) {
    const index = cursor++, previous = hooks[index] as Effect | undefined;
    if (focus && !focused) return;
    if (!previous || deps.some((dep, i) => dep !== previous.deps[i]) || (focus && !previous.active)) effects.push(() => {
      previous?.cleanup?.(); hooks[index] = { deps, cleanup: callback(), focus, active: true };
    });
  }
  const blur = () => {
    focused = false;
    for (const value of hooks) if (value?.focus && value.active) { value.cleanup?.(); value.active = false; }
  };
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  class ApiError extends Error {}
  const message = (title: string, text = '') => { messages.push({ title, message: text }); };
  const modules: Record<string, unknown> = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'Text', 'View'].map(name => [name, name])),
      Keyboard: { dismiss() { keyboardDismisses++; } }, Platform: { OS: 'android' }, StyleSheet: { create: (value: unknown) => value, hairlineWidth: 1 } },
    '@expo/vector-icons/Ionicons': { default: 'Icon' },
    'expo-router': { router: { back() { backs++; blur(); } }, useFocusEffect: (callback: () => void | (() => void)) => effect(callback, [callback], true) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '../tutorials/TutorialElements': { TutorialTarget: 'TutorialTarget', TutorialScrollView: 'TutorialScrollView', TutorialHelpButton: 'Help', useTutorialAvailability() {}, withTutorial: (component: unknown) => component },
    '../lib/feedback': { feedback: { warning: message, error: message } },
    '../context/AuthContext': { useAuth: () => ({ token }) },
    '../context/DraftContext': { useDraft: () => ({ setClient(client: Client) { selected.push(client); } }) },
    '../theme/ThemeContext': { useTheme: () => ({ colors: { text: '#111', muted: '#777', primary: '#5842f4', onPrimary: '#fff', border: '#ddd', background: '#fff' } }) },
    '../lib/api': { ApiError, api: { createClient(body: Form, auth: string) { const result = deferred<{ client: Client }>(); requests.push({ body, token: auth, result }); return result.promise; } } },
    '../components/AnimatedInput': { AnimatedInput: 'Input' },
    '../components/FormDraftNotice': { FormDraftNotice: 'DraftNotice' },
    '../lib/formDrafts': { EMPTY_CLIENT_FORM: { name: '', phone: '', email: '' }, readClientForm: (value: unknown) => value },
    '../hooks/useFormDraft': { useFormDraft: () => ({ value: form, ready: true, status: 'saved', hasDraft: !!form.name, restored: !!options.initial,
      update(patch: Partial<Form>) { form = { ...form, ...patch }; },
      async clear() { clearCalls++; await options.clear?.(); form = { name: '', phone: '', email: '' }; }, retry() {} }) },
    '../hooks/useClientSuggestions': { useClientSuggestions(name: string, auth: string | null, enabled: boolean) {
      suggestionCalls.push({ name, token: auth, enabled });
      return { query: name, clients: enabled && name.trim().length >= 2 ? matchingClients(options.clients ?? [], name) : [], loading: false, error: null, retry() {} };
    } },
  };
  const source = readFileSync(new URL('../../apps/mobile/src/screens/AddClientScreen.tsx', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
  const exports: any = {};
  runInNewContext(outputText, { Error, exports, require(name: string) { assert.ok(name in modules, name); return modules[name]; } });
  let tree: Element;
  function nodes(value: unknown): Element[] {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== 'object' || !('props' in value)) return [];
    const element = value as Element; return [element, ...nodes(element.props.children)];
  }
  function text(value: unknown): string {
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(text).join('');
    return value && typeof value === 'object' && 'props' in value ? text((value as Element).props.children) : '';
  }
  return {
    requests, selected, messages, suggestionCalls,
    render() { cursor = 0; effects = []; tree = exports.AddClientScreen(); effects.forEach(run => run()); return tree; },
    inputs: () => nodes(tree).filter(node => node.type === 'Input'),
    nameInput() { return this.inputs().find(node => node.props.placeholder === 'Cliente / Empresa')!; },
    suggestions: () => nodes(tree).filter(node => node.props.accessibilityLabel?.startsWith('Usar cliente ')),
    elements: () => nodes(tree),
    save() { const node = nodes(tree).find(node => node.type === 'Pressable' && text(node.props.children) === 'Guardar'); assert.ok(node); return node.props.onPress as () => Promise<void>; },
    leave: blur,
    changeToken(next: string | null) { token = next; },
    snapshot: () => ({ form: { ...form }, backs, clearCalls, keyboardDismisses }),
  };
}

test('typing a client name displays matching saved clients below all form inputs, including homonyms', () => {
  const app = harness({ clients: [saved(1, 'UMSA', '71111111'), saved(2, 'UMSA', '72222222'), saved(3, 'Otro')] });
  app.render(); assert.equal(app.suggestions().length, 0);
  app.nameInput().props.onChangeText('U'); app.render(); assert.equal(app.suggestions().length, 0);
  app.nameInput().props.onChangeText('UM'); app.render(); assert.equal(app.suggestions().length, 2);
  const elements = app.elements();
  assert.ok(elements.indexOf(app.suggestions()[0]) > elements.indexOf(app.inputs().at(-1)!));
  assert.deepEqual(app.suggestions().map(node => node.props.children[0].props.children[1].props.children), ['71111111', '72222222']);
});

test('picking a saved client reuses its exact ID and clears the draft without creating another record', async () => {
  const expected = saved(2, 'UMSA', '72222222');
  const app = harness({ initial: { name: 'UM', phone: 'borrador' }, clients: [saved(1, 'UMSA', '71111111'), expected] });
  app.render(); app.suggestions()[1].props.onPress(); await tick();
  assert.deepEqual(plain(app.selected), [expected]); assert.equal(app.requests.length, 0);
  assert.equal(app.snapshot().clearCalls, 1); assert.equal(app.snapshot().backs, 1);
  assert.equal(app.snapshot().keyboardDismisses, 1);
});

test('rapid suggestion and save taps share the selection lock and never create duplicate clients', async () => {
  const cleared = deferred<void>();
  const app = harness({ initial: { name: 'UMSA' }, clients: [saved(1, 'UMSA')], clear: () => cleared.promise });
  app.render(); const pick = app.suggestions()[0].props.onPress, save = app.save();
  pick(); pick(); await save();
  assert.equal(app.selected.length, 1); assert.equal(app.requests.length, 0); assert.equal(app.snapshot().backs, 0);
  cleared.resolve(); await tick();
  assert.equal(app.snapshot().clearCalls, 1); assert.equal(app.snapshot().backs, 1);
});

test('queued handlers after selecting a client and leaving cannot run a second selection or create', async () => {
  const app = harness({ initial: { name: 'UMSA' }, clients: [saved(1, 'UMSA')] });
  app.render(); const pick = app.suggestions()[0].props.onPress, save = app.save();
  pick(); await tick();
  assert.equal(app.snapshot().backs, 1);
  pick(); await save(); await tick();
  assert.equal(app.requests.length, 0); assert.equal(app.selected.length, 1);
  assert.equal(app.snapshot().clearCalls, 1); assert.equal(app.snapshot().backs, 1);
});

test('a new client still saves normally and two immediate save taps issue only one create request', async () => {
  const app = harness({ initial: { name: '  Empresa nueva  ', phone: ' 70000000 ', email: ' nueva@example.test ' } });
  app.render(); const save = app.save(), sending = save(); await save();
  assert.equal(app.requests.length, 1);
  assert.deepEqual(plain(app.requests[0].body), { name: 'Empresa nueva', phone: '70000000', email: 'nueva@example.test' });
  app.requests[0].result.resolve({ client: saved(99, 'Empresa nueva') }); await sending;
  assert.deepEqual(app.selected.map(client => client.id), [99]); assert.equal(app.snapshot().backs, 1);
});

test('a restored draft and a newly typed long name keep their full text while suggestions are queried', () => {
  const original = 'Cliente ' + 'a'.repeat(125);
  const app = harness({ initial: { name: original, phone: '70000000', email: 'guardado@example.test' } });
  app.render(); assert.equal(app.nameInput().props.value, original); assert.equal(app.suggestionCalls.at(-1)?.name, original);
  const edited = original + ' final'; app.nameInput().props.onChangeText(edited); app.render();
  assert.equal(app.nameInput().props.value, edited); assert.equal(app.snapshot().form.name, edited);
  assert.equal(app.snapshot().form.phone, '70000000'); assert.equal(app.suggestionCalls.at(-1)?.name, edited);
});

for (const leave of ['blur', 'account-change'] as const) test(`a pending create response after ${leave} cannot select a client, clear a draft or navigate`, async () => {
  const app = harness({ initial: { name: 'Cliente pendiente' } });
  app.render(); const sending = app.save()(); assert.equal(app.requests.length, 1);
  if (leave === 'blur') app.leave(); else { app.changeToken('another-session'); app.render(); }
  app.requests[0].result.resolve({ client: saved(12, 'Cliente pendiente') }); await sending;
  assert.equal(app.selected.length, 0); assert.equal(app.snapshot().clearCalls, 0); assert.equal(app.snapshot().backs, 0);
  assert.equal(app.snapshot().form.name, 'Cliente pendiente');
});
