import {ArrayUnique, IsArray, IsString, MaxLength} from 'class-validator';

export class RolePermissionsDto {

    @IsArray()
    @ArrayUnique()
    @IsString({each: true})
    @MaxLength(128, {each: true})
    permissionKeys!: string[];
}
