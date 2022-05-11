import { SmartContract, Querier } from '../contract'
import { Snip20Contract, TokenInfo } from '../snip20'
import { AccountLiquidity, Market } from './overseer'
import {
    Fee, Address, ContractInfo, Pagination, Decimal256,
    Uint256, Uint128, ViewingKey, create_fee
} from '../core'
import { ViewingKeyExecutor } from '../executors/viewing_key_executor'
import { LendAuth } from './auth'
import { PaginatedResponse } from '.'

import { ExecuteResult, SigningCosmWasmClient } from 'secretjs'

export interface MarketState {
    /**
     * Block height that the interest was last accrued at
     */
    accrual_block: number,
    /**
     * Accumulator of the total earned interest rate since the opening of the market
     */
    borrow_index: Decimal256,
    /**
     * Total amount of outstanding borrows of the underlying in this market
     */
    total_borrows: Uint256,
    /**
     * Total amount of reserves of the underlying held in this market
     */
    total_reserves: Uint256,
    /**
     * Total number of tokens in circulation
     */
    total_supply: Uint256,
    /**
     * The amount of the underlying token that the market has.
     */
    underlying_balance: Uint128,
    /**
     * Values in the contract that rarely change.
     */
    config: MarketConfig
}

export interface MarketConfig {
    /**
     * Initial exchange rate used when minting the first slTokens (used when totalSupply = 0)
     */
    initial_exchange_rate: Decimal256,
    /**
     * Fraction of interest currently set aside for reserves
     */
    reserve_factor: Decimal256,
    /**
     * Share of seized collateral that is added to reserves
     */
    seize_factor: Decimal256
}

export interface MarketAccount {
    /**
     * Amount of slToken that this account has.
     */
    sl_token_balance: Uint256,
    /**
     * How much the account has borrowed.
     */
    borrow_balance: Uint256,
    /**
     * The current exchange rate in the market.
     */
    exchange_rate: Decimal256
}

export interface MarketBorrower {
    id: string,
    /**
     * Borrow balance at the last interaction of the borrower.
     */
    principal_balance: Uint256,
    /**
     * Current borrow balance.
     */
    actual_balance: Uint256,
    liquidity: AccountLiquidity,
    markets: Market[]
}

export interface SimulateLiquidationResult {
    /**
     * The amount that would be seized by that liquidation minus protocol fees.
     */
    seize_amount: Uint256,
    /**
     * If the liquidation would be unsuccessful this will contain amount by which the seize amount falls flat. Otherwise, it's 0.
     */
    shortfall: Uint256
}

export type MarketPermissions = 'account_info' | 'balance' | 'id'

export class MarketContract extends SmartContract<MarketExecutor, MarketQuerier> {
    exec(fee?: Fee, memo?: string): MarketExecutor {
        return new MarketExecutor(
            this.address,
            () => this.query.apply(this),
            this.execute_client,
            fee,
            memo
        )
    }

    query(): MarketQuerier {
        return new MarketQuerier(this.address, this.query_client)
    }
}

class MarketExecutor extends ViewingKeyExecutor {
    constructor(
        address: Address,
        private querier: () => MarketQuerier,
        client?: SigningCosmWasmClient,
        fee?: Fee,
        memo?: string,
    ) {
        super(address, client, fee, memo)
    }

    /**
     * Convert and burn the specified amount of slToken to the underlying asset
     * based on the current exchange rate and transfer them to the user.
     */
    async redeem_from_sl(burn_amount: Uint256): Promise<ExecuteResult> {
        const msg = {
            redeem_token: {
                burn_amount
            }
        }

        return this.run(msg, '60000')
    }

    /**
     * Burns slToken amount of tokens equivalent to the specified amount based on the
     * current exchange rate and transfers the specified amount of the underyling asset to the user.
     */
    async redeem_from_underlying(receive_amount: Uint256): Promise<ExecuteResult> {
        const msg = {
            redeem_underlying: {
                receive_amount
            }
        }

        return this.run(msg, '60000')
    }

    async borrow(amount: Uint256): Promise<ExecuteResult> {
        const msg = {
            borrow: {
                amount
            }
        }

        return this.run(msg, '80000')
    }

    async transfer(amount: Uint256, recipient: Address): Promise<ExecuteResult> {
        const msg = {
            transfer: {
                amount,
                recipient
            }
        }

        return this.run(msg, '80000')
    }

    /**
     * This function is automatically called before every transaction to update to
     * the latest state of the market but can also be called manually through here.
     */
    async accrue_interest(): Promise<ExecuteResult> {
        const msg = {
            accrue_interest: { }
        }

        return this.run(msg, '40000')
    }

    async deposit(amount: Uint256, underlying_asset?: Address): Promise<ExecuteResult> {
        if (!underlying_asset) {
            underlying_asset = await this.get_underlying_asset()
        }

        const snip20 = new Snip20Contract(underlying_asset, this.client)
        const fee = this.fee || create_fee('60000')

        return snip20.exec(fee, this.memo).send(this.address, amount, 'deposit')
    }

    /**
     * @param borrower - Optionally specify a borrower ID to repay someone else's debt.
     */
    async repay(amount: Uint256, borrower?: string, underlying_asset?: Address): Promise<ExecuteResult> {
        if (!underlying_asset) {
            underlying_asset = await this.get_underlying_asset()
        }

        const snip20 = new Snip20Contract(underlying_asset, this.client)
        const fee = this.fee || create_fee('90000')

        const msg = {
            repay: {
                borrower
            }
        }

        return snip20.exec(fee, this.memo).send(this.address, amount, msg)
    }

    /**
     * Tries to liquidate an existing borrower in this market.
     * 
     * @param borrower - the ID corresponding to the borrower to liquidate.
     * @param collateral - the collateral market address to receive a premium on.
     * @param amount - the amount to liquidate by.
     * @param underlying_asset - The address of the underlying token for this market. Omitting it will result in an extra query.
     */
    async liquidate(
        amount: Uint256,
        borrower: string,
        collateral: Address,
        underlying_asset?: Address
    ): Promise<ExecuteResult> {
        if (!underlying_asset) {
            underlying_asset = await this.get_underlying_asset()
        }

        const snip20 = new Snip20Contract(underlying_asset, this.client)
        const fee = this.fee || create_fee('130000')

        const msg = {
            liquidate: {
                borrower,
                collateral
            }
        }

        return snip20.exec(fee, this.memo).send(this.address, amount, msg)
    }

    private async get_underlying_asset(): Promise<Address> {
        const result = await this.querier().underlying_asset()

        return result.address
    }
}

class MarketQuerier extends Querier {
    /**
     * Dry runs a liquidation returning a result indicating the amount of `collateral` which would be seized
     * and whether the liquidation would be successful depending on whether the borrower posseses the seized collateral amount.
     * Otherwise, throws any other error that might occur during the actual liquidation. If you haven't taken the close factor
     * into account already, you might want to look for an error that starts with "Repay amount is too high." as that indicates
     * that you are trying to liquidate a bigger portion of the borrower's collateral than permitted by the close factor.
     * 
     * @param borrower - the ID corresponding to the borrower to liquidate.
     * @param collateral - the collateral market address to receive a premium on.
     * @param amount - the amount to liquidate by.
     */
    async simulate_liquidation(
        borrower: string,
        collateral: Address,
        amount: Uint256,
        block?: number
    ): Promise<SimulateLiquidationResult> {
        if (!block) {
            block = (await this.client.getBlock()).header.height
        }
        
        const msg = {
            block,
            borrower,
            collateral,
            amount
        }

        return this.run(msg)
    }

    async token_info(): Promise<TokenInfo> {
        return new Snip20Contract(this.address, undefined, this.client)
            .query()
            .get_token_info()
    }

    async balance(address: Address, key: ViewingKey): Promise<Uint128> {
        return new Snip20Contract(this.address, undefined, this.client)
            .query()
            .get_balance(address, key)
    }

    async underlying_balance(auth: LendAuth, block?: number): Promise<Uint128> {
        if (!block) {
            block = (await this.client.getBlock()).header.height
        }

        const msg = {
            balance_underlying: {
                block,
                method: await auth.create_method<MarketPermissions>(this.address, 'balance')
            }
        }

        return this.run(msg)
    }

    async state(block?: number): Promise<MarketState> {
        if (!block) {
            block = (await this.client.getBlock()).header.height
        }

        const msg = {
            state: {
                block
            }
        }

        return this.run(msg)
    }

    async underlying_asset(): Promise<ContractInfo> {
        const msg = {
            underlying_asset: { }
        }

        return this.run(msg)
    }

    async borrow_rate(block?: number): Promise<Decimal256> {
        if (!block) {
            block = (await this.client.getBlock()).header.height
        }

        const msg = {
            borrow_rate: {
                block
            }
        }

        return this.run(msg)
    }

    async supply_rate(block?: number): Promise<Decimal256> {
        if (!block) {
            block = (await this.client.getBlock()).header.height
        }

        const msg = {
            supply_rate: {
                block
            }
        }

        return this.run(msg)
    }

    async exchange_rate(block?: number): Promise<Decimal256> {
        if (!block) {
            block = (await this.client.getBlock()).header.height
        }

        const msg = {
            exchange_rate: {
                block
            }
        }

        return this.run(msg)
    }

    async account(auth: LendAuth, block?: number): Promise<MarketAccount> {
        if (!block) {
            block = (await this.client.getBlock()).header.height
        }

        const msg = {
            account: {
                block,
                method: await auth.create_method<MarketPermissions>(this.address, 'account_info')
            }
        }

        return this.run(msg)
    }

    /**
     * Will throw if the account hasn't borrowed at least once before.
     */
    async account_id(auth: LendAuth): Promise<string> {
        const msg = {
            id: {
                method: await auth.create_method<MarketPermissions>(this.address, 'id')
            }
        }

        return this.run(msg)
    }

    /**
     * Max limit is 10.
     */
    async borrowers(pagination: Pagination, block?: number): Promise<PaginatedResponse<MarketBorrower>> {
        if (!block) {
            block = (await this.client.getBlock()).header.height
        }

        const msg = {
            borrowers: {
                block,
                pagination
            }
        }

        return this.run(msg)
    }
}
