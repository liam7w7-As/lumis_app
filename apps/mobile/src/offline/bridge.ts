import type { Request, Status } from './types';
export interface Gateway {
    request(path: string, options: Request): Promise<any>;
    status(): Status;
}
let gateway: Gateway | null = null;
let sessionToken: string | null = null;
export function setOfflineGateway(value: Gateway | null, token: string | null) { gateway = value; sessionToken = token; }
export function getOfflineGateway() { return gateway; }
export function offlineRequest(path: string, options: Request): Promise<any> | null {
    return gateway && options.token === sessionToken && !path.startsWith('/api/auth/login') && !path.startsWith('/api/auth/register')
        ? gateway.request(path, options) : null;
}
