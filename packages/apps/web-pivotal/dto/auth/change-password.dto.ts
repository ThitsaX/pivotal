import {IsNotEmpty, IsString, Matches, MaxLength, MinLength} from 'class-validator';

export class ChangePasswordDto {

    @IsString()
    @IsNotEmpty()
    @MaxLength(256)
    currentPassword!: string;

    @IsString()
    @MinLength(12, {message: 'New password must be at least 12 characters.'})
    @MaxLength(256)
    @Matches(/[a-z]/, {message: 'New password must contain a lowercase letter.'})
    @Matches(/[A-Z]/, {message: 'New password must contain an uppercase letter.'})
    @Matches(/\d/, {message: 'New password must contain a digit.'})
    @Matches(/[^a-zA-Z0-9]/, {message: 'New password must contain a symbol.'})
    newPassword!: string;
}
