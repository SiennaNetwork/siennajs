import { Client, Address, Uint256, Decimal256 } from '@fadroma/client'

export type OverseerPermissions = 'account_info'

export class LendOverseer extends Client {

  async enter (markets: Address[]) {
    return this.execute({ enter: { markets } }, '40000')
  }

  async exit (market_address: Address) {
    return this.execute({ exit: { market_address } }, '50000')
  }

  /** Max limit per page is `30`. */
  async getMarkets (pagination: Pagination): Promise<PaginatedResponse<Market>> {
    return this.query({ markets: { pagination } })
  }

  async getMarket (address: Address): Promise<LendOverseerMarket> {
    return this.query({ market: { address } })
  }

  async getEnteredMarkets (auth: LendAuth): Promise<LendOverseerMarket[]> {
    const method = await auth.create_method<OverseerPermissions>(this.address, 'account_info')
    return this.query({ entered_markets: { method } })
  }

  async getCurrentLiquidity (
    auth: LendAuth,
    block?: number
  ): Promise<LendAccountLiquidity> {
    return this.query({
      account_liquidity: {
        block:  block ?? (await this.client.getBlock()).header.height,
        method: await auth.create_method<OverseerPermissions>(this.address, 'account_info'),
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
  ): Promise<LendAccountLiquidity> {
    return this.query({
      account_liquidity: {
        block:  block ?? (await this.client.getBlock()).header.height,
        method: await auth.create_method<OverseerPermissions>(this.address, 'account_info'),
        market,
        redeem_amount,
        borrow_amount: '0'
      }
    })
  }

  /** The hypothetical liquidity after a borrow operation from a market. */
  async getLiquidityAfterBorrow (
    auth: LendAuth,
    /** The market to borrow from. Must have been entered that market. */
    market: Address,
    /** The amount to borrow. */
    borrow_amount: Uint256,
    block?: number
  ): Promise<LendAccountLiquidity> {
    return this.query({
      account_liquidity: {
        block:  block ?? (await this.client.getBlock()).header.height,
        method: await auth.create_method<OverseerPermissions>(this.address, 'account_info'),
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

  async config(): Promise<LendOverseerConfig> {
    return this.query({ config: {} })
  }
}

export interface LendOverseerMarket {
  contract:  ContractInfo,
  /** The symbol of the underlying asset. Note that this is the same as the symbol
    * that the oracle expects, not what the actual token has in its storage. */
  symbol:    string,
  /** The decimals that the market has. Corresponds to the decimals of the underlying token. */
  decimals:  number,
  /** The percentage rate at which tokens can be borrowed given the size of the collateral. */
  ltv_ratio: Decimal256
}

/** One of the fields will always be 0, depending on the state of the account.*/
export interface LendAccountLiquidity {
  /** The USD value borrowable by the user, before it reaches liquidation. */
  liquidity: Uint256,
  /** If > 0 the account is currently below the collateral requirement and is subject to liquidation. */
  shortfall: Uint256
}

export interface LendOverseerConfig {
  /** The discount on collateral that a liquidator receives. */
  premium:      Decimal256,
  /** The percentage of a liquidatable account's borrow that can be repaid in a single liquidate transaction.
    * If a user has multiple borrowed assets, the close factor applies to any single borrowed asset,
    * not the aggregated value of a user’s outstanding borrowing. */
  close_factor: Decimal256
}
