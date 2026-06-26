import {reactive, readonly} from 'vue';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
    id: string;
    tone: ToastTone;
    message: string;
    title?: string;
}

const state = reactive<{messages: ToastMessage[]}>({
    messages: [],
});

const activeToastIds = new Set<string>();

const createId = (): string => {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const toastStore = {

    state: readonly(state),

    show(input: Omit<ToastMessage, 'id'> & {id?: string; durationMs?: number}): string {
        const id = input.id ?? createId();

        if (activeToastIds.has(id)) {
            return id;
        }

        activeToastIds.add(id);
        state.messages.push({
            id,
            tone: input.tone,
            title: input.title,
            message: input.message,
        });

        window.setTimeout((): void => {
            toastStore.dismiss(id);
        }, input.durationMs ?? 5000);

        return id;
    },

    dismiss(id: string): void {
        const index = state.messages.findIndex((message): boolean => message.id === id);

        if (index >= 0) {
            state.messages.splice(index, 1);
        }

        activeToastIds.delete(id);
    },
};
