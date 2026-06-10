import { AsyncLocalStorage } from 'node:async_hooks';

export class MdcContext {
    private static readonly storage = new AsyncLocalStorage<Map<string, string>>();

    public static readonly TRANSFER_ID = 'transferId';
    public static readonly ID_VALUE = 'idValue';

    private constructor() {}

    public static get(key: string): string | undefined {
        return this.storage.getStore()?.get(key);
    }

    public static getAll(): Record<string, string> {
        const store = this.storage.getStore();
        if (!store) {
            return {};
        }
        return Object.fromEntries(store.entries());
    }

    public static run<T>(values: Record<string, string | undefined>, fn: () => T): T {
        const current = this.storage.getStore() ?? new Map<string, string>();
        const next = new Map(current);

        for (const [key, value] of Object.entries(values)) {
            if (key && value && value.trim().length > 0) {
                next.set(key, value);
            }
        }

        return this.storage.run(next, fn);
    }
}
