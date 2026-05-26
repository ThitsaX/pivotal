import {Transform} from 'class-transformer';
import {IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min} from 'class-validator';

export class UserListQueryDto {

    @IsOptional()
    @Transform(({value}) => parseInt(String(value), 10))
    @IsInt()
    @Min(1)
    page: number = 1;

    @IsOptional()
    @Transform(({value}) => parseInt(String(value), 10))
    @IsInt()
    @Min(1)
    @Max(200)
    pageSize: number = 50;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    roleId?: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    fspId?: string;

    @IsOptional()
    @Transform(({value}) => value === true || value === 'true')
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsString()
    @MaxLength(255)
    search?: string;
}
