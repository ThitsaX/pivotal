// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Inject,
    Post,
    Req,
    Res,
    UnauthorizedException,
} from '@nestjs/common';
import {CommandBus} from '@nestjs/cqrs';
import {
    AUTH_DOMAIN_REQUIRED_SETTINGS,
    AuthDomainSettings,
    authError,
    AuthErrorCode,
    ChangePasswordCommand,
    LoginCommand,
    LogoutCommand,
    Public,
    RefreshTokensCommand,
} from '@core/auth/domain';
import type {Request, Response} from 'express';
import {ChangePasswordDto, LoginDto, LoginResponseDto, RefreshResponseDto, AuthUserDto} from '../../dto/auth';

const REFRESH_COOKIE_NAME = 'pivotal_refresh_token';

@Controller('auth')
export class AuthController {

    constructor(
        @Inject(CommandBus)
        private readonly commandBus: CommandBus,
        @Inject(AUTH_DOMAIN_REQUIRED_SETTINGS)
        private readonly settings: AuthDomainSettings,
    ) {
    }

    @Public()
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() dto: LoginDto, @Res({passthrough: true}) response: Response): Promise<LoginResponseDto> {

        const output = await this.commandBus.execute<LoginCommand, LoginCommand.Output>(
            new LoginCommand(new LoginCommand.Input(dto.email, dto.password)),
        );

        this.setRefreshCookie(response, output.refreshToken, output.refreshTokenExpiresAt);

        return new LoginResponseDto(
            output.accessToken,
            this.settings.accessTokenTtlSeconds(),
            new AuthUserDto(
                output.user.id,
                output.user.email,
                output.user.roleCode,
                output.user.fspId,
            ),
            output.permissions,
            output.user.mustChangePassword,
        );
    }

    @Public()
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(@Req() request: Request, @Res({passthrough: true}) response: Response): Promise<RefreshResponseDto> {

        const refreshToken = this.readRefreshCookie(request);

        if (refreshToken == null) {
            throw new UnauthorizedException(authError(AuthErrorCode.INVALID_REFRESH_TOKEN));
        }

        const output = await this.commandBus.execute<RefreshTokensCommand, RefreshTokensCommand.Output>(
            new RefreshTokensCommand(new RefreshTokensCommand.Input(refreshToken)),
        );

        this.setRefreshCookie(response, output.refreshToken, output.refreshTokenExpiresAt);

        return new RefreshResponseDto(
            output.accessToken,
            this.settings.accessTokenTtlSeconds(),
            output.permissions,
            output.mustChangePassword,
        );
    }

    @Public()
    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    async logout(@Req() request: Request, @Res({passthrough: true}) response: Response): Promise<void> {

        const refreshToken = this.readRefreshCookie(request);

        if (refreshToken != null) {
            await this.commandBus.execute<LogoutCommand, LogoutCommand.Output>(
                new LogoutCommand(new LogoutCommand.Input(refreshToken, false)),
            );
        }

        this.clearRefreshCookie(response);
    }

    @Post('change-password')
    @HttpCode(HttpStatus.NO_CONTENT)
    async changePassword(
        @Req() request: Request,
        @Res({passthrough: true}) response: Response,
        @Body() dto: ChangePasswordDto,
    ): Promise<void> {

        const claims = request.authUser;

        if (claims == null) {
            throw new UnauthorizedException(authError(AuthErrorCode.INVALID_CREDENTIALS));
        }

        await this.commandBus.execute<ChangePasswordCommand, ChangePasswordCommand.Output>(
            new ChangePasswordCommand(new ChangePasswordCommand.Input(claims.sub, dto.currentPassword, dto.newPassword)),
        );

        // All refresh tokens are revoked by the handler; clear the cookie too.
        this.clearRefreshCookie(response);
    }

    private readRefreshCookie(request: Request): string | null {

        const cookies = (request as Request & {cookies?: Record<string, string>}).cookies;
        const value = cookies?.[REFRESH_COOKIE_NAME];

        if (value == null || value.trim().length === 0) {
            return null;
        }

        return value;
    }

    private setRefreshCookie(response: Response, value: string, expiresAt: Date): void {

        response.cookie(REFRESH_COOKIE_NAME, value, {
            httpOnly: true,
            secure:   true,
            sameSite: 'strict',
            path:     '/auth',
            expires:  expiresAt,
        });
    }

    private clearRefreshCookie(response: Response): void {

        response.clearCookie(REFRESH_COOKIE_NAME, {
            httpOnly: true,
            secure:   true,
            sameSite: 'strict',
            path:     '/auth',
        });
    }
}
