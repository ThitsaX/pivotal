import {IsOptional, IsString, MaxLength} from 'class-validator';

export class RoleUpdateDto {

    @IsOptional()
    @IsString()
    @MaxLength(128)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(512)
    description?: string | null;

    // Declared so they survive the global whitelist filter; the controller rejects them
    // with a specific ADMIN_ROLE_IMMUTABLE_FIELD error code (AC-10.3) rather than the
    // generic "property should not exist" message from forbidNonWhitelisted.
    @IsOptional()
    code?: string;

    @IsOptional()
    isSystem?: boolean;
}
