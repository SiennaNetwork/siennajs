import {
  Address,
  Client,
  ContractLink,
  Decimal256,
  Fee,
  PaginatedResponse,
  Pagination,
  Permit,
  Signer,
  Snip20,
  TokenInfo,
  Uint128,
  Uint256,
  VersionedSubsystem,
  ViewingKey,
  ViewingKeyClient,
  randomBase64,
} from './Core'
import type { AuthStrategy, AuthMethod } from './Auth'
import type { SiennaDeployment } from './index'
import { SiennaConsole } from './index'

export type Version = 'v1'

export const Names = {
  InterestModel: (v: Version) => `Lend[${v}].InterestModel`,
  Overseer:      (v: Version) => `Lend[${v}].Overseer`,
  Oracle:        (v: Version) => `Lend[${v}].Oracle`,
  MockOracle:    (v: Version) => `Lend[${v}].MockOracle`
}

export class Deployment extends VersionedSubsystem<Version> {
  log = new SiennaConsole(`Lend ${this.version}`)

  constructor (context: SiennaDeployment, version: Version) {
    super(context, version)
    context.attach(this, `lend ${version}`, `Sienna Lend ${version}`)
  }

  /** The lend interest model contract. */
  interestModel =
    this.contract({ name: Names.InterestModel(this.version), client: InterestModel }).get()

  /** The lend overseer factory. */
  overseer =
    this.contract({ name: Names.Overseer(this.version), client: Overseer }).get()

  /** The known lend markets. */
  markets: Promise<Market[]> = Promise.resolve([])

  /** The lend oracle. */
  oracle?: Promise<Oracle> = undefined

  /** The lend mock oracle. */
  mockOracle?: Promise<MockOracle> = undefined

  /** The reward token for Lend. Defaults to SIENNA. */
  rewardToken: Promise<Snip20> = this.context.token('SIENNA')

  async showStatus () {
    // TODO
  }

  /** Configure the overseer whitelist. */
  async whitelist () {
    const MARKET_INITIAL_EXCHANGE_RATE = "0.2";
    const MARKET_RESERVE_FACTOR        = "1";
    const MARKET_SEIZE_FACTOR          = "0.9";
    const MARKET_LTV_RATIO             = "0.7";
    const MARKET_TOKEN_SYMBOL          = "SSCRT";
    const overseer      = await this.overseer
    const interestModel = await this.interestModel
    const underlying_asset = 
    await overseer.execute({
      whitelist: {
        config: {
          entropy:                 randomBase64(36),
          prng_seed:               randomBase64(36),
          interest_model_contract: interestModel.asLink,
          ltv_ratio:               MARKET_LTV_RATIO,
          token_symbol:            MARKET_TOKEN_SYMBOL,
          config: {
            initial_exchange_rate: MARKET_INITIAL_EXCHANGE_RATE,
            reserve_factor:        MARKET_RESERVE_FACTOR,
            seize_factor:          MARKET_SEIZE_FACTOR,
          },
          underlying_asset: {
            address:               "",
            code_hash:             "",
          },
        },
      },
    })
  }
}

export { AuthStrategy, AuthMethod }

export interface MarketState {
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
  config: MarketConfig
}

export interface MarketConfig {
  /** Initial exchange rate used when minting the first slTokens (used when totalSupply = 0) */
  initial_exchange_rate: Decimal256,
  /** Fraction of interest currently set aside for reserves */
  reserve_factor: Decimal256,
  /** Share of seized collateral that is added to reserves */
  seize_factor: Decimal256
}

export interface MarketAccount {
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
  liquidity: AccountLiquidity,
  markets: OverseerMarket[]
}

export interface SimulatedLiquidation {
  /** The amount that would be seized by that liquidation minus protocol fees. */
  seize_amount: Uint256,
  /** If the liquidation would be unsuccessful this will contain amount by which the seize amount falls flat. Otherwise, it's 0. */
  shortfall: Uint256
}

export interface OverseerMarket {
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
export interface AccountLiquidity {
  /** The USD value borrowable by the user, before it reaches liquidation. */
  liquidity: Uint256,
  /** If > 0 the account is currently below the collateral requirement and is subject to liquidation. */
  shortfall: Uint256
}

export interface OverseerConfig {
  /** The discount on collateral that a liquidator receives. */
  premium:      Decimal256,
  /** The percentage of a liquidatable account's borrow that can be repaid in a single liquidate transaction.
    * If a user has multiple borrowed assets, the close factor applies to any single borrowed asset,
    * not the aggregated value of a user’s outstanding borrowing. */
  close_factor: Decimal256
}

export type MarketPermissions = 'account_info' | 'balance' | 'id'

export type OverseerPermissions = 'account_info'

export class Auth {

  private constructor (private readonly strategy: AuthStrategy) { }

  static vk (address: Address, key: ViewingKey): Auth {
    return new this({ type: 'vk', viewing_key: { address, key } })
  }

  static permit (signer: Signer): Auth {
    return new this({ type: 'permit', signer })
  }

  async createMethod <T> (address: Address, permission: T): Promise<AuthMethod<T>> {
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

export class Market extends Client {

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

  get vk () {
    return new ViewingKeyClient(this.agent, this.address, this.codeHash)
  }

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
    return this.agent!.getClient(Snip20, address)
      .withFee(this.getFee('deposit')!)
      .send(amount, this.address!, 'deposit')
  }

  async repay (
    amount: Uint256,
    /** Optionally specify a borrower ID to repay someone else's debt. */
    borrower?: string,
    underlying_asset?: Address
  ) {
    const address = underlying_asset || (await this.getUnderlyingAsset()).address
    return this.agent!.getClient(Snip20, address)
      .withFee(this.getFee('repay')!)
      .send(amount, this.address!, { repay: { borrower } })
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
    return this.agent!.getClient(Snip20, address)
      .withFee(this.getFee('liquidate')!)
      .send(amount, this.address!, { liquidate: { borrower, collateral } })
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
  ): Promise<SimulatedLiquidation> {
    block = block || await this.agent!.height
    return this.query({ block, borrower, collateral, amount })
  }

  async getTokenInfo (): Promise<TokenInfo> {
    return this.agent!.getClient(Snip20, this.address!).getTokenInfo()
  }

  async getBalance (address: Address, key: ViewingKey): Promise<Uint128> {
    return this.agent!.getClient(Snip20, this.address!).getBalance(address, key)
  }

  async getUnderlyingBalance (auth: Auth, block?: number): Promise<Uint128> {
    block = block || await this.agent!.height
    const method = await auth.createMethod<MarketPermissions>(this.address!, 'balance')
    return this.query({ balance_underlying: { block, method } })
  }

  async getState (block?: number): Promise<MarketState> {
    block = block || await this.agent!.height
    return this.query({ state: { block } })
  }

  async getUnderlyingAsset (): Promise<ContractLink> {
    return this.query({ underlying_asset: {} })
  }

  async getBorrowRate (block?: number): Promise<Decimal256> {
    block = block || await this.agent!.height
    return this.query({ borrow_rate: { block } })
  }

  async getSupplyRate (block?: number): Promise<Decimal256> {
    block = block || await this.agent!.height
    return this.query({ supply_rate: { block } })
  }

  async getExchangeRate (block?: number): Promise<Decimal256> {
    block = block || await this.agent!.height
    return this.query({ exchange_rate: { block } })
  }

  async getAccount (auth: Auth, block?: number): Promise<MarketAccount> {
    block = block || await this.agent!.height
    const method = await auth.createMethod<MarketPermissions>(this.address!, 'account_info')
    return this.query({ account: { block, method } })
  }

  /** Will throw if the account hasn't borrowed at least once before. */
  async getAccountId (auth: Auth): Promise<string> {
    const method = await auth.createMethod<MarketPermissions>(this.address!, 'id')
    return this.query({ id: { method } })
  }

  /** Max limit is 10. */
  async getBorrowers (
    pagination: Pagination,
    block?:     number
  ): Promise<PaginatedResponse<MarketBorrower>> {
    block = block || await this.agent!.height
    return this.query({ borrowers: { block, pagination } })
  }

}

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

  async getEnteredMarkets (auth: Auth): Promise<OverseerMarket[]> {
    const method = await auth.createMethod<OverseerPermissions>(this.address!, 'account_info')
    return this.query({ entered_markets: { method } })
  }

  async getCurrentLiquidity (
    auth: Auth,
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
    auth: Auth,
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
    auth: Auth,
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

export class Oracle extends Client {}

export class MockOracle extends Client {}

export class InterestModel extends Client { }
