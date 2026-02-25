"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const api_outbound_module_1 = require("./api-outbound.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(api_outbound_module_1.ApiOutboundModule);
    await app.listen(3002);
}
bootstrap();
//# sourceMappingURL=main.js.map