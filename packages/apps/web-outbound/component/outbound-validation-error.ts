import { BadRequestException, ValidationError } from '@nestjs/common';
import { FspiopErrors } from '@shared/fspiop';

export interface OutboundValidationErrorResponse {
   statusCode: string;
   message: string;
   localeMessage: string;
   detailedDescription: string;
}

const buildValidationFieldPath = (
   error: ValidationError,
   parentPath?: string,
): string => {
   return parentPath == null || parentPath.length === 0
      ? error.property
      : `${parentPath}.${error.property}`;
};

const formatValidationErrors = (
   errors: ValidationError[],
   parentPath?: string,
): string[] => {
   return errors.flatMap((error) => {
      const fieldPath = buildValidationFieldPath(error, parentPath);

      const currentErrors = Object.values(error.constraints ?? {})
         .map((message) => `[ ${message} ]`);

      const childErrors = formatValidationErrors(error.children ?? [], fieldPath);

      return [...currentErrors, ...childErrors];
   });
};

export const createOutboundValidationException = (
   errors: ValidationError[],
): BadRequestException => {
   const errorDefinition = FspiopErrors.MISSING_MANDATORY_ELEMENT;
   const validationDetails = formatValidationErrors(errors);

   const responseBody: OutboundValidationErrorResponse = {
      statusCode: errorDefinition.errorType.code,
      message: errorDefinition.description,
      localeMessage: errorDefinition.description,
      detailedDescription: `Input error : ${validationDetails.join(',')}`,
   };

   return new BadRequestException(responseBody);
};

export const isOutboundValidationErrorResponse = (
   value: unknown,
): value is OutboundValidationErrorResponse => {
   if (typeof value !== 'object' || value == null) {
      return false;
   }

   const response = value as Partial<OutboundValidationErrorResponse>;

   return (
      typeof response.statusCode === 'string' &&
      typeof response.message === 'string' &&
      typeof response.localeMessage === 'string' &&
      typeof response.detailedDescription === 'string'
   );
};