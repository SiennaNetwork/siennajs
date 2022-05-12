import { Client, Fee, Address, Decimal256, Uint128, Uint256 } from '@fadroma/client'
import { ViewingKey } from '@fadroma/client-scrt'
import { Snip20, TokenInfo } from '@fadroma/tokens'

import { LendAccountLiquidity, LendOverseerMarket } from './LendOverseer'
import { ContractInfo, Pagination, create_fee } from '../core'
import { ViewingKeyExecutor } from '../executors/viewing_key_executor'
import { LendAuth } from './LendAuth'
import { PaginatedResponse } from '../lib/LendPagination'

export class LendMarket extends Client {

  /** Convert and burn the specified amount of slToken to the underlying asset
    * based on the current exchange rate and transfer them to the user. */
  async redeemFromSL (burn_amount: Uint256) {
    return this.execute({ redeem_token: { burn_amount } }, '60000')
  }

  /** Burn slToken amount of tokens equivalent to the specified amount
    * based on the current exchange rate and transfer the specified amount
    * of the underyling asset to the user. */
  async redeemFromUnderlying (receive_amount: Uint256) {
    return this.execute({ redeem_underlying: { receive_amount } }, '60000')
  }

  async borrow (amount: Uint256) {
    return this.execute({ borrow: { amount } }, '80000')
  }

  async transfer (amount: Uint256, recipient: Address) {
    return this.execute({ transfer: { amount, recipient } }, '80000')
  }

  /** This function is automatically called before every transaction to update to
    * the latest state of the market but can also be called manually through here. */
  async accrueInterest () {
    return this.execute({ accrueInterest: { } }, '40000')
  }

  async deposit (amount: Uint256, underlying_asset?: Address) {
    return this.agent.getClient(Snip20, {
      address: underlying_asset || (await this.getUnderlyingAsset()).address
    }).withFees({ exec: this.fee || create_fee('60000') })
      .send(this.address, amount, 'deposit')
  }

  async repay (
    amount: Uint256,
    /** Optionally specify a borrower ID to repay someone else's debt. */
    borrower?: string,
    underlying_asset?: Address
  ) {
    return this.agent.getClient(Snip20, {
      address: underlying_asset || await this.getUnderlyingAsset()
    }).withFees({ exec: this.fee || create_fee('90000') })
      .send(this.address, amount, { repay: { borrower } })
  }

  /** Try to liquidate an existing borrower in this market. */
  async liquidate(
    /** @param amount - the amount to liquidate by. */
    amount: Uint256,
    /** @param borrower - the ID corresponding to the borrower to liquidate. */
    borrower: string,
    /** @param collateral - the collateral market address to receive a premium on. */
    collateral: Address,
    /** @param underlying_asset - The address of the underlying token for this market. Omitting it will result in an extra query. */
    underlying_asset?: Address
  ) {
    return this.agent.getClient(Snip20, {
      address: underlying_asset || await this.getUnderlyingAsset()
    }).withFees({ exec: this.fee || create_fee('130000') })
      .send(this.address, amount, { liquidate: { borrower, collateral } })
  }

  /** Dry run a liquidation returning a result indicating the amount of `collateral`
    * which would be seized, and whether the liquidation would be successful depending
    * on whether the borrower posseses the seized collateral amount.
    * If it wouldn't, throw any other error that might occur during the actual liquidation.
    *
    * If you haven't taken the close factor into account already, you might want to look for
    * an error that starts with "Repay amount is too high." as that indicates that you are
    * trying to liquidate a bigger portion of the borrower's collateral than permitted by
    * the close factor. */
  async simulate_liquidation(
    /** @param borrower - the ID corresponding to the borrower to liquidate. */
    borrower: string,
    /** @param collateral - the collateral market address to receive a premium on. */
    collateral: Address,
    /** @param amount - the amount to liquidate by. */
    amount: Uint256,
    block?: number
  ): Promise<SimulateLiquidationResult> {
    block = block || (await this.client.getBlock()).header.height
    return this.query({ block, borrower, collateral, amount })
  }

  async getTokenInfo (): Promise<TokenInfo> {
    return this.agent.getClient(Snip20, { address: this.address }).getTokenInfo()
  }

  async getBalance (address: Address, key: ViewingKey): Promise<Uint128> {
    return this.agent.getClient(Snip20, { address: this.address }).getBalance(address, key)
  }

  async getUnderlyingBalance (auth: LendAuth, block?: number): Promise<Uint128> {
    block = block || (await this.client.getBlock()).header.height
    const method = await auth.createMethod<LendMarketPermissions>(this.address, 'balance')
    return this.query({ balance_underlying: { block, method } })
  }

  async getState (block?: number): Promise<LendMarketState> {
    block = block || (await this.client.getBlock()).header.height
    return this.query({ state: { block } })
  }

  async getUnderlyingAsset (): Promise<ContractInfo> {
    return this.query({ underlying_asset: {} })
  }

  async getBorrowRate (block?: number): Promise<Decimal256> {
    block = block || (await this.client.getBlock()).header.height
    return this.query({ borrow_rate: { block } })
  }

  async getSupplyRate (block?: number): Promise<Decimal256> {
    block = block || (await this.client.getBlock()).header.height
    return this.query({ supply_rate: { block } })
  }

  async getExchangeRate (block?: number): Promise<Decimal256> {
    block = block || (await this.client.getBlock()).header.height
    return this.query({ exchange_rate: { block } })
  }

  async getAccount (auth: LendAuth, block?: number): Promise<LendMarketAccount> {
    block = block || (await this.client.getBlock()).header.height
    const method = await auth.createMethod<LendMarketPermissions>(this.address, 'account_info')
    return this.query({ account: { block, method } })
  }

  /** Will throw if the account hasn't borrowed at least once before. */
  async getAccountId (auth: LendAuth): Promise<string> {
    const method = await auth.createMethod<LendMarketPermissions>(this.address, 'id')
    return this.query({ id: { method } })
  }

  /** Max limit is 10. */
  async getBorrowers (
    pagination: Pagination,
    block?:     number
  ): Promise<PaginatedResponse<MarketBorrower>> {
    block = block || (await this.client.getBlock()).header.height
    return this.query({ borrowers: { block, pagination } })
  }

}

export interface LendMarketState {
  /** Block height that the interest was last accrued at */
  accrual_block: number,
  /** Accumulator of the total earned interest rate since the opening of the market */
  borrow_index: Decimal256,
  /** Total amount of outstanding borrows of the underlying in this market */
  total_borrows: Uint256,
  /** Total amount of reserves of the underlying held in this market */
  total_reserves: Uint256,
  /** Total number of tokens in circulation */
  total_supply: Uint256,
  /** The amount of the underlying token that the market has. */
  underlying_balance: Uint128,
  /** Values in the contract that rarely change. */
  config: LendMarketConfig
}

export interface LendMarketConfig {
  /** Initial exchange rate used when minting the first slTokens (used when totalSupply = 0) */
  initial_exchange_rate: Decimal256,
  /** Fraction of interest currently set aside for reserves */
  reserve_factor: Decimal256,
  /** Share of seized collateral that is added to reserves */
  seize_factor: Decimal256
}

export interface LendMarketAccount {
  /** Amount of slToken that this account has. */
  sl_token_balance: Uint256,
  /** How much the account has borrowed. */
  borrow_balance: Uint256,
  /** The current exchange rate in the market. */
  exchange_rate: Decimal256
}

export interface MarketBorrower {
  id: string,
  /** Borrow balance at the last interaction of the borrower. */
  principal_balance: Uint256,
  /** Current borrow balance. */
  actual_balance: Uint256,
  liquidity: LendAccountLiquidity,
  markets: LendMarket[]
}

export interface SimulateLiquidationResult {
  /** The amount that would be seized by that liquidation minus protocol fees. */
  seize_amount: Uint256,
  /** If the liquidation would be unsuccessful this will contain amount by which the seize amount falls flat. Otherwise, it's 0. */
  shortfall: Uint256
}

export type LendMarketPermissions = 'account_info' | 'balance' | 'id'
