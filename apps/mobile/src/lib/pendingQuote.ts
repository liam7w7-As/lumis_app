import { ApiError } from './api';

export interface PendingQuoteStorage {
  write: (payload: string) => Promise<void>;
  remove: () => Promise<void>;
}

/** Keep the original request until the server confirms success or rejects its data. */
export async function sendPendingQuote<T, Payload>(payload: Payload, storage: PendingQuoteStorage,
  send: (payload: Payload) => Promise<T>, queued: (payload: Payload | null) => void): Promise<T> {
  await storage.write(JSON.stringify(payload));
  queued(payload);
  let result: T;
  try { result = await send(payload); }
  catch (error) {
    if (error instanceof ApiError && [400, 403, 404, 409, 422].includes(error.status)) {
      await storage.remove();
      queued(null);
    }
    throw error;
  }
  await storage.remove();
  queued(null);
  return result;
}
