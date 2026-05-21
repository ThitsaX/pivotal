import {IsEmail, IsNotEmpty, IsString, MaxLength} from 'class-validator';

export class LoginDto {

    @IsEmail()
    @MaxLength(255)
    email!: string;

    @IsString()
    @IsNotEmpty()
    @MaxLength(256)
    password!: string;
}
