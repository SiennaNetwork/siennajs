import type { Address, Pagination, PaginatedResponse } from './Core'
import { Client, Fee } from './Core'

export class Overseer extends Client {

  fees = {
    enter: new Fee('40000', 'uscrt'),
    exit:  new Fee('50000', 'uscrt')
  }

  async enter (markets: Address[]) {
    return await this.execute({ enter: { markets } })
  }

  async exit (market_address: Address) {
    return await this.execute({ exit: { market_address } })
  }

  /** Max limit per page is `30`. */
  async getMarkets (pagination: Pagination): Promise<PaginatedResponse<OverseerMarket>> {
    return this.query({ markets: { pagination } })
  }

  async getMarket (address: Address): Promise<OverseerMarket> {
    return this.query({ market: { address } })
  }

  async getEnteredMarkets (auth: LendAuth): Promise<OverseerMarket[]> {
    const method = await auth.createMethod<OverseerPermissions>(this.address!, 'account_info')
    return this.query({ entered_markets: { method } })
  }

  async getCurrentLiquidity (
    auth: LendAuth,
    block?: number
  ): Promise<AccountLiquidity> {
    return this.query({
      account_liquidity: {
        block:  block ?? await this.agent!.height,
        method: await auth.createMethod<OverseerPermissions>(this.address!, 'account_info'),
        market: null,
        redeem_amount: '0',
        borrow_amount: '0'
      }
    })
  }

  /** The hypothetical liquidity after a redeem operation from a market. */
  async getLiquidityAfterRedeem (
    auth: LendAuth,
    /** The market to redeem from. Must have been entered that market. */
    market: Address,
    /** The amount to redeem. */
    redeem_amount: Uint256,
    block?: number
  ): Promise<AccountLiquidity> {
    return this.query({
      account_liquidity: {
        block:  block ?? await this.agent!.height,
        method: await auth.createMethod<OverseerPermissions>(this.address!, 'account_info'),
        market,
        redeem_amount,
        borrow_amount: '0'
      }
    })
  }

  async getOracleContract(): Promise<ContractLink> {
    return this.query({oracle_contract: {}})
  }

  /** The hypothetical liquidity after a borrow operation from a market. */
  async getLiquidityAfterBorrow (
    auth: LendAuth,
    /** The market to borrow from. Must have been entered that market. */
    market: Address,
    /** The amount to borrow. */
    borrow_amount: Uint256,
    block?: number
  ): Promise<AccountLiquidity> {
    return this.query({
      account_liquidity: {
        block:  block ?? await this.agent!.height,
        method: await auth.createMethod<OverseerPermissions>(this.address!, 'account_info'),
        market,
        redeem_amount: '0',
        borrow_amount
      }
    })
  }

  /** The hypothetical amount that will be seized from a liquidation. */
  async getSeizeAmount (
    /** The market that is being liquidated. */
    borrowed: Address,
    /** The slToken collateral to be seized. */
    collateral: Address,
    /** The liquidation amount. */
    repay_amount: Uint256
  ): Promise<Uint256> {
    return this.query({ seize_amount: { borrowed, collateral, repay_amount } })
  }

  async config (): Promise<OverseerConfig> {
    return this.query({ config: {} })
  }
}
