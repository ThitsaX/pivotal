import {Extension} from '../dto/extension';
import {ExtensionList} from '../dto/extension-list';
import {FspiopException} from '../exception/fspiop-exception';

export class FspiopErrorTranslator {

    private static readonly TRANSACTION_ID_KEY = 'transaction_id';

    private constructor() {
    }

    static toFspiopException(
        exception: unknown,
        transactionId?: string,
    ): FspiopException {
        const normalized = FspiopException.normalize(exception);
        const extensionList = FspiopErrorTranslator.withTransactionId(
            normalized.extensionList,
            transactionId,
        );

        if (extensionList === normalized.extensionList) {
            return normalized;
        }

        return new FspiopException(normalized.errorDefinition, extensionList);
    }

    private static withTransactionId(
        extensionList: ExtensionList | undefined,
        transactionId: string | undefined,
    ): ExtensionList | undefined {
        const normalizedTransactionId = transactionId?.trim();

        if (normalizedTransactionId == null || normalizedTransactionId.length === 0) {
            return extensionList;
        }

        const mergedExtensionList = new ExtensionList();
        const extensions = (extensionList?.extension ?? []).map((item) => {
            const extension = new Extension();
            extension.key = item.key;
            extension.value = item.value;
            return extension;
        });

        let updated = false;

        for (const extension of extensions) {
            const key = extension.key?.trim().toLowerCase() ?? '';

            if (key !== FspiopErrorTranslator.TRANSACTION_ID_KEY) {
                continue;
            }

            extension.value = normalizedTransactionId;
            updated = true;
        }

        if (!updated) {
            const transactionIdExtension = new Extension();
            transactionIdExtension.key = FspiopErrorTranslator.TRANSACTION_ID_KEY;
            transactionIdExtension.value = normalizedTransactionId;
            extensions.push(transactionIdExtension);
        }

        mergedExtensionList.extension = extensions;

        return mergedExtensionList;
    }
}
