"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const microservices_1 = require("@nestjs/microservices");
const app_audit_subscriber_module_1 = require("./app-audit-subscriber.module");
async function bootstrap() {
    const app = await core_1.NestFactory.createMicroservice(app_audit_subscriber_module_1.AppAuditSubscriberModule, {
        transport: microservices_1.Transport.NATS,
        options: {
            servers: ['nats://localhost:4222'],
        },
    });
    await app.listen();
}
bootstrap();
//# sourceMappingURL=main.js.map