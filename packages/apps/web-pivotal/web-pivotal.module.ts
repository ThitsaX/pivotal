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
import {WebPivotalDependencies} from './required.dependencies';

@Module({})
export class WebPivotalModule {

    static forRoot(): DynamicModule {
        return WebPivotalModule.forRootAsync({
            useFactory: (): WebPivotalModule.RequiredDependencies => new WebPivotalDependencies(),
        });
    }

    static forRootAsync(asyncOptions: WebPivotalModule.AsyncOptions): DynamicModule {
        return {
            module: WebPivotalModule,
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

export namespace WebPivotalModule {

    export interface RequiredDependencies extends AuditDomainModule.RequiredDependencies {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
