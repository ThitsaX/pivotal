// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 ThitsaWorks
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
