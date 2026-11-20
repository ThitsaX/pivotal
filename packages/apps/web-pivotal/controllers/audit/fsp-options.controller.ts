import {Controller, Get, Inject} from '@nestjs/common';
import {QueryBus} from '@nestjs/cqrs';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {ListCentralLedgerParticipantsQuery} from '@core/participant/domain';

export interface AuditFspOption {
    label: string;
    value: string;
    description?: string;
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

        return participants
            .filter(p => p.name && p.name.toLowerCase() !== 'hub')
            .map(p => ({
                label: p.description ? `${p.description} (${p.name})` : p.name,
                value: p.name,
                description: p.description,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }
}
