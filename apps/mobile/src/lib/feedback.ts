export type FeedbackKind = 'success' | 'error' | 'warning' | 'info';
export interface FeedbackAction {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void | Promise<unknown>;
}
export interface FeedbackOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
}
export interface FeedbackMessage {
  id: number;
  kind: FeedbackKind;
  title: string;
  message: string;
  actions: FeedbackAction[];
  options: FeedbackOptions;
}
interface FeedbackState {
  messages: FeedbackMessage[];
  hosts: string[];
}
let state: FeedbackState = { messages: [], hosts: [] };
let nextId = 0;
const listeners = new Set<() => void>();
function publish(next: FeedbackState) {
  state = next;
  listeners.forEach((listener) => listener());
}
export function subscribeFeedback(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const getFeedbackSnapshot = () => state;
export function registerFeedbackHost(id: string) {
  if (!state.hosts.includes(id)) publish({ ...state, hosts: [...state.hosts, id] });
}
export function unregisterFeedbackHost(id: string) {
  if (state.hosts.includes(id)) publish({ ...state, hosts: state.hosts.filter((host) => host !== id) });
}
export const activeFeedbackHost = (snapshot: FeedbackState) => snapshot.hosts.at(-1) ?? 'root';

function inferKind(title: string, message: string, actions: FeedbackAction[]): FeedbackKind {
  if (/error|no se pudo|no pudimos|no disponible|sin conexi[oó]n/i.test(title + ' ' + message)) return 'error';
  if (actions.some((action) => action.style === 'destructive') ||
      /falta|inv[aá]lid|revisa|permiso|vac[ií]|sin art[ií]|no se puede|grande|no compatible/i.test(title)) return 'warning';
  if (/guardad|cread|generad|realizad|pagad|copiad|registrad|actualizad/i.test(title)) return 'success';
  return 'info';
}
function show(kind: FeedbackKind, title: string, message: string, actions?: FeedbackAction[], options: FeedbackOptions = {}) {
  const buttons = actions?.length ? actions : [{ text: kind === 'success' ? 'Listo' : 'Entendido' }];
  // Un fallo repetido no debe llenar la pantalla con el mismo mensaje.
  const last = state.messages.at(-1);
  if (last?.title === title && last.message === message && !actions) return last.id;
  const entry: FeedbackMessage = { id: ++nextId, kind, title, message, actions: buttons, options };
  publish({ ...state, messages: [...state.messages, entry] });
  return entry.id;
}
function remove(id: number) {
  const entry = state.messages.find((message) => message.id === id);
  if (entry) publish({ ...state, messages: state.messages.filter((message) => message.id !== id) });
  return entry;
}
async function invoke(action?: () => void | Promise<unknown>) {
  if (!action) return;
  try { await action(); }
  catch (err) { show('error', 'No se pudo completar', err instanceof Error ? err.message : 'Inténtalo de nuevo.'); }
}
export const feedback = {
  alert(title: string, message = '', actions?: FeedbackAction[], options?: FeedbackOptions) {
    const kind = inferKind(title, message, actions ?? []);
    return show(kind, title === 'Error' ? 'No se pudo completar' : title, message, actions, options);
  },
  success(title: string, message: string, actions?: FeedbackAction[]) { return show('success', title, message, actions); },
  error(title: string, message: string, actions?: FeedbackAction[]) { return show('error', title, message, actions); },
  warning(title: string, message: string, actions?: FeedbackAction[]) { return show('warning', title, message, actions); },
  info(title: string, message: string, actions?: FeedbackAction[]) { return show('info', title, message, actions); },
  async press(id: number, index: number, delay = 0) {
    const current = state.messages[0];
    if (current?.id !== id || !current.actions[index]) return;
    const action = current.actions[index];
    remove(id);
    if (delay) await new Promise<void>((resolve) => setTimeout(resolve, delay));
    await invoke(action.onPress);
  },
  dismiss() {
    const current = state.messages[0];
    if (!current || current.options.cancelable === false) return;
    remove(current.id);
    void invoke(current.options.onDismiss ?? current.actions.find((action) => action.style === 'cancel')?.onPress ??
      (current.kind === 'success' && current.actions.length === 1 ? current.actions[0].onPress : undefined));
  },
  clear() { publish({ ...state, messages: [] }); },
};
