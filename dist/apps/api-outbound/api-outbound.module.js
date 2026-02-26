"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiOutboundModule = void 0;
const common_1 = require("@nestjs/common");
const domain_1 = require("../../core/outbound/domain");
const controller_1 = require("./controller");
let ApiOutboundModule = class ApiOutboundModule {
};
exports.ApiOutboundModule = ApiOutboundModule;
exports.ApiOutboundModule = ApiOutboundModule = __decorate([
    (0, common_1.Module)({
        imports: [domain_1.OutboundDomainModule],
        controllers: [controller_1.LookupController, controller_1.QuotingController, controller_1.TransferController],
    })
], ApiOutboundModule);
//# sourceMappingURL=api-outbound.module.js.map