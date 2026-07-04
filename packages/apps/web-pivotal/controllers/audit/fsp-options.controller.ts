import {Controller, Get, Inject} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {ListCentralLedgerParticipantsQuery} from '@core/participant/domain';

export interface AuditFspOption {
    label: string;
    value: string;
}

@Controller('audit/fsp-options')
export class AuditFspOptionsController {

    constructor(
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Get()
    @RequiresPermission(PermissionKey.AUDIT_TRANSACTIONS_LIST)
    async listFspOptions(): Promise<AuditFspOption[]> {
        const participants: ListCentralLedgerParticipantsQuery.Output = await this.queryBus.execute(
            new ListCentralLedgerParticipantsQuery(),
        );

        const names = new Set<string>();

        for (const participant of participants) {
            const name = participant.name?.trim();

            if (name != null && name.length > 0) {
                names.add(name);
            }
        }

        return Array.from(names)
            .sort((left: string, right: string): number => left.localeCompare(right))
            .map((name: string): AuditFspOption => ({
                label: name,
                value: name,
            }));
    }
}
