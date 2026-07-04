// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import { Logger } from '@nestjs/common';
import { Extension } from '../dto/extension';
import { ExtensionList } from '../dto/extension-list';
import { FspiopErrors } from '../exception';
import { FspiopException } from '../exception/fspiop-exception';

export class FspiopErrorTranslator {

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
            normalized.errorDefinition.description
        );

        if (extensionList === normalized.extensionList) {
            const errorDef = FspiopErrors.find(normalized.errorDefinition.errorType.code) ?? FspiopErrors.GENERIC_VALIDATION_ERROR;
            return new FspiopException(errorDef, {
                extension: [
                    {
                        key: '',
                        value: normalized.errorDefinition.description,
                    },
                ],
            },)
        }

        return new FspiopException(normalized.errorDefinition, extensionList);
    }

    private static withTransactionId(
        extensionList: ExtensionList | undefined,
        transactionId: string | undefined,
        message: string | undefined,
    ): ExtensionList | undefined {
        const normalizedTransactionId = transactionId?.trim();
        const normalizedMessage = message?.trim();

        if (normalizedTransactionId == null || normalizedTransactionId.length === 0) {
            return extensionList;
        }
        if (
            (normalizedTransactionId == null || normalizedTransactionId.length === 0) &&
            (normalizedMessage == null || normalizedMessage.length === 0)
        ) {
            return extensionList;
        }

        const mergedExtensionList = new ExtensionList();
        const extensions = (extensionList?.extension ?? []).map((item) => {
            const extension = new Extension();
            extension.key = item.key;
            extension.value = item.value;
            return extension;
        });

        const upsertExtension = (targetKey: string, targetValue: string): void => {
            const existing = extensions.find((extension) => {
                const key = extension.key?.trim().toLowerCase() ?? '';
                return key === targetKey;
            });

            if (existing != null) {
                existing.value = targetValue;
                return;
            }

            const extension = new Extension();
            extension.key = targetKey;
            extension.value = targetValue;
            extensions.push(extension);
        };

        // if (normalizedTransactionId != null && normalizedTransactionId.length > 0) {
        //     upsertExtension(
        //         FspiopErrorTranslator.TRANSACTION_ID_KEY,
        //         normalizedTransactionId,
        //     );
        // }

        if (normalizedMessage != null && normalizedMessage.length > 0) {
            upsertExtension(
                "",
                normalizedMessage,
            );
        }

        mergedExtensionList.extension = extensions;

        return mergedExtensionList;
    }
}
