import {DynamicModule, Module} from '@nestjs/common';
import {InboundDomainModule} from '@core/inbound/domain';
import {
    PartiesController,
    QuotesController,
    TransfersController,
} from './controllers';
import {WebInboundDependencies} from './required.dependencies';

@Module({})
export class WebInboundModule {

    static forRoot(): DynamicModule {
        return WebInboundModule.forRootAsync({
            useFactory: (): WebInboundModule.RequiredDependencies => new WebInboundDependencies(),
        });
    }

    static forRootAsync(asyncOptions: WebInboundModule.AsyncOptions): DynamicModule {
        return {
            module: WebInboundModule,
            imports: [
                InboundDomainModule.forRootAsync({
                    imports: asyncOptions.imports ?? [],
                    inject: asyncOptions.inject ?? [],
                    useFactory: asyncOptions.useFactory,
                }),
                ...(asyncOptions.imports ?? []),
            ],
            controllers: [
                PartiesController,
                QuotesController,
                TransfersController,
            ],
        };
    }
}

export namespace WebInboundModule {

    export interface RequiredDependencies extends InboundDomainModule.RequiredDependencies {
    }

    export type AsyncOptions = {
        imports?: any[];
        useFactory: (...args: any[]) => RequiredDependencies | Promise<RequiredDependencies>;
        inject?: any[];
    };
}
