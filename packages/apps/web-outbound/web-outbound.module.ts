import {DynamicModule, Module} from '@nestjs/common';
import {AuditProducerModule} from '@core/audit/producer';
import {OutboundDomainModule} from '@core/outbound/domain';
import {
    LookupController,
    QuoteController,
    TransferController,
} from './controllers';
import {WebOutboundDependencies} from './required.dependencies';

@Module({})
export class WebOutboundModule {

    static forRoot(): DynamicModule {
        return WebOutboundModule.forRootAsync({
            useFactory: (): WebOutboundModule.RequiredDependencies => new WebOutboundDependencies(),
        });
    }

    static forRootAsync(asyncOptions: WebOutboundModule.AsyncOptions): DynamicModule {
        return {
            module: WebOutboundModule,
            imports: [
                OutboundDomainModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                AuditProducerModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                ...(asyncOptions.imports ?? []),
            ],
            controllers: [
                LookupController,
                QuoteController,
                TransferController,
            ],
        };
    }
}

export namespace WebOutboundModule {

    export interface RequiredDependencies
        extends OutboundDomainModule.RequiredDependencies,
            AuditProducerModule.RequiredDependencies {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
