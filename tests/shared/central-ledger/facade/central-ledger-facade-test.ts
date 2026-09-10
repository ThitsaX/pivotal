import * as assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {CentralLedgerFacade} from '../../../../packages/shared/central-ledger/facade/central-ledger-facade';
import {Currency} from '../../../../packages/shared/fspiop/dto/currency';

describe('CentralLedgerFacade', () => {

    it('should list available enums via central ledger axios', async () => {
        const expectedResponse = {ledgerAccountTypes: ['POSITION']};
        const centralLedgerAxios = {
            async getEnums(): Promise<unknown> {
                return expectedResponse;
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        const actualResponse = await facade.listAvailableEnums();

        assert.equal(actualResponse, expectedResponse);
    });

    it('should create the Hub multilateral settlement account', async () => {
        let capturedName: string | undefined;
        let capturedBody: {currency?: Currency; type?: string} | undefined;
        const centralLedgerAxios = {
            async getParticipants(): Promise<Array<{name: string}>> {
                return [{name: 'Hub'}];
            },
            async createParticipantAccounts(
                name: string,
                body: {currency?: Currency; type?: string},
            ): Promise<void> {
                capturedName = name;
                capturedBody = body;
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        await facade.createHubMultilateralSettlementAccount(Currency.Usd);

        assert.equal(capturedName, 'Hub');
        assert.equal(capturedBody?.currency, Currency.Usd);
        assert.equal(capturedBody?.type, 'HUB_MULTILATERAL_SETTLEMENT');
    });

    it('should create the Hub reconciliation account', async () => {
        let capturedName: string | undefined;
        let capturedBody: {currency?: Currency; type?: string} | undefined;
        const centralLedgerAxios = {
            async getParticipants(): Promise<Array<{name: string}>> {
                return [{name: 'Hub'}];
            },
            async createParticipantAccounts(
                name: string,
                body: {currency?: Currency; type?: string},
            ): Promise<void> {
                capturedName = name;
                capturedBody = body;
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        await facade.createHubReconciliationAccount(Currency.Usd);

        assert.equal(capturedName, 'Hub');
        assert.equal(capturedBody?.currency, Currency.Usd);
        assert.equal(capturedBody?.type, 'HUB_RECONCILIATION');
    });

    it('should create the deferred net settlement model for the given currency', async () => {
        let capturedBody:
            | {
                name?: string;
                settlementGranularity?: string;
                settlementInterchange?: string;
                settlementDelay?: string;
                requireLiquidityCheck?: boolean;
                ledgerAccountType?: string;
                autoPositionReset?: boolean;
                currency?: Currency;
                settlementAccountType?: string;
            }
            | undefined;
        const centralLedgerAxios = {
            async createSettlementModel(body: typeof capturedBody): Promise<void> {
                capturedBody = body;
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        await facade.createDeferredNetSettlementModel(Currency.Usd);

        assert.equal(capturedBody?.name, 'DEFERREDNETUSD');
        assert.equal(capturedBody?.settlementGranularity, 'NET');
        assert.equal(capturedBody?.settlementInterchange, 'MULTILATERAL');
        assert.equal(capturedBody?.settlementDelay, 'DEFERRED');
        assert.equal(capturedBody?.requireLiquidityCheck, true);
        assert.equal(capturedBody?.ledgerAccountType, 'POSITION');
        assert.equal(capturedBody?.autoPositionReset, true);
        assert.equal(capturedBody?.currency, Currency.Usd);
        assert.equal(capturedBody?.settlementAccountType, 'SETTLEMENT');
    });

    it('should add the Hub currency using the exact participant name from Central Ledger', async () => {
        const calls: string[] = [];
        let participantLookups = 0;
        const centralLedgerAxios = {
            async getParticipants(): Promise<Array<{name: string}>> {
                participantLookups += 1;
                return [{name: 'hub'}];
            },
            async createParticipantAccounts(
                name: string,
                body: {currency?: Currency; type?: string},
            ): Promise<void> {
                calls.push(`${name}:${body.type}:${body.currency}`);
            },
            async createSettlementModel(body: {name?: string; currency?: Currency}): Promise<void> {
                calls.push(`${body.name}:${body.currency}`);
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        await facade.addHubCurrency(Currency.Usd);

        assert.deepEqual(calls, [
            'hub:HUB_MULTILATERAL_SETTLEMENT:USD',
            'hub:HUB_RECONCILIATION:USD',
            'DEFERREDNETUSD:USD',
        ]);
        assert.equal(participantLookups, 1);
    });

    it('should identify a custom Hub participant by its existing Hub account', async () => {
        const participantNames: string[] = [];
        const centralLedgerAxios = {
            async getParticipants(): Promise<Array<{name: string; accounts: Array<{ledgerAccountType: string}>}>> {
                return [{
                    name: 'switch',
                    accounts: [{ledgerAccountType: 'HUB_RECONCILIATION'}],
                }];
            },
            async createParticipantAccounts(name: string): Promise<void> {
                participantNames.push(name);
            },
            async createSettlementModel(): Promise<void> {
                // No-op for this participant-name resolution test.
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        await facade.addHubCurrency(Currency.Usd);

        assert.deepEqual(participantNames, ['switch', 'switch']);
    });

    it('should list all participants via central ledger axios', async () => {
        const expectedParticipants = [
            {name: 'Hub'},
            {name: 'wallet1'},
        ];
        const centralLedgerAxios = {
            async getParticipants(): Promise<Array<{name: string}>> {
                return expectedParticipants;
            },
        };
        const facade = new CentralLedgerFacade(centralLedgerAxios as never);

        const actualParticipants = await facade.listAllParticipants();

        assert.equal(actualParticipants, expectedParticipants);
    });
});
