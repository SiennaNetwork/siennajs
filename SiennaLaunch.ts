import {
  Address,
  Client,
  Coin,
  Duration,
  Fee,
  ContractLink,
  Moment,
  Uint128,
} from "@fadroma/client"
import {
  ViewingKey,
  ViewingKeyClient,
} from '@fadroma/client-scrt'
import {
  CustomToken,
  Snip20,
  TokenType,
  TypeOfToken,
  getTokenType,
} from '@fadroma/tokens'

export class Launchpad extends Client {

  txFees = {
    lockNative:   new Fee('280000', 'uscrt'),
    lockSnip20:   new Fee('350000', 'uscrt'),
    unlockNative: new Fee('280000', 'uscrt'),
    unlockSnip20: new Fee('350000', 'uscrt'),
  }

  async lock <R> (amount: Uint128, token_address?: Address): Promise<R> {
    token_address = await this.verifyTokenAddress(token_address)
    if (!token_address) {
      const msg = { lock: { amount } }
      const opt = { fee: this.txFees.lockNative, send: [new Coin(amount, 'uscrt')] }
      return await this.execute(msg, opt)
    }
    return this.agent.getClient(Snip20, { address: token_address })
      .withFees({ exec: this.txFees.lockSnip20 })
      .send(this.address, amount, { lock: {} })
  }

  async unlock <R> (entries: number, token_address?: Address): Promise<R> {
    token_address = await this.verifyTokenAddress(token_address)
    const msg = { unlock: { entries } }
    if (!token_address) {
      const opt = { fee: this.txFees.unlockNative }
      return await this.execute(msg, opt)
    }
    return this.agent.getClient(Snip20, { address: token_address })
      .withFees({ exec: this.txFees.unlockSnip20 })
      .send(this.address, '0', msg)
  }

  /** Get the configuration information about the Launchpad contract */
  async getInfo (): Promise<LaunchpadInfo> {
    const result: { launchpad_info: LaunchpadInfo } = await this.query("launchpad_info")
    return result.launchpad_info
  }

  /** Get balance and entry information for a user */
  async getUserInfo (address: string, key: string): Promise<LaunchpadUserInfo> {
    const result: { user_info: LaunchpadUserInfo } = await this.query({ user_info: { address, key } })
    return result.user_info
  }

  /** Do a test draw of the addresses */
  async draw (number: number, tokens: string[]): Promise<Address[]> {
    const timestamp = Math.floor(+ new Date() / 1000)
    const { drawn_addresses }: { drawn_addresses: Address[] } =
      await this.query({ draw: { number, tokens, timestamp } })
    return drawn_addresses
  }

  vk = new ViewingKeyClient(this.agent, this)

  admin = new LaunchpadAdmin(this.agent, this)

  tokens: TokenType[] = []

  async verifyTokenAddress (address?: Address): Promise<Address | undefined> {
    if (this.tokens === undefined) {
      const info = await this.getInfo()
      this.tokens = info.map(token => token.token_type)
    }
    for (const token of this.tokens) {
      if (getTokenType(token) == TypeOfToken.Native && !address) {
        return undefined
      }
      if (
        getTokenType(token) == TypeOfToken.Custom &&
        (token as CustomToken).custom_token.contract_addr === address
      ) {
        return address
      }
    }
    throw new Error(`Unsupported token address provided for locking`)
  }
}

export class LaunchpadAdmin extends Client {

  txFees = {
    addToken:    new Fee('3000000', 'uscrt'),
    removeToken: new Fee('3000000', 'uscrt')
  }

  async addToken <R> (config: TokenSettings): Promise<R> {
    const msg = { admin_add_token: { config } }
    const opt = { fee: this.txFees.addToken }
    return await this.execute(msg, opt)
  }

  /** This action will remove the token from the contract
    * and will refund all locked balances on that token back to users */
  async removeToken <R> (index: number): Promise<R> {
    const msg = { admin_remove_token: { index } }
    const opt = { fee: this.txFees.removeToken }
    return await this.execute(msg, opt)
  }

}

export interface LaunchpadInfo {
  token_type:      TokenType
  segment:         Uint128
  bounding_period: Duration
  active:          boolean
  token_decimals:  number
  locked_balance:  Uint128
}

export interface LaunchpadUserInfo {
  token_type: TokenType
  balance:    Uint128
  entries:    Moment[]
  last_draw:  unknown
}

export interface LaunchpadDraw {
  drawn_addresses: Address[]
}

export type MaybeTokenAddress = Address | null

export interface TokenSettings {
  token_type: TokenType,
  segment: Uint128,
  bounding_period: number,
}

export interface QueryTokenConfig {
  token_type: TokenType,
  segment: Uint128,
  bounding_period: number,
  token_decimals: number,
  locked_balance: Uint128,
}

export interface QueryAccountToken {
  token_type: TokenType,
  balance: Uint128,
  entries: number[],
}

export class IDO extends Client {

  /** This method will perform the native token pre_lock.
   *
   *  IMPORTANT: if custom buy token is set, you have to use the SNIP20
   *  receiver callback interface to initiate pre_lock. */
  preLock <R> (amount: Uint128): Promise<R> {
    const msg = { amount }
    const opt = { send: [{ amount: `${amount}`, denom: "uscrt" }] }
    return this.execute(msg, opt)
  }

  /** This method will perform the native token swap.
    *
    * IMPORTANT: if custom buy token is set, you have to use the SNIP20
    * receiver callback interface to initiate swap. */
  async swap <R> (amount: Uint128, recipient?: Address): Promise<R> {
    const info = await this.getSaleInfo()
    if (getTokenType(info.input_token) == TypeOfToken.Native) {
      const msg = { swap: { amount, recipient } }
      const opt = { fee: new Fee('280000', 'uscrt'), send: [ new Coin(amount, 'uscrt') ] }
      return this.execute(msg, opt)
    }
    const token_addr = (info.input_token as CustomToken).custom_token.contract_addr
    return this.agent
      .getClient(Snip20, { address: token_addr })
      .withFees({ exec: new Fee('350000', 'uscrt') })
      .send(this.address, amount, { swap: { recipient } })
  }

  async activate (sale_amount: Uint128, end_time: Moment, start_time?: Moment) {
    const info = await this.getSaleInfo()
    return this.agent
      .getClient(Snip20, { address: info.sold_token.address })
      .withFees({ exec: new Fee('300000', 'uscrt') })
      .send(this.address, sale_amount, { activate: { end_time, start_time } })
  }

  /** Check the amount user has pre locked and the amount user has swapped */
  async getBalance (key: ViewingKey, address: Address = this.agent.address) {
    const { balance }: { balance: IDOBalance } =
      await this.query({ balance: { address, key } })
    return balance
  }

  /** Check the sale info of the IDO project */
  async getSaleInfo () {
    const { sale_info }: { sale_info: IDOSaleInfo } =
      await this.query('sale_info')
    return sale_info
  }

  /** Check the sale status of the IDO project */
  async getStatus () {
    const { status }: { status: IDOSaleStatus } =
      await this.query('sale_status')
    return status
  }

  /** Check if the address can participate in an IDO */
  async getEligibility (address: Address = this.agent.address) {
    const { eligibility }: { eligibility: IDOEligibility } =
      await this.query({ eligibility_info: { address } });
    return eligibility
  }

  admin = new IDOAdmin(this.agent, this)

}

export class IDOAdmin extends Client {

  txFees = {
    refund: new Fee('300000', 'uscrt'),
    claim:  new Fee('300000', 'uscrt'),
    add:    new Fee('300000', 'uscrt')
  }

  /** After the sale ends, admin can use this method to
    * refund all tokens that weren't sold in the IDO sale */
  async refund <R> (recipient?: Address): Promise<R> {
    const msg = { admin_refund: { address: recipient } }
    const opt = { fee: this.txFees.refund }
    return this.execute(msg, opt)
  }

  /** After the sale ends, admin will use this method to
    * claim all the profits accumulated during the sale */
  async claim <R> (recipient?: Address): Promise<R> {
    const msg = { admin_claim: { address: recipient } }
    const opt = { fee: this.txFees.claim }
    return this.execute(msg, opt)
  }

  /** Add addresses on whitelist for IDO contract */
  async addAddresses <R> (addresses: Address[]): Promise<R> {
    const msg = { admin_add_addresses: { addresses } }
    const opt = { fee: this.txFees.add }
    return this.execute(msg, opt)
  }

}

export enum IDOSaleType {
  PreLockAndSwap = "PreLockAndSwap",
  PreLockOnly    = "PreLockOnly",
  SwapOnly       = "SwapOnly",
}

export class TokenSaleConfig {
  constructor(
    /** The token that will be used to buy the SNIP20. */
    readonly input_token: TokenType,
    /** The total amount that each participant is allowed to buy. */
    readonly max_allocation: Uint128,
    /** The minimum amount that each participant is allowed to buy. */
    readonly min_allocation: Uint128,
    /** The maximum number of participants allowed. */
    readonly max_seats: number,
    /** The price for a single token. */
    readonly rate: Uint128,
    readonly sold_token: ContractLink,
    /** The addresses that are eligible to participate in the sale. */
    readonly whitelist: Address[],
    /** Sale type settings */
    readonly sale_type: IDOSaleType | null
  ) {}
}

export interface IDOSaleInfo {
  /** The token that is used to buy the sold SNIP20. */
  input_token:    TokenType
  /** The token that is being sold. */
  sold_token:     ContractLink
  /** The minimum amount that each participant is allowed to buy. */
  min_allocation: Uint128
  /** The total amount that each participant is allowed to buy. */
  max_allocation: Uint128
  /** The maximum number of participants allowed. */
  max_seats:      number
  /** Number of participants currently. */
  taken_seats:    number
  /** The conversion rate at which the token is sold. */
  rate:           Uint128
  /** Sale start time. */
  start?:         number | null
  /** Sale end time. */
  end?:           number | null
}

export interface IDOSaleStatus {
  is_active:          boolean
  available_for_sale: Uint128
  total_allocation:   Uint128
  sold_int_pre_lock?: Uint128
}

export interface IDOBalance {
  pre_lock_amount: Uint128
  total_bought:    Uint128
}

export interface IDOEligibility {
  can_participate: boolean
}
