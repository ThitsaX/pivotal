// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-2026 ThitsaWorks Pte. Ltd.
import {Body, Controller, Get, Inject, Param, Post, Query} from '@nestjs/common';
import {CommandBus, QueryBus} from '@nestjs/cqrs';
import {IsNotEmpty, IsOptional, IsString, MaxLength} from 'class-validator';
import {PermissionKey, RequiresPermission} from '@core/auth/domain';
import {
    EnrollDfspCertificateCommand,
    GetDfspCertificateQuery,
    ListDfspCertificatesQuery,
    RevokeDfspCertificateCommand,
} from '@core/participant/domain';

export class EnrollDfspCertificateRequest {

    @IsString()
    @IsNotEmpty()
    fspId!: string;

    /** A PEM-encoded PKCS#10 request. The private key stays with the DFSP. */
    @IsString()
    @IsNotEmpty()
    csrPem!: string;

    @IsOptional()
    @IsString()
    @MaxLength(512)
    note?: string;
}

export class RevokeDfspCertificateRequest {

    @IsOptional()
    @IsString()
    @MaxLength(255)
    reason?: string;
}

/**
 * Hub-operator screens for DFSP client certificates.
 *
 * Enrollment is operator-mediated: a DFSP sends its certificate request out of band and the
 * operator submits it here. There is deliberately no DFSP-facing route — self-service would make a
 * portal login the root of trust for a cryptographic identity, and the DFSP-scoped identity model
 * that would need does not exist.
 */
@Controller('participant/certificates')
export class DfspCertificateController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(QueryBus)
        private readonly queryBus: QueryBus,
    ) {
    }

    @Post()
    @RequiresPermission(PermissionKey.PARTICIPANT_CERT_ENROLL)
    async enroll(
        @Body() request: EnrollDfspCertificateRequest,
    ): Promise<EnrollDfspCertificateCommand.Output> {
        return this.commandBus.execute(
            new EnrollDfspCertificateCommand(
                new EnrollDfspCertificateCommand.Input(request.fspId, request.csrPem, request.note),
            ),
        );
    }

    @Get()
    @RequiresPermission(PermissionKey.PARTICIPANT_CERT_VIEW)
    async list(
        @Query('fspId') fspId: string,
    ): Promise<ListDfspCertificatesQuery.Output> {
        return this.queryBus.execute(
            new ListDfspCertificatesQuery(new ListDfspCertificatesQuery.Input(fspId ?? '')),
        );
    }

    /**
     * The certificate and its issuing chain, for the operator to return to the DFSP.
     *
     * Served as JSON rather than a file download so the caller decides how to package it; a DFSP
     * that installs only the leaf presents an incomplete chain the peer cannot verify.
     */
    @Get(':id')
    @RequiresPermission(PermissionKey.PARTICIPANT_CERT_VIEW)
    async get(
        @Param('id') id: string,
    ): Promise<GetDfspCertificateQuery.Output> {
        return this.queryBus.execute(
            new GetDfspCertificateQuery(new GetDfspCertificateQuery.Input(id)),
        );
    }

    @Post(':id/revoke')
    @RequiresPermission(PermissionKey.PARTICIPANT_CERT_REVOKE)
    async revoke(
        @Param('id') id: string,
        @Body() request: RevokeDfspCertificateRequest,
    ): Promise<RevokeDfspCertificateCommand.Output> {
        return this.commandBus.execute(
            new RevokeDfspCertificateCommand(
                new RevokeDfspCertificateCommand.Input(id, request?.reason),
            ),
        );
    }
}
