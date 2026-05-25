import {IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength} from 'class-validator';

export class UserCreateDto {

    @IsEmail()
    @MaxLength(255)
    email!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(64)
    roleId!: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    fspId?: string | null;
}
