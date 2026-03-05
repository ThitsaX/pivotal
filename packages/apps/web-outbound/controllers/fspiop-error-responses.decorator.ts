import {applyDecorators, HttpStatus} from '@nestjs/common';
import {ApiResponse} from '@nestjs/swagger';
import {ErrorInformationResponse} from '@shared/fspiop';

export const ApiFspiopErrorResponses = (): MethodDecorator => applyDecorators(
    ApiResponse({
        status: HttpStatus.BAD_REQUEST,
        description: 'FSPIOP validation or malformed request error.',
        type: ErrorInformationResponse,
    }),
    ApiResponse({
        status: HttpStatus.UNAUTHORIZED,
        description: 'FSPIOP authentication/signature error.',
        type: ErrorInformationResponse,
    }),
    ApiResponse({
        status: HttpStatus.FORBIDDEN,
        description: 'FSPIOP permission or blocked-party error.',
        type: ErrorInformationResponse,
    }),
    ApiResponse({
        status: HttpStatus.NOT_FOUND,
        description: 'FSPIOP identifier or route not found.',
        type: ErrorInformationResponse,
    }),
    ApiResponse({
        status: HttpStatus.NOT_ACCEPTABLE,
        description: 'Unsupported API version requested.',
        type: ErrorInformationResponse,
    }),
    ApiResponse({
        status: HttpStatus.REQUEST_TIMEOUT,
        description: 'FSPIOP request/quote/transfer expired.',
        type: ErrorInformationResponse,
    }),
    ApiResponse({
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        description: 'FSPIOP payload exceeds the allowed size.',
        type: ErrorInformationResponse,
    }),
    ApiResponse({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'FSPIOP business rejection from payer/payee/destination.',
        type: ErrorInformationResponse,
    }),
    ApiResponse({
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Unexpected internal error mapped by FspiopExceptionFilter.',
        type: ErrorInformationResponse,
    }),
    ApiResponse({
        status: HttpStatus.NOT_IMPLEMENTED,
        description: 'Requested operation is not supported.',
        type: ErrorInformationResponse,
    }),
    ApiResponse({
        status: HttpStatus.BAD_GATEWAY,
        description: 'Communication error while calling an external FSPIOP participant.',
        type: ErrorInformationResponse,
    }),
    ApiResponse({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        description: 'Service is temporarily unavailable or busy.',
        type: ErrorInformationResponse,
    }),
    ApiResponse({
        status: HttpStatus.GATEWAY_TIMEOUT,
        description: 'Timed out waiting for a downstream callback.',
        type: ErrorInformationResponse,
    }),
);
