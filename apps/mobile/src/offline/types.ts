export type Data = Record<string, any>;
export type Kind = 'clients' | 'products' | 'quotes' | 'sales' | 'branches' | 'agents';
export interface Row {
    data: Data;
    version?: string;
    deleted?: boolean;
}
export interface Operation {
    id: string;
    path: string;
    method: string;
    body?: Data;
    root?: string;
    base?: string;
    error?: string;
    code?: string;
    attempted?: boolean;
    receipt?: Reply;
    localPayments?: number[];
}
export interface State {
    records: Record<string, Row>;
    values: Record<string, any>;
    queue: Operation[];
    ids: Record<string, number>;
    next: number;
    device: string;
    readyAt?: string;
}
export interface Store {
    load(scope: string): Promise<State | null>;
    save(scope: string, state: State): Promise<void>;
}
export interface Request {
    method?: string;
    body?: unknown;
    token?: string;
    timeoutMs?: number;
    headers?: Record<string, string>;
}
export interface Reply {
    data: any;
    version?: string;
    capability?: boolean;
}
export interface Status {
    online: boolean;
    syncing: boolean;
    pending: number;
    errors: number;
    preparing: boolean;
    readyAt?: string;
    message?: string;
}
export const emptyState = (): State => ({ records: {}, values: {}, queue: [], ids: {}, next: 0, device: Math.random().toString(36).slice(2, 10) });
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export const rootOf = (path: string) => path.match(/^\/api\/(quotes|sales)\/(\d+)(?:\/|$)/)?.slice(1).join('/');
export const keyOf = (kind: string, id: number) => kind + '/' + id;
