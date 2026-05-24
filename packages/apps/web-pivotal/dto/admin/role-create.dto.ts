import {IsNotEmpty, IsOptional, IsString, MaxLength} from 'class-validator';

export class RoleCreateDto {

    @IsString()
    @IsNotEmpty()
    @MaxLength(64)
    code!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(128)
    name!: string;

    @IsOptional()
    @IsString()
    @MaxLength(512)
    description?: string;
}
