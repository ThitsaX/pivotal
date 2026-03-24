import {Body, Controller, Post} from '@nestjs/common';
import {PivotalException} from '@shared/foundation';
import {RsaKeyPair} from '@shared/security/component/key/rsa-key-pair';

export class GenerateSigningKeyRequest {

    size!: number;
}

export class GenerateSigningKeyResponse {

    publicKey!: string;

    privateKey!: string;
}

@Controller('participant')
export class GenerateSigningKeyController {

    private static readonly SUPPORTED_KEY_SIZES = new Set<number>([2048, 4096]);

    @Post('signing-key')
    generateSigningKey(
        @Body() request: GenerateSigningKeyRequest,
    ): GenerateSigningKeyResponse {
        const size = Number(request.size);

        if (!GenerateSigningKeyController.SUPPORTED_KEY_SIZES.has(size)) {
            throw new PivotalException('INVALID_KEY_SIZE', 'Signing key size must be 2048 or 4096.');
        }

        const keyPair = RsaKeyPair.generate(size);
        const response = new GenerateSigningKeyResponse();

        response.publicKey = keyPair.publicKey.toBuffer().toString('utf-8');
        response.privateKey = keyPair.privateKey.toBuffer().toString('utf-8');

        return response;
    }
}
