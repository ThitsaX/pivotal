import {SetMetadata, CustomDecorator} from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:public';

export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);
