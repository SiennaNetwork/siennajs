import { Client, Fee, Address, Decimal256, Uint128, Uint256, ContractLink } from '@fadroma/client'
import { Permit, Signer, ViewingKey, ViewingKeyClient } from '@fadroma/scrt'
import { Snip20, TokenInfo } from '@fadroma/tokens'
import { Pagination, PaginatedResponse } from './Pagination'

export type LendAuthStrategy =
  | { type: 'permit', signer: Signer }
  | { type: 'vk', viewing_key: { address: Address, key: ViewingKey } }

export type LendAuthMethod<T> =
  | { permit: Permit<T>; }
  | { viewing_key: { address: Address, key: ViewingKey } }

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

export interface LendMarketBorrower {
  id: string,
  /** Borrow balance at the last interaction of the borrower. */
  principal_balance: Uint256,
  /** Current borrow balance. */
  actual_balance: Uint256,

  liquidity: LendAccountLiquidity,

  markets: LendMarket[]
}

export interface LendSimulatedLiquidation {
  /** The amount that would be seized by that liquidation minus protocol fees. */
  seize_amount: Uint256,
  /** If the liquidation would be unsuccessful this will contain amount by which the seize amount falls flat. Otherwise, it's 0. */
  shortfall: Uint256
}

export interface LendOverseerMarket {
  contract:  ContractLink,
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

export type LendMarketPermissions = 'account_info' | 'balance' | 'id'

export type LendOverseerPermissions = 'account_info'

export class LendAuth {

  private constructor (private readonly strategy: LendAuthStrategy) { }

  static vk (address: Address, key: ViewingKey): LendAuth {
    return new this({ type: 'vk', viewing_key: { address, key } })
  }

  static permit (signer: Signer): LendAuth {
    return new this({ type: 'permit', signer })
  }

  async createMethod <T> (address: Address, permission: T): Promise<LendAuthMethod<T>> {
    if (this.strategy.type === 'permit') {
      const permit = await this.strategy.signer.sign({
        permit_name: `SiennaJS permit for ${address}`,
        allowed_tokens: [ address ],
        permissions: [ permission ]
      })
      return { permit }
    } else {
      return { viewing_key: this.strategy.viewing_key }
    }
  }

}

export class LendMarket extends Client {

  fees = {
    accrue_interest:   new Fee( '40000', 'uscrt'),
    borrow:            new Fee( '80000', 'uscrt'),
    deposit:           new Fee( '60000', 'uscrt'),
    liquidate:         new Fee('130000', 'uscrt'),
    redeem_token:      new Fee( '60000', 'uscrt'),
    redeem_underlying: new Fee( '60000', 'uscrt'),
    repay:             new Fee( '90000', 'usrct'),
    transfer:          new Fee( '80000', 'uscrt'),
  }

  vk = new ViewingKeyClient(this.agent, this)

  /** Convert and burn the specified amount of slToken to the underlying asset
    * based on the current exchange rate and transfer them to the user. */
  async redeemFromSL (burn_amount: Uint256) {
    return await this.execute({ redeem_token: { burn_amount } })
  }

  /** Burn slToken amount of tokens equivalent to the specified amount
    * based on the current exchange rate and transfer the specified amount
    * of the underyling asset to the user. */
  async redeemFromUnderlying (receive_amount: Uint256) {
    return this.execute({ redeem_underlying: { receive_amount } })
  }

  async borrow (amount: Uint256) {
    return await this.execute({ borrow: { amount } })
  }

  async transfer (amount: Uint256, recipient: Address) {
    return await this.execute({ transfer: { amount, recipient } })
  }

  /** This function is automatically called before every transaction to update to
    * the latest state of the market but can also be called manually through here. */
  async accrueInterest () {
    return this.execute({ accrue_interest: {} })
  }

  async deposit (amount: Uint256, underlying_asset?: Address) {
    const address = underlying_asset || (await this.getUnderlyingAsset()).address
    return this.agent.getClient(Snip20, address)
      .withFee(this.getFee('deposit'))
      .send(amount, this.address, 'deposit')
  }

  async repay (
    amount: Uint256,
    /** Optionally specify a borrower ID to repay someone else's debt. */
    borrower?: string,
    underlying_asset?: Address
  ) {
    const address = underlying_asset || (await this.getUnderlyingAsset()).address
    return this.agent.getClient(Snip20, address)
      .withFee(this.getFee('repay'))
      .send(amount, this.address, { repay: { borrower } })
  }

  /** Try to liquidate an existing borrower in this market. */
  async liquidate (
    /** @param amount - the amount to liquidate by. */
    amount: Uint256,
    /** @param borrower - the ID corresponding to the borrower to liquidate. */
    borrower: string,
    /** @param collateral - the collateral market address to receive a premium on. */
    collateral: Address,
    /** @param underlying_asset - The address of the underlying token for this market. Omitting it will result in an extra query. */
    underlying_asset?: Address
  ) {
    const address = underlying_asset || (await this.getUnderlyingAsset()).address
    return this.agent.getClient(Snip20, address)
      .withFee(this.getFee('liquidate'))
      .send(amount, this.address, { liquidate: { borrower, collateral } })
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
  async simulateLiquidation (
    /** @param borrower - the ID corresponding to the borrower to liquidate. */
    borrower: string,
    /** @param collateral - the collateral market address to receive a premium on. */
    collateral: Address,
    /** @param amount - the amount to liquidate by. */
    amount: Uint256,
    block?: number
  ): Promise<LendSimulatedLiquidation> {
    block = block || await this.agent.height
    return this.query({ block, borrower, collateral, amount })
  }

  async getTokenInfo (): Promise<TokenInfo> {
    return this.agent.getClient(Snip20, this.address).getTokenInfo()
  }

  async getBalance (address: Address, key: ViewingKey): Promise<Uint128> {
    return this.agent.getClient(Snip20, this.address).getBalance(address, key)
  }

  async getUnderlyingBalance (auth: LendAuth, block?: number): Promise<Uint128> {
    block = block || await this.agent.height
    const method = await auth.createMethod<LendMarketPermissions>(this.address, 'balance')
    return this.query({ balance_underlying: { block, method } })
  }

  async getState (block?: number): Promise<LendMarketState> {
    block = block || await this.agent.height
    return this.query({ state: { block } })
  }

  async getUnderlyingAsset (): Promise<ContractLink> {
    return this.query({ underlying_asset: {} })
  }

  async getBorrowRate (block?: number): Promise<Decimal256> {
    block = block || await this.agent.height
    return this.query({ borrow_rate: { block } })
  }

  async getSupplyRate (block?: number): Promise<Decimal256> {
    block = block || await this.agent.height
    return this.query({ supply_rate: { block } })
  }

  async getExchangeRate (block?: number): Promise<Decimal256> {
    block = block || await this.agent.height
    return this.query({ exchange_rate: { block } })
  }

  async getAccount (auth: LendAuth, block?: number): Promise<LendMarketAccount> {
    block = block || await this.agent.height
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
  ): Promise<PaginatedResponse<LendMarketBorrower>> {
    block = block || await this.agent.height
    return this.query({ borrowers: { block, pagination } })
  }

}

export class LendOverseer extends Client {

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
  async getMarkets (pagination: Pagination): Promise<PaginatedResponse<LendMarket>> {
    return this.query({ markets: { pagination } })
  }

  async getMarket (address: Address): Promise<LendOverseerMarket> {
    return this.query({ market: { address } })
  }

  async getEnteredMarkets (auth: LendAuth): Promise<LendOverseerMarket[]> {
    const method = await auth.createMethod<LendOverseerPermissions>(this.address, 'account_info')
    return this.query({ entered_markets: { method } })
  }

  async getCurrentLiquidity (
    auth: LendAuth,
    block?: number
  ): Promise<LendAccountLiquidity> {
    return this.query({
      account_liquidity: {
        block:  block ?? await this.agent.height,
        method: await auth.createMethod<LendOverseerPermissions>(this.address, 'account_info'),
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
        block:  block ?? await this.agent.height,
        method: await auth.createMethod<LendOverseerPermissions>(this.address, 'account_info'),
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
  ): Promise<LendAccountLiquidity> {
    return this.query({
      account_liquidity: {
        block:  block ?? await this.agent.height,
        method: await auth.createMethod<LendOverseerPermissions>(this.address, 'account_info'),
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

  async config (): Promise<LendOverseerConfig> {
    return this.query({ config: {} })
  }
}

export class LendOracle extends Client {}

export class MockOracle extends Client {}

export class LendInterestModel extends Client { }
