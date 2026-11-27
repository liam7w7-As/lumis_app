import { clone, keyOf, type Data, type Kind, type State } from './types';
import { assembleDashboard, dashboardRange, type DashboardPeriod } from './dashboard';
import { clientSearchKey, matchingClients } from '../lib/clientSuggestions';
export const kinds: Kind[] = ['clients', 'products', 'quotes', 'sales', 'branches', 'agents'];
export const singular: Record<Kind, string> = { clients: 'client', products: 'product', quotes: 'quote', sales: 'sale', branches: 'branch', agents: 'agent' };
export function allocate(state: State) { state.next = Math.max(Date.now() * 1000, state.next + 1); return state.next; }
export function record(state: State, kind: string, id: number): Data {
    const row = state.records[keyOf(kind, id)] ?? Object.entries(state.records).find(([key]) => key.startsWith(kind + '/') && state.ids[key.split('/')[1]] === id)?.[1];
    if (!row || row.deleted)
        throw new Error('Este registro todavía no se descargó al teléfono. Conéctate para sincronizarlo.');
    return row.data;
}
export function rows(state: State, kind: string): Data[] { return Object.entries(state.records).filter(([key, row]) => key.startsWith(kind + '/') && !row.deleted).map(([, row]) => row.data); }
function total(doc: Data) {
    for (const item of doc.items)
        item.subtotal = Math.round(item.quantity * item.unitPrice * 100) / 100;
    doc.total = Math.round(doc.items.reduce((sum: number, item: Data) => sum + item.subtotal, 0) * 100) / 100;
    if (doc.payments) {
        doc.totalPagado = Math.round(doc.payments.reduce((sum: number, p: Data) => sum + p.monto, 0) * 100) / 100;
        if (doc.metodoPago === 'por_pagar')
            doc.estadoPago = doc.totalPagado >= doc.total - .005 ? 'pagado' : 'por_cobrar';
    }
}
function item(state: State, data: Data, quotation = false): Data {
    const product = data.productId ? state.records[keyOf('products', data.productId)]?.data : null;
    const scanned = quotation && data.fromScan === true;
    if ((!scanned && !data.description?.trim()) || !Number.isFinite(data.quantity) || (scanned ? data.quantity < 0 : data.quantity <= 0) || !Number.isFinite(data.unitPrice) || data.unitPrice < 0)
        throw new Error('Revisa el nombre, la cantidad y el precio del artículo.');
    return { productId: null, unit: 'Unidad', codigoInterno: product?.codigoInterno ?? null, marca: product?.marca ?? null, procedencia: product?.procedencia ?? null, ...clone(data), id: allocate(state), subtotal: Math.round(data.quantity * data.unitPrice * 100) / 100 };
}
export function readLocal(state: State, path: string, user: Data, connected: boolean): any {
    const url = new URL(path, 'https://local.invalid');
    const base = url.pathname;
    if (base === '/api/auth/me')
        return clone(state.values[base] ?? { user });
    if (/^\/api\/(quotes|sales)\/next-number$/.test(base))
        return { nextNumber: 'P-' + state.device.toUpperCase() + '-' + ((state.values.documentSequence ?? 0) + 1) };
    const detail = base.match(/^\/api\/(quotes|sales)\/(\d+)$/);
    if (detail)
        return { [singular[detail[1] as Kind]]: clone(record(state, detail[1], Number(detail[2]))) };
    const list = base.match(/^\/api\/(clients|products|quotes|sales|branches|agents)$/);
    if (list) {
        const kind = list[1];
        let data = rows(state, kind);
        const search = kind === 'clients' ? clientSearchKey(url.searchParams.get('search') ?? '')
            : (url.searchParams.get('search') ?? '').toLocaleLowerCase();
        if (search)
            data = kind === 'clients' ? matchingClients(data as (Data & { id: number; name: string })[], search, Infinity)
                : data.filter(row => [row.name, row.description, row.clientName, row.number, row.codigoInterno].some(value => String(value ?? '').toLocaleLowerCase().includes(search)));
        if (url.searchParams.has('id'))
            data = data.filter(row => row.id === Number(url.searchParams.get('id')));
        if (kind === 'sales') {
            for (const key of ['estadoPago', 'branchId'])
                if (url.searchParams.get(key))
                    data = data.filter(row => String(row[key]) === url.searchParams.get(key));
            data = data.filter(row => row.estado === (url.searchParams.get('estadoVenta') ?? 'activa'));
        }
        if (kind === 'quotes' || kind === 'sales')
            data = [...data].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
        else if (!(kind === 'clients' && search))
            data = [...data].sort((a, b) => String(a.name).localeCompare(String(b.name)));
        if ((connected && !['branches', 'agents'].includes(kind)) || (kind === 'clients' && url.searchParams.has('page'))) {
            const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
            const perPage = 50;
            const count = data.length;
            return { [kind]: clone(data.slice((page - 1) * perPage, page * perPage)), meta: { currentPage: page, total: count, lastPage: Math.max(1, Math.ceil(count / perPage)) } };
        }
        return { [kind]: clone(data) };
    }
    if (base === '/api/dashboard') {
        const period = (url.searchParams.get('period') ?? 'mes') as DashboardPeriod;
        const now = new Date();
        const range = dashboardRange(period, now);
        const within = (data: Data) => new Date(data.createdAt).getTime() >= range.previousStart && new Date(data.createdAt).getTime() < now.getTime();
        const quotes = rows(state, 'quotes').filter(within).map(data => ({ current_period: Number(new Date(data.createdAt).getTime() >= range.start), total: 1, approved: Number(data.status === 'aprobada') }));
        const sales = rows(state, 'sales').filter(data => data.estado !== 'anulada' && within(data)).map(data => ({ current_period: Number(new Date(data.createdAt).getTime() >= range.start), bucket: Math.floor((new Date(data.createdAt).getTime() - range.start) / range.bucketMs), total: 1, receivable: Number(data.estadoPago === 'por_cobrar') }));
        return { dashboard: assembleDashboard(period, now, quotes, sales) };
    }
    if (base in state.values) {
        const value = clone(state.values[base]);
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        if (base === '/api/license' && value.license?.expiresOn && value.license.expiresOn < today) {
            value.license.readOnly = true;
            value.license.state = 'expired';
        }
        return value;
    }
    throw new Error('Esta información todavía no está disponible sin conexión. Sincroniza el dispositivo.');
}
export function applyMutation(state: State, path: string, method: string, body: Data, user: Data): any {
    const now = new Date().toISOString();
    const match = path.match(/^\/api\/(clients|products|quotes|sales|branches|agents)(?:\/(\d+))?(.*)$/);
    if (path === '/api/auth/preferences') {
        user.themeMode = body.themeMode;
        return { themeMode: body.themeMode };
    }
    if (path === '/api/business') {
        const business = state.values[path]?.business;
        if (!business)
            throw Error('Sincroniza los datos de tu empresa.');
        Object.assign(business, body);
        return { business: clone(business) };
    }
    if (path === '/api/business/assets') {
        const uri = `data:image/${body.ext === 'jpg' ? 'jpeg' : body.ext};base64,${body.base64}`;
        const business = state.values['/api/business']?.business;
        if (!business)
            throw Error('Sincroniza tu empresa.');
        business[body.tipo === 'logo' ? 'logo_url' : 'sello_url'] = uri;
        return { url: uri };
    }
    if (!match)
        throw new Error('Esta operación requiere conexión a internet.');
    const kind = match[1] as Kind;
    const id = match[2] ? Number(match[2]) : null;
    const suffix = match[3] ?? '';
    if (method === 'POST' && id == null && suffix !== '/from-quote') {
        const newId = allocate(state);
        let data: Data = { ...clone(body), id: newId };
        if (kind === 'clients' || kind === 'branches' || kind === 'agents' || kind === 'products') {
            if (!body.name?.trim())
                throw Error('Escribe un nombre.');
            data = { phone: null, email: null, description: null, stock: 0, unit: 'Unidad', codigoInterno: null, marca: null, procedencia: null, ...data };
        }
        else {
            if (!body.items?.length)
                throw Error('Añade al menos un artículo.');
            const client = body.clientId ? record(state, 'clients', body.clientId) : null;
            const branch = body.branchId ? record(state, 'branches', body.branchId) : null;
            const seller = body.agentId ? record(state, 'agents', body.agentId).name : user.name;
            state.values.documentSequence = (state.values.documentSequence ?? 0) + 1;
            data = { ...data, number: 'P-' + state.device.toUpperCase() + '-' + state.values.documentSequence, clientId: body.clientId ?? null, client: client ? clone(client) : null, clientName: client?.name ?? null, branchId: body.branchId ?? null, branchName: branch?.name ?? null, sellerName: seller, agentId: body.agentId ?? null, createdAt: body.createdAt ?? now, notes: body.notes ?? null, showNotes: false, includeSignature: false, items: body.items.map((value: Data) => item(state, value, kind === 'quotes')), total: 0 };
            if (kind === 'quotes')
                Object.assign(data, { status: 'borrador', includeSeal: false, versionNumero: 1, fechaVencimiento: null, terminos: state.values['/api/business']?.business?.terminos_default ?? null });
            else {
                const paid = body.metodoPago !== 'por_pagar';
                const sum = data.items.reduce((s: number, it: Data) => s + it.subtotal, 0);
                const payment = paid ? sum : (body.pagoInicial ?? 0);
                if (payment < 0 || payment > sum + .005)
                    throw Error('El abono no puede superar el total de la venta.');
                Object.assign(data, { estado: 'activa', estadoPago: paid ? 'pagado' : 'por_cobrar', metodoPago: body.metodoPago ?? 'efectivo', includeSello: false, entregadaAt: null, anuladoAt: null, canEditItems: true, canChangeBranch: true, comprobanteUrl: null, notaPago: body.notaPago ?? null, transferenciaNumero: body.transferenciaNumero ?? null, initialPayment: payment, totalPagado: payment, payments: payment > 0 ? [{ id: allocate(state), monto: payment, nota: 'Pago inicial', createdAt: now }] : [] });
            }
            total(data);
        }
        state.records[keyOf(kind, newId)] = { data };
        return { [singular[kind]]: clone(data) };
    }
    if (kind === 'sales' && suffix === '/from-quote') {
        const quote = record(state, 'quotes', body.quoteId);
        if (quote.items.some((line: Data) => line.fromScan && (!line.description?.trim() || !line.unit?.trim() || !(line.quantity > 0))))
            throw Error('Completa el nombre, la cantidad y la unidad de los artículos escaneados antes de convertir la cotización en venta.');
        const result = applyMutation(state, '/api/sales', 'POST', { ...clone(quote), metodoPago: 'por_pagar', items: quote.items }, user);
        quote.status = 'convertida';
        record(state, 'sales', result.sale.id).quoteId = quote.id;
        result.sale.quoteId = quote.id;
        return result;
    }
    if (id == null)
        throw Error('Registro no encontrado.');
    const doc = record(state, kind, id);
    if (method === 'DELETE' && !suffix) {
        state.records[keyOf(kind, id)].deleted = true;
        return { ok: true };
    }
    if (!suffix && ['PATCH', 'PUT'].includes(method)) {
        Object.assign(doc, clone(body));
        if (body.clientDetails) {
            doc.clientName = body.clientDetails.name;
        }
        if (body.clientId != null) {
            doc.client = clone(record(state, 'clients', body.clientId));
            doc.clientName = doc.client.name;
        }
        else if (Object.hasOwn(body, 'clientId')) {
            doc.client = null;
            doc.clientName = null;
        }
        if (body.branchId != null)
            doc.branchName = record(state, 'branches', body.branchId).name;
        else if (Object.hasOwn(body, 'branchId'))
            doc.branchName = null;
        if (body.agentId != null)
            doc.sellerName = record(state, 'agents', body.agentId).name;
        else if (Object.hasOwn(body, 'agentId'))
            doc.sellerName = user.name;
        if (body.estadoPago === 'pagado' && doc.items) {
            const remaining = Math.max(0, doc.total - (doc.totalPagado ?? 0));
            if (remaining)
                doc.payments.push({ id: allocate(state), monto: remaining, nota: null, createdAt: now });
            total(doc);
        }
        return { ok: true, ...clone(doc), [singular[kind]]: clone(doc) };
    }
    if (suffix === '/duplicate')
        return applyMutation(state, '/api/' + kind, 'POST', { ...clone(doc), createdAt: now, metodoPago: 'por_pagar', pagoInicial: 0, items: doc.items }, user);
    if (suffix === '/anular') {
        doc.estado = 'anulada';
        doc.anuladoAt = now;
        return { ok: true, estado: 'anulada' };
    }
    if (suffix === '/deliver') {
        doc.entregadaAt ??= now;
        return { ok: true, entregadaAt: doc.entregadaAt };
    }
    if (suffix === '/receipt') {
        doc.comprobanteUrl = `data:image/${body.ext === 'jpg' ? 'jpeg' : body.ext};base64,${body.base64}`;
        return { url: doc.comprobanteUrl };
    }
    const payment = suffix.match(/^\/payments(?:\/(\d+))?$/);
    if (payment) {
        let result: Data = {};
        if (method === 'POST') {
            if (!(body.monto > 0) || body.monto > Math.max(0, doc.total - doc.totalPagado) + .005)
                throw Error('Revisa el importe del abono.');
            result = { id: allocate(state), monto: body.monto, nota: body.nota ?? null, createdAt: now };
            doc.payments.push(result);
        }
        else
            doc.payments = doc.payments.filter((p: Data) => p.id !== Number(payment[1]));
        total(doc);
        return { ok: true, payment: result, totalPagado: doc.totalPagado, estadoPago: doc.estadoPago, saldo: Math.max(0, doc.total - doc.totalPagado) };
    }
    const line = suffix.match(/^\/items(?:\/(\d+))?(\/duplicate|\/reorder)?$/);
    if (line) {
        let result: Data = {};
        const index = doc.items.findIndex((it: Data) => it.id === Number(line[1]));
        if (suffix === '/items/reorder') {
            doc.items = body.itemIds.map((value: number) => doc.items.find((it: Data) => it.id === value));
            if (doc.items.some((v: any) => !v))
                throw Error('Orden de artículos inválido.');
        }
        else if (method === 'POST') {
            result = item(state, line[2] ? doc.items[index] : body, kind === 'quotes');
            doc.items.push(result);
        }
        else if (index >= 0 && method === 'DELETE')
            doc.items.splice(index, 1);
        else if (index >= 0) {
            const scanned = kind === 'quotes' && doc.items[index].fromScan === true;
            const patch = clone(body);
            delete patch.fromScan;
            result = Object.assign(doc.items[index], patch);
            if ((!scanned && !result.description?.trim()) || !Number.isFinite(result.quantity) || (scanned ? result.quantity < 0 : result.quantity <= 0) || !Number.isFinite(result.unitPrice) || result.unitPrice < 0)
                throw Error('Revisa los datos del artículo.');
        }
        else
            throw Error('Artículo no encontrado.');
        total(doc);
        return { ok: true, item: clone(result), total: doc.total };
    }
    throw new Error('Esta operación requiere conexión a internet.');
}
