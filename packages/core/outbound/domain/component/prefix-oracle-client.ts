import { Logger } from '@nestjs/common';
import { AxiosInstance, isAxiosError } from 'axios';
import { AxiosClientBuilder, AxiosClientBuilderParams } from '@shared/axios/component';
import { FspiopErrors, FspiopException } from '@shared/fspiop';
import { Dfsp } from '../dto';

export type PrefixOracleAxiosParams = AxiosClientBuilderParams;

export class PrefixOracleClient {

   private readonly logger = new Logger(PrefixOracleClient.name);
   private readonly prefixOracleEndpoint: string;
   private readonly client: AxiosInstance;

   constructor(
      prefixOracleEndpoint: string,
      params: PrefixOracleAxiosParams = {},
   ) {
      this.prefixOracleEndpoint = prefixOracleEndpoint.endsWith('/')
         ? prefixOracleEndpoint.slice(0, -1)
         : prefixOracleEndpoint;

      this.client = AxiosClientBuilder.newBuilder()
         .withParams(params)
         .withHttpLogger(true)
         .build();
   }

   async getDfspListByUsecase(usecase: string): Promise<Dfsp[]> {
      try {
         const response = await this.client.get<Dfsp[]>(
            `${this.prefixOracleEndpoint}/prefixesByUseCase/${encodeURIComponent(usecase)}`,
         );

         return response.data;
      } catch (error) {
         const status = isAxiosError(error) ? error.response?.status : undefined;
         const message = error instanceof Error ? error.message : String(error);

         this.logger.error(`getDfspListByUsecase failed for usecase=${usecase}`, message);

         if (status === 404) {
            throw new FspiopException(
               FspiopErrors.GENERIC_ID_NOT_FOUND,
               `DFSP list not found for usecase: ${usecase}`,
            );
         }

         throw new FspiopException(
            FspiopErrors.COMMUNICATION_ERROR,
            message,
         );
      }
   }

   async getDfspList(): Promise<Dfsp[]> {
      try {
         const response = await this.client.get<Dfsp[]>(
            `${this.prefixOracleEndpoint}/prefixes`,
         );

         return response.data;
      } catch (error) {
         const message = error instanceof Error ? error.message : String(error);

         this.logger.error('getDfspList failed', message);

         throw new FspiopException(
            FspiopErrors.COMMUNICATION_ERROR,
            message,
         );
      }
   }
}