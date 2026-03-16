import {DynamicModule, Module} from '@nestjs/common';
import {AuditDomainModule} from '@core/audit/domain';
import {
    InboundPartiesAuditController,
    InboundQuotesAuditController,
    InboundTransfersAuditController,
    OutboundPartiesAuditController,
    OutboundQuotesAuditController,
    OutboundTransfersAuditController,
} from './controllers';
import {WebAuditDependencies} from './required.dependencies';

@Module({})
export class WebAuditModule {

    static forRoot(): DynamicModule {
        return WebAuditModule.forRootAsync({
            useFactory: (): WebAuditModule.RequiredDependencies => new WebAuditDependencies(),
        });
    }

    static forRootAsync(asyncOptions: WebAuditModule.AsyncOptions): DynamicModule {
        return {
            module: WebAuditModule,
            imports: [
                AuditDomainModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                ...(asyncOptions.imports ?? []),
            ],
            controllers: [
                InboundPartiesAuditController,
                InboundQuotesAuditController,
                InboundTransfersAuditController,
                OutboundPartiesAuditController,
                OutboundQuotesAuditController,
                OutboundTransfersAuditController,
            ],
        };
    }
}

export namespace WebAuditModule {

    export interface RequiredDependencies extends AuditDomainModule.RequiredDependencies {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
