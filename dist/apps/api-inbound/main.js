"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const api_inbound_module_1 = require("./api-inbound.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(api_inbound_module_1.ApiInboundModule);
    await app.listen(3001);
}
bootstrap();
//# sourceMappingURL=main.js.map