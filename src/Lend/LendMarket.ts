import type {
  Uint128, Uint256, Address, ContractLink, Decimal256, ViewingKey, TokenInfo,
} from '../Core'
import { Pagination, PaginatedResponse } from '../Pagination'
import { Fee, Client, ViewingKeyClient, Snip20 } from '../Core'

import type {
  MarketPermissions, MarketAccount, MarketState, MarketBorrower, SimulatedLiquidation
} from './LendConfig'
import { LendAuth } from './LendAuth'

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

  async getUnderlyingBalance (auth: LendAuth, block?: number): Promise<Uint128> {
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

  async getAccount (auth: LendAuth, block?: number): Promise<MarketAccount> {
    block = block || await this.agent!.height
    const method = await auth.createMethod<MarketPermissions>(this.address!, 'account_info')
    return this.query({ account: { block, method } })
  }

  /** Will throw if the account hasn't borrowed at least once before. */
  async getAccountId (auth: LendAuth): Promise<string> {
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
