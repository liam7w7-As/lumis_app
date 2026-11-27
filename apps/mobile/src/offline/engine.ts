import { applyMutation, kinds, readLocal, rows, singular } from './model';
import { matchingClients } from '../lib/clientSuggestions';
import { clone, emptyState, keyOf, rootOf, type Data, type Operation, type Reply, type Request, type State, type Status, type Store } from './types';
type IO = {
    store: Store;
    scope: string;
    user: Data;
    connected: boolean;
    send(path: string, options: Request): Promise<Reply>;
    changed?(): void;
    assets?(business: Data): Promise<void>;
};
const onlineOnly = (path: string) => /^\/api\/auth\/(users|login|register|logout)$/.test(path) || path === '/api/quotes/scan';
const errorStatus = (error: any) => typeof error?.status === 'number' ? error.status : undefined;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'No se pudo sincronizar el cambio.';
export function createOfflineEngine(io: IO) {
    let state: State = emptyState();
    let active = true;
    let online = true;
    let syncing = false;
    let preparing = false;
    let message = '';
    let revision = 0;
    let snapshot: Status = { online: true, syncing: false, pending: 0, errors: 0, preparing: false };
    const listeners = new Set<() => void>();
    let serial: Promise<unknown> = Promise.resolve();
    let flight: Promise<void> | null = null;
    const publish = () => { snapshot = { online, syncing, pending: state.queue.length, errors: state.queue.filter(op => op.error && !['NETWORK_ERROR', 'TIMEOUT'].includes(op.code ?? '')).length, preparing, readyAt: state.readyAt, message }; listeners.forEach(fn => fn()); io.changed?.(); };
    function exclusive<T>(fn: () => Promise<T>): Promise<T> { const next = serial.catch(() => { }).then(fn); serial = next; return next; }
    async function edit<T>(fn: () => T, mutation = false): Promise<T> {
        return exclusive(async () => { if (!active)
            throw Error('La sesión cambió.'); const before = clone(state); try {
            const result = fn();
            await io.store.save(io.scope, state);
            if (mutation)
                revision++;
            publish();
            return result;
        }
        catch (e) {
            state = before;
            throw e;
        } });
    }
    const hasPending = (root: string) => state.queue.some(op => op.root === root || op.path === '/api/' + root);
    const remapPath = (path: string) => path.replace(/\d+/g, id => String(state.ids[id] ?? id));
    function remapBody(body: any, field = ''): any {
        if (typeof body === 'number' && /^(id|clientId|productId|branchId|agentId|quoteId|itemIds)$/.test(field))
            return state.ids[body] ?? body;
        if (Array.isArray(body))
            return body.map(value => remapBody(value, field));
        if (body && typeof body === 'object')
            return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, remapBody(value, key)]));
        return body;
    }
    function localIdFor(remote: number, kind: string) {
        const alias = Object.entries(state.ids).find(([local, value]) => value === remote && (!!state.records[keyOf(kind, Number(local))] || ['items', 'payments'].includes(kind) && Object.values(state.records).some(row => (row.data[kind] ?? []).some((value: Data) => value.id === Number(local)))));
        return alias ? Number(alias[0]) : remote;
    }
    function normalize(data: Data, kind: string): Data {
        const next = clone(data);
        // Lumis uses the server ID as its document number. Preserve that visible
        // reference before replacing the navigation ID with its stable local alias.
        if ((kind === 'quotes' || kind === 'sales') && next.number == null) next.number = data.id;
        next.id = localIdFor(next.id, kind);
        if (next.clientId)
            next.clientId = localIdFor(next.clientId, 'clients');
        if (next.client)
            next.client.id = next.clientId;
        if (next.branchId)
            next.branchId = localIdFor(next.branchId, 'branches');
        if (next.agentId)
            next.agentId = localIdFor(next.agentId, 'agents');
        if (next.items)
            next.items = next.items.map((it: Data) => ({ ...it, id: localIdFor(it.id, 'items'), productId: it.productId ? localIdFor(it.productId, 'products') : null }));
        if (next.payments)
            next.payments = next.payments.map((p: Data) => ({ ...p, id: localIdFor(p.id, 'payments') }));
        return next;
    }
    function validate(path: string, method: string, body: Data) {
        if (path === '/api/auth/preferences')
            return;
        const kind = path.match(/^\/api\/(quotes|sales|clients|products|branches|agents)/)?.[1];
        const perms = io.user.permissions;
        if (io.connected && perms) {
            if (kind === 'quotes' && (!perms.viewQuotes || !perms.createQuotes))
                throw Error('Tu cuenta no puede crear o modificar cotizaciones.');
            if (kind === 'sales' && (!perms.viewSales || method === 'POST' && (/^\/api\/sales$/.test(path) || path.endsWith('/from-quote') || path.endsWith('/duplicate')) && !perms.createSales))
                throw Error('Tu cuenta no puede crear o modificar ventas.');
            if (path.includes('/payments') && !perms.takePayments)
                throw Error('Tu cuenta no puede registrar cobros.');
        }
        if (!io.connected) {
            const license = state.values['/api/license']?.license;
            if (!license)
                throw Error('Conéctate para descargar y validar el plan de tu empresa.');
            const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
            if (license.readOnly || !license.hasSeat || (license.expiresOn && license.expiresOn < today))
                throw Error('Tu plan permite consultar y exportar. Conéctate para revisar la licencia.');
            if (path === '/api/business' && Object.hasOwn(body, 'color_primario') && !license.features.brandColors)
                throw Error('La paleta de colores está disponible en Pro y Plus.');
            if (!license.features.editDocuments && /^\/api\/(quotes|sales)\/\d+(\/|$)/.test(path)) {
                const operation = /\/(duplicate|deliver|receipt|payments)(\/\d+)?$/.test(path) && !path.includes('/items/');
                const allowed = path.startsWith('/api/quotes') ? ['status', 'includeSeal', 'showNotes', 'includeSignature'] : ['estadoPago', 'metodoPago', 'notaPago', 'transferenciaNumero', 'comprobanteUrl', 'includeSello', 'showNotes', 'includeSignature'];
                const option = method === 'PATCH' && /^\/api\/(quotes|sales)\/\d+$/.test(path) && Object.keys(body).length > 0 && Object.keys(body).every(key => allowed.includes(key));
                if (!operation && !option)
                    throw Error('Modificar documentos guardados está disponible en Pro y Plus.');
            }
            if (method === 'POST' && (/^\/api\/(quotes|sales)$/.test(path) || path === '/api/sales/from-quote' || path.endsWith('/duplicate') || path.endsWith('/deliver'))) {
                const quota = path.endsWith('/deliver') ? 'deliveries' : kind;
                const used = state.queue.filter(op => op.method === 'POST' && (quota === 'deliveries' ? op.path.endsWith('/deliver') : op.path === '/api/' + quota || quota === 'sales' && op.path === '/api/sales/from-quote' || op.path.startsWith('/api/' + quota + '/') && /\/duplicate$/.test(op.path))).length;
                const remaining = license.quotas?.[quota ?? '']?.remaining;
                if (remaining != null && used + (state.values.confirmedQuota?.[quota ?? ''] ?? 0) >= remaining)
                    throw Error('Has alcanzado el cupo disponible de tu plan. Sincroniza o revisa tu licencia.');
            }
            if (io.user.role !== 'admin' && (/\/api\/(business|branches|agents)/.test(path)))
                throw Error('Solo un administrador puede modificar la empresa y sus vendedores.');
        }
    }
    async function accept(path: string, reply: Reply, expectedRevision: number) {
        if (!active)
            return;
        await edit(() => {
            state.values.capability = reply.capability === true || state.values.capability === true;
            if (path === '/api/license')
                state.values.confirmedQuota = {};
            if (path === '/api/auth/me' && reply.data.user) {
                if (reply.data.user.id !== io.user.id || reply.data.user.businessId !== io.user.businessId)
                    throw Error('La cuenta cambió de empresa. Vuelve a iniciar sesión.');
                Object.assign(io.user, reply.data.user);
            }
            const detail = path.match(/^\/api\/(quotes|sales)\/(\d+)$/);
            if (detail) {
                const kind = detail[1];
                const id = localIdFor(Number(detail[2]), kind);
                const key = keyOf(kind, id);
                if (!hasPending(key) && revision === expectedRevision) {
                    state.records[key] = { data: normalize(reply.data[singular[kind as 'quotes' | 'sales']], kind), version: reply.version };
                }
            }
            else if (!state.queue.some(op => op.path === path) && revision === expectedRevision)
                state.values[path.split('?')[0]] = clone(reply.data);
        });
    }
    async function refresh() {
        if (!active || !online)
            return;
        preparing = !state.readyAt;
        publish();
        try {
            for (const path of ['/api/auth/me', '/api/business', ...(!io.connected ? ['/api/license'] : []), '/api/tutorials']) {
                const start = revision;
                try {
                    const response = await io.send(path, { timeoutMs: 10000 });
                    await accept(path, response, start);
                }
                catch (e) {
                    if (errorStatus(e) === 0)
                        throw e;
                    if ([401, 403].includes(errorStatus(e) ?? 0) && path === '/api/auth/me')
                        throw e;
                }
            }
            if (state.readyAt && Date.now() - new Date(state.readyAt).getTime() < 120000)
                return;
            for (const kind of kinds) {
                if (io.connected && ((kind === 'quotes' && !io.user.permissions?.viewQuotes) || (kind === 'sales' && !io.user.permissions?.viewSales)))
                    continue;
                let page = 1, last = 1, saleState = 'activa';
                const seen = new Set<string>();
                let complete = true;
                do {
                    let reply: Reply;
                    try {
                        const query = new URLSearchParams();
                        if ((io.connected && !['branches', 'agents'].includes(kind)) || kind === 'clients') query.set('page',String(page));
                        if (kind === 'sales') query.set('estadoVenta',saleState);
                        reply = await io.send('/api/' + kind + (query.size ? '?' + query.toString() : ''), { timeoutMs: 15000 });
                    }
                    catch (e) {
                        if (errorStatus(e) === 0)
                            throw e;
                        complete = false;
                        break;
                    }
                    if (!active)
                        return;
                    const data = reply.data[kind] as Data[];
                    if (!Array.isArray(data)) {
                        complete = false;
                        break;
                    }
                    last = reply.data.meta?.lastPage ?? 1;
                    for (const value of data) {
                        if (state.queue.length)
                            return;
                        const id = localIdFor(value.id, kind);
                        const key = keyOf(kind, id);
                        seen.add(key);
                        if (hasPending(key))
                            continue;
                        const before = revision;
                        if (kind === 'quotes' || kind === 'sales') {
                            if (!state.readyAt && Array.isArray(state.records[key]?.data.items))
                                continue;
                            try {
                                const detail = await io.send('/api/' + kind + '/' + value.id, { timeoutMs: 10000 });
                                await accept('/api/' + kind + '/' + value.id, detail, before);
                            }
                            catch (e) {
                                if (errorStatus(e) === 0)
                                    throw e;
                                complete = false;
                            }
                        }
                        else
                            await edit(() => { if (!hasPending(key) && before === revision)
                                state.records[key] = { data: normalize(value, kind) }; });
                    }
                    page++;
                    if (kind === 'sales' && page > last && saleState === 'activa') {saleState = 'anulada';page = 1;last = 1;}
                } while (page <= last && active && online);
                if (!complete) {
                    message = 'No se completó la descarga. Se reintentará al sincronizar.';
                    return;
                }
                if (complete)
                    await edit(() => { for (const key of Object.keys(state.records))
                        if (key.startsWith(kind + '/') && !seen.has(key) && !hasPending(key) && !state.queue.some(op => JSON.stringify(op.body).includes(':' + key.split('/')[1])))
                            delete state.records[key]; });
            }
            if (active && online) {
                const business = state.values['/api/business']?.business;
                if (business && io.assets)
                    await io.assets(business).catch(() => { });
                await edit(() => { state.readyAt = new Date().toISOString(); message = ''; });
            }
        }
        catch (e) {
            if (errorStatus(e) === 0)
                online = false;
            message = errorMessage(e);
            publish();
        }
        finally {
            preparing = false;
            publish();
        }
    }
    function mapResult(op: Operation, result: any) {
        const create = op.path.match(/^\/api\/(clients|products|quotes|sales|branches|agents)(?:\/\d+\/duplicate|\/from-quote)?$/);
        const root = op.root;
        if (op.method === 'POST' && create) {
            const kind = create[1] as keyof typeof singular;
            const remote = result[singular[kind]];
            if (remote?.id && op.body?.__localId)
                state.ids[op.body.__localId] = remote.id;
        }
        if (root) {
            const local = state.records[root]?.data;
            const suffix = op.path.slice(('/api/' + root).length);
            if (local && /^\/items(?:\/\d+\/duplicate)?$/.test(suffix) && op.method === 'POST' && op.body?.__localId && result.item?.id)
                state.ids[op.body.__localId] = result.item.id;
            if (local && suffix === '/payments' && op.method === 'POST' && op.body?.__localId && result.payment?.id)
                state.ids[op.body.__localId] = result.payment.id;
        }
    }
    async function synchronize() {
        if (flight)
            return flight;
        flight = (async () => {
            if (!active || !online)
                return;
            syncing = true;
            publish();
            try {
                if (!state.values.capability) {
                    const reply = await io.send('/api/auth/me', { timeoutMs: 8000 });
                    await edit(() => { state.values.capability = reply.capability === true; });
                    if (!reply.capability) {
                        message = 'La API necesita la actualización de sincronización. Los cambios permanecen guardados en el teléfono.';
                        return;
                    }
                }
                while (active && online && state.queue.length) {
                    const op = clone(state.queue[0]);
                    if (op.error && op.code !== 'NETWORK_ERROR' && op.code !== 'TIMEOUT')
                        break;
                    const body = remapBody(op.body);
                    if (body)
                        delete body.__localId;
                    if (body?.items)
                        for (const it of body.items) {
                            delete it.id;
                            delete it.subtotal;
                        }
                    const root = op.root;
                    const row = root ? state.records[root] : null;
                    const base = row?.version ?? op.base;
                    await edit(() => { state.queue[0].attempted = true; });
                    let reply: Reply;
                    try {
                        reply = op.receipt ?? await io.send(remapPath(op.path), { method: op.method, body, headers: { 'X-Lumis-Operation-Id': op.id, ...(base ? { 'X-Lumis-Base-Version': base } : {}) }, timeoutMs: 20000 });
                    }
                    catch (e: any) {
                        await edit(() => { const pending = state.queue.find(value => value.id === op.id); if (pending) {
                            pending.error = errorMessage(e);
                            pending.code = e.code ?? String(e.status ?? 'ERROR');
                        } message = errorMessage(e); });
                        if (errorStatus(e) === 0)
                            online = false;
                        break;
                    }
                    await edit(() => {
                        mapResult(op, reply.data);
                        state.queue = state.queue.filter(value => value.id !== op.id);
                        state.queue.unshift({ ...op, receipt: reply });
                        if (!op.receipt && !io.connected && op.method === 'POST') {
                            const quota = op.path.endsWith('/deliver') ? 'deliveries' : /^\/api\/quotes(?:\/\d+\/duplicate)?$/.test(op.path) ? 'quotes' : /^\/api\/sales(?:\/from-quote|\/\d+\/duplicate)?$/.test(op.path) ? 'sales' : null;
                            if (quota) {
                                state.values.confirmedQuota ??= {};
                                state.values.confirmedQuota[quota] = (state.values.confirmedQuota[quota] ?? 0) + 1;
                            }
                        }
                        if (root && state.records[root] && reply.version)
                            state.records[root].version = reply.version;
                        if (op.path === '/api/business/assets') {
                            const business = state.values['/api/business']?.business;
                            const field = op.body?.tipo === 'logo' ? 'logo_url' : 'sello_url';
                            if (business && !state.queue.some(value => value.id !== op.id && value.path === op.path && value.body?.tipo === op.body?.tipo))
                                business[field] = reply.data.url;
                        }
                    });
                    // Resolve newly created line IDs from the ordered document snapshot before
                    // sending dependent edits; no local navigation ID is replaced.
                    let docRoot = root && /^(quotes|sales)\//.test(root) ? root : undefined;
                    if (op.method === 'DELETE' && /^\/api\/(quotes|sales)\/\d+$/.test(op.path))
                        docRoot = undefined;
                    const created = op.path.match(/^\/api\/(quotes|sales)(?:\/from-quote|\/\d+\/duplicate)?$/);
                    if (created && op.body?.__localId)
                        docRoot = keyOf(created[1], op.body.__localId);
                    if (docRoot) {
                        const serverPath = remapPath('/api/' + docRoot);
                        const detail = await io.send(serverPath, { timeoutMs: 10000 });
                        const kind = docRoot.split('/')[0] as 'quotes' | 'sales';
                        const remote = detail.data[singular[kind]];
                        await edit(() => {
                            const local = state.records[docRoot!];
                            if (!local || !remote)
                                return;
                            const originalItems = op.body?.items as Data[] | undefined;
                            if (originalItems && remote.items)
                                originalItems.forEach((it, i) => { if (it.id && remote.items[i])
                                    state.ids[it.id] = remote.items[i].id; });
                            if (op.localPayments && remote.payments)
                                op.localPayments.forEach((id, i) => { if (remote.payments[i])
                                    state.ids[id] = remote.payments[i].id; });
                            if (local.data.items && remote.items) {
                                for (const it of local.data.items)
                                    if (it.id >= 1e12 && !state.ids[it.id]) {
                                        const match = remote.items.find((r: Data) => r.description === it.description && r.quantity === it.quantity && r.unitPrice === it.unitPrice);
                                        if (match)
                                            state.ids[it.id] = match.id;
                                    }
                            }
                            local.version = reply.version ?? detail.version;
                            state.queue = state.queue.filter(value => value.id !== op.id);
                            if (!hasPending(docRoot!))
                                local.data = normalize(remote, kind);
                            else if (remote.number != null)
                                local.data.number = remote.number;
                        });
                    }
                    else
                        await edit(() => { state.queue = state.queue.filter(value => value.id !== op.id); });
                }
                if (!state.queue.length)
                    await refresh();
            }
            catch (e) {
                message = errorMessage(e);
                if (errorStatus(e) === 0)
                    online = false;
            }
            finally {
                syncing = false;
                if (online && !state.queue.length && state.readyAt)
                    message = '';
                publish();
            }
        })().finally(() => { flight = null; });
        return flight;
    }
    return {
        async initialize() { state = (await io.store.load(io.scope)) ?? emptyState(); publish(); },
        status: () => snapshot, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
        queue: () => clone(state.queue), state: () => clone(state),
        stop() { active = false; },
        setOnline(value: boolean) { online = value; publish(); if (value)
            void synchronize(); },
        async retry() { await edit(() => { for (const op of state.queue) {
            if (op.code !== 'OFFLINE_DOCUMENT_CONFLICT') {
                delete op.error;
                delete op.code;
            }
        } }); return synchronize(); },
        async forceConflict(id: string) {
            const op = state.queue.find(value => value.id === id);
            if (!op || op.code !== 'OFFLINE_DOCUMENT_CONFLICT' || !op.root)
                return;
            const reply = await io.send(remapPath('/api/' + op.root), { timeoutMs: 10000 });
            await edit(() => { state.records[op.root!].version = reply.version; delete op.error; delete op.code; });
            await synchronize();
        },
        synchronize, refresh,
        async request(path: string, options: Request = {}) {
            const method = options.method ?? 'GET';
            if (onlineOnly(path) || path.startsWith('/api/tutorials') && method !== 'GET') {
                if (!online)
                    throw Error(path.includes('/scan') ? 'El escaneo mágico necesita conexión a internet.' : 'Esta operación de cuenta necesita conexión a internet.');
                return (await io.send(path, options)).data;
            }
            if (method === 'GET') {
                if (path === '/health')
                    return (await io.send(path, options)).data;
                const query = new URL(path, 'https://local.invalid');
                if (online && query.pathname === '/api/clients' && query.searchParams.get('search')?.trim()) {
                    try {
                        const reply = await io.send(path, { ...options, timeoutMs: options.timeoutMs ?? 8000 });
                        if (!Array.isArray(reply.data.clients)) throw Error('No se pudo leer la lista de clientes.');
                        await edit(() => {
                            for (const client of reply.data.clients) {
                                const value = normalize(client, 'clients');
                                const key = keyOf('clients', value.id);
                                if (!hasPending(key)) state.records[key] = { data: value };
                            }
                        });
                        const remote = reply.data.clients.map((client: Data) => {
                            const value = normalize(client, 'clients');
                            return state.records[keyOf('clients', value.id)]?.data ?? value;
                        });
                        const pendingClients = rows(state, 'clients').filter(client => hasPending(keyOf('clients', client.id)));
                        return { ...reply.data, clients: matchingClients([...remote, ...pendingClients], query.searchParams.get('search')!, Infinity) };
                    } catch (error) {
                        if (!active || errorStatus(error) !== 0) throw error;
                        online = false; publish();
                    }
                    return readLocal(state, path, io.user, io.connected);
                }
                try {
                    return readLocal(state, path, io.user, io.connected);
                }
                catch (e) {
                    if (!online)
                        throw e;
                    const before = revision;
                    const reply = await io.send(remapPath(path), options);
                    await accept(path, reply, before);
                    return reply.data;
                }
            }
            const result = await edit(() => {
                const body = clone(options.body ?? {}) as Data;
                validate(path, method, body);
                const result = applyMutation(state, path, method, body, io.user);
                const kind = path.match(/^\/api\/(clients|products|quotes|sales|branches|agents)/)?.[1] as keyof typeof singular | undefined;
                let root = rootOf(path);
                if (kind && method === 'POST' && result[singular[kind]]?.id && !root) {
                    body.__localId = result[singular[kind]].id;
                    root = keyOf(kind, body.__localId);
                    if (body.items)
                        body.items = result[singular[kind]].items.map((it: Data) => ({ ...it }));
                }
                if (/^\/api\/(quotes|sales)\/\d+\/duplicate$/.test(path) && kind) {
                    body.__localId = result[singular[kind]].id;
                    body.items = result[singular[kind]].items.map((it: Data) => ({ ...it }));
                }
                if (/\/items(?:\/\d+\/duplicate)?$/.test(path) && method === 'POST')
                    body.__localId = result.item.id;
                if (/\/payments$/.test(path) && method === 'POST')
                    body.__localId = result.payment.id;
                const op: Operation = { id: 'op-' + state.device + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12), path, method, body, root, base: root ? state.records[root]?.version : undefined,
                    ...(kind === 'sales' && body.__localId && result.sale ? { localPayments: result.sale.payments?.map((payment: Data) => payment.id) } : {}) };
                if (path === '/api/quotes' && !body.solicitud_id)
                    body.solicitud_id = op.id;
                if (path === '/api/sales' && !body.solicitud_id)
                    body.solicitud_id = op.id;
                if (path === '/api/sales/from-quote' && !body.solicitud_id)
                    body.solicitud_id = op.id;
                if ((path.endsWith('/payments') || body.estadoPago === 'pagado') && !body.clave_operacion)
                    body.clave_operacion = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const n = Math.floor(Math.random() * 16); return (c === 'x' ? n : (n & 3) | 8).toString(16); });
                state.queue.push(op);
                return clone(result);
            }, true);
            if (online)
                void synchronize();
            return result;
        },
    };
}
