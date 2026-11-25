import * as SQLite from 'expo-sqlite';
import { clone, type State, type Store } from './types';
// One transaction commits the visible records and their outgoing operations together.
// Only changed buckets are written; account/enterprise/API identities never share data.
export async function openOfflineStore(): Promise<Store> {
    const db = await SQLite.openDatabaseAsync('lumis-offline-v1.db');
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS offline_data (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(scope,key));');
    const previous = new Map<string, Map<string, string>>();
    return {
        async load(scope) {
            const rows = await db.getAllAsync<{
                key: string;
                value: string;
            }>('SELECT key,value FROM offline_data WHERE scope = ?', scope);
            if (!rows.length)
                return null;
            const parts = new Map(rows.map(row => [row.key, row.value]));
            previous.set(scope, parts);
            const meta = JSON.parse(parts.get('meta')!);
            const records = Object.fromEntries(rows.filter(row => row.key.startsWith('row:')).map(row => [row.key.slice(4), JSON.parse(row.value)]));
            return { ...meta, records } as State;
        },
        async save(scope, state) {
            const { records, ...meta } = clone(state);
            const next = new Map([['meta', JSON.stringify(meta)], ...Object.entries(records).map(([key, row]) => ['row:' + key, JSON.stringify(row)] as [
                    string,
                    string
                ])]);
            const old = previous.get(scope) ?? new Map<string, string>();
            await db.withExclusiveTransactionAsync(async (tx) => {
                for (const key of old.keys())
                    if (!next.has(key))
                        await tx.runAsync('DELETE FROM offline_data WHERE scope = ? AND key = ?', scope, key);
                for (const [key, value] of next)
                    if (old.get(key) !== value)
                        await tx.runAsync('INSERT INTO offline_data(scope,key,value) VALUES (?,?,?) ON CONFLICT(scope,key) DO UPDATE SET value=excluded.value', scope, key, value);
            });
            previous.set(scope, next);
        },
    };
}
