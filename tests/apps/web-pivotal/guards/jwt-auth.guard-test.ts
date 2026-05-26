import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {ExecutionContext, UnauthorizedException} from '@nestjs/common';
import {Reflector} from '@nestjs/core';
import {AccessTokenClaims, IS_PUBLIC_KEY, TokenService, UserRepository} from '../../../../packages/core/auth/domain';
import {User} from '../../../../packages/core/auth/domain/model';
import {JwtAuthGuard} from '../../../../packages/apps/web-pivotal/guards/jwt-auth.guard';

interface MockableRequest {
    headers: Record<string, string | undefined>;
    authUser?: AccessTokenClaims;
}

function makeContext(request: MockableRequest, isPublic: boolean = false): {
    context:   ExecutionContext;
    reflector: Reflector;
} {
    const reflector = {
        getAllAndOverride<T>(key: string): T | undefined {
            if (key === IS_PUBLIC_KEY) {
                return isPublic as unknown as T;
            }
            return undefined;
        },
    } as unknown as Reflector;

    const context = {
        getHandler:   () => () => {},
        getClass:     () => class {},
        switchToHttp: () => ({getRequest: () => request}),
    } as unknown as ExecutionContext;

    return {context, reflector};
}

function makeClaims(iat: number, sub: string = 'user-1'): AccessTokenClaims {
    return {
        sub,
        role:               'ADMIN',
        fspId:              null,
        permissions:        ['admin.users.manage'],
        mustChangePassword: false,
        iss:                'pivotal',
        iat,
        exp:                iat + 900,
        jti:                'jti-1',
    };
}

function makeUser(overrides: Partial<User> = {}): User {
    const user = new User('admin@example.com', 'hash', 'role-1', null, false, 'user-1');
    user.isActive = true;
    user.tokensInvalidatedAt = null;
    Object.assign(user, overrides);
    return user;
}

interface UserRepoCalls {
    findByIdCalls: string[];
}

function makeUserRepository(user: User | null): {
    repo:  UserRepository;
    calls: UserRepoCalls;
} {
    const calls: UserRepoCalls = {findByIdCalls: []};
    const repo = {
        async findById(id: string): Promise<User | null> {
            calls.findByIdCalls.push(id);
            return user;
        },
    } as unknown as UserRepository;
    return {repo, calls};
}

function makeTokenService(verifyResult: AccessTokenClaims | null): TokenService {
    return {
        async verifyAccessToken(): Promise<AccessTokenClaims | null> {
            return verifyResult;
        },
    } as unknown as TokenService;
}

describe('JwtAuthGuard', () => {

    it('lets @Public routes through without touching token service or user repository', async () => {

        const {context, reflector} = makeContext({headers: {}}, true);
        const {repo, calls} = makeUserRepository(null);

        const guard = new JwtAuthGuard(makeTokenService(null), repo, reflector);

        assert.equal(await guard.canActivate(context), true);
        assert.equal(calls.findByIdCalls.length, 0);
    });

    it('rejects when Authorization header is missing', async () => {

        const {context, reflector} = makeContext({headers: {}});
        const {repo} = makeUserRepository(null);

        const guard = new JwtAuthGuard(makeTokenService(null), repo, reflector);

        await assert.rejects(
            guard.canActivate(context),
            (error: unknown) => error instanceof UnauthorizedException
                && (error.getResponse() as {code: string}).code === 'AUTH_MISSING_TOKEN',
        );
    });

    it('rejects when token verification fails', async () => {

        const {context, reflector} = makeContext({headers: {authorization: 'Bearer bad'}});
        const {repo} = makeUserRepository(null);

        const guard = new JwtAuthGuard(makeTokenService(null), repo, reflector);

        await assert.rejects(
            guard.canActivate(context),
            (error: unknown) => error instanceof UnauthorizedException
                && (error.getResponse() as {code: string}).code === 'AUTH_INVALID_TOKEN',
        );
    });

    it('rejects with USER_INACTIVE when the user row is missing', async () => {

        const {context, reflector} = makeContext({headers: {authorization: 'Bearer good'}});
        const claims = makeClaims(1_700_000_000);
        const {repo} = makeUserRepository(null);

        const guard = new JwtAuthGuard(makeTokenService(claims), repo, reflector);

        await assert.rejects(
            guard.canActivate(context),
            (error: unknown) => error instanceof UnauthorizedException
                && (error.getResponse() as {code: string}).code === 'AUTH_USER_INACTIVE',
        );
    });

    it('rejects with USER_INACTIVE when is_active is false', async () => {

        const {context, reflector} = makeContext({headers: {authorization: 'Bearer good'}});
        const claims = makeClaims(1_700_000_000);
        const {repo} = makeUserRepository(makeUser({isActive: false}));

        const guard = new JwtAuthGuard(makeTokenService(claims), repo, reflector);

        await assert.rejects(
            guard.canActivate(context),
            (error: unknown) => error instanceof UnauthorizedException
                && (error.getResponse() as {code: string}).code === 'AUTH_USER_INACTIVE',
        );
    });

    it('rejects with TOKEN_REVOKED when tokens_invalidated_at >= claims.iat', async () => {

        const {context, reflector} = makeContext({headers: {authorization: 'Bearer good'}});
        const iat = 1_700_000_000;
        const claims = makeClaims(iat);
        const watermark = new Date(iat * 1000);
        const {repo} = makeUserRepository(makeUser({tokensInvalidatedAt: watermark}));

        const guard = new JwtAuthGuard(makeTokenService(claims), repo, reflector);

        await assert.rejects(
            guard.canActivate(context),
            (error: unknown) => error instanceof UnauthorizedException
                && (error.getResponse() as {code: string}).code === 'AUTH_TOKEN_REVOKED',
        );
    });

    it('lets the request through when tokens_invalidated_at is before claims.iat', async () => {

        const request: MockableRequest = {headers: {authorization: 'Bearer good'}};
        const {context, reflector} = makeContext(request);
        const iat = 1_700_000_000;
        const claims = makeClaims(iat);
        const watermark = new Date((iat - 60) * 1000);
        const {repo, calls} = makeUserRepository(makeUser({tokensInvalidatedAt: watermark}));

        const guard = new JwtAuthGuard(makeTokenService(claims), repo, reflector);

        assert.equal(await guard.canActivate(context), true);
        assert.equal(request.authUser, claims);
        assert.equal(calls.findByIdCalls.length, 1, 'guard must perform exactly one user lookup per request (AC-8.6)');
        assert.equal(calls.findByIdCalls[0], claims.sub);
    });

    it('lets the request through when tokens_invalidated_at is null', async () => {

        const request: MockableRequest = {headers: {authorization: 'Bearer good'}};
        const {context, reflector} = makeContext(request);
        const claims = makeClaims(1_700_000_000);
        const {repo, calls} = makeUserRepository(makeUser());

        const guard = new JwtAuthGuard(makeTokenService(claims), repo, reflector);

        assert.equal(await guard.canActivate(context), true);
        assert.equal(request.authUser, claims);
        assert.equal(calls.findByIdCalls.length, 1);
    });
});
