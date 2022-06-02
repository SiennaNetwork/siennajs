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
  Token,
  TokenKind,
  getTokenKind,
} from '@fadroma/tokens'

export class Launchpad extends Client {

  fees = {
    lock_snip20:   new Fee('350000', 'uscrt'),
    lock_native:   new Fee('280000', 'uscrt'),
    unlock_native: new Fee('280000', 'uscrt'),
    unlock_snip20: new Fee('350000', 'uscrt'),
  }

  async lock <R> (amount: Uint128, tokenAddress?: Address): Promise<R> {
    tokenAddress = await this.verifyTokenAddress(tokenAddress)
    if (!tokenAddress) {
      const msg = { lock: { amount } }
      const opt = { fee: this.getFee('lock_native'), send: [new Coin(amount, 'uscrt')] }
      return await this.execute(msg, opt)
    }
    return await this.agent.getClient(Snip20, tokenAddress)
      .withFee(this.getFee('lock_snip20'))
      .send(amount, this.address, { lock: {} })
  }

  async unlock <R> (entries: number, tokenAddress?: Address): Promise<R> {
    tokenAddress = await this.verifyTokenAddress(tokenAddress)
    const msg = { unlock: { entries } }
    if (!tokenAddress) {
      const opt = { fee: this.getFee('unlock_native') }
      return await this.execute(msg, opt)
    }
    return await this.agent.getClient(Snip20, tokenAddress)
      .withFee(this.getFee('unlock_snip20'))
      .send('0', this.address, msg)
  }

  /** Get the configuration information about the Launchpad contract */
  async getInfo (): Promise<LaunchpadTokenInfo[]> {
    const result: { launchpad_info: LaunchpadTokenInfo[] } = await this.query("launchpad_info")
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

  tokens: Token[] = []

  async verifyTokenAddress (address?: Address): Promise<Address | undefined> {
    if (this.tokens === undefined) {
      const info = await this.getInfo()
      this.tokens = info.map(token => token.token_type)
    }
    for (const token of this.tokens) {
      if (getTokenKind(token) == TokenKind.Native && !address) {
        return undefined
      }
      if (
        getTokenKind(token) == TokenKind.Custom &&
        (token as CustomToken).custom_token.contract_addr === address
      ) {
        return address
      }
    }
    throw new Error(`Unsupported token address provided for locking`)
  }
}

export class LaunchpadAdmin extends Client {

  fees = {
    admin_add_token:    new Fee('3000000', 'uscrt'),
    admin_remove_token: new Fee('3000000', 'uscrt')
  }

  async addToken <R> (config: TokenSettings): Promise<R> {
    return await this.execute({ admin_add_token: { config } })
  }

  /** This action will remove the token from the contract
    * and will refund all locked balances on that token back to users */
  async removeToken <R> (index: number): Promise<R> {
    return await this.execute({ admin_remove_token: { index } })
  }

}

export interface LaunchpadTokenInfo {
  token_type:      Token,
  segment:         Uint128,
  bounding_period: number,
  token_decimals:  number,
  locked_balance:  Uint128,
}

export interface LaunchpadUserInfo {
  token_type: Token
  balance:    Uint128
  entries:    Moment[]
  last_draw:  unknown
}

export interface LaunchpadDraw {
  drawn_addresses: Address[]
}

export type MaybeTokenAddress = Address | null

export interface TokenSettings {
  token_type: Token,
  segment: Uint128,
  bounding_period: number,
}

export interface QueryTokenConfig {
  token_type: Token,
  segment: Uint128,
  bounding_period: number,
  token_decimals: number,
  locked_balance: Uint128,
}

export interface QueryAccountToken {
  token_type: Token,
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
    if (getTokenKind(info.input_token) == TokenKind.Native) {
      const msg = { swap: { amount, recipient } }
      const opt = { fee: new Fee('280000', 'uscrt'), send: [ new Coin(amount, 'uscrt') ] }
      return this.execute(msg, opt)
    }
    return this.agent
      .getClient(Snip20, (info.input_token as CustomToken).custom_token.contract_addr)
      .withFee(new Fee('350000', 'uscrt'))
      .send(amount, this.address, { swap: { recipient } })
  }

  async activate (sale_amount: Uint128, end_time: Moment, start_time?: Moment) {
    const info = await this.getSaleInfo()
    return this.agent
      .getClient(Snip20, info.sold_token.address)
      .withFee(new Fee('300000', 'uscrt'))
      .send(sale_amount, this.address, { activate: { end_time, start_time } })
  }

  /** Check the amount user has pre locked and the amount user has swapped */
  async getBalance (key: ViewingKey, address: Address|undefined = this.agent.address) {
    if (!address) {
      throw new Error('IDO#getBalance: specify address')
    }
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
  async getEligibility (address: Address|undefined = this.agent.address) {
    if (!address) {
      throw new Error('IDO#getEligibility: specify address')
    }
    const { eligibility }: { eligibility: IDOEligibility } =
      await this.query({ eligibility_info: { address } });
    return eligibility
  }

  admin = new IDOAdmin(this.agent, this)

}

export class IDOAdmin extends Client {

  fees = {
    admin_refund:        new Fee('300000', 'uscrt'),
    admin_claim:         new Fee('300000', 'uscrt'),
    admin_add_addresses: new Fee('300000', 'uscrt')
  }

  /** After the sale ends, admin can use this method to
    * refund all tokens that weren't sold in the IDO sale */
  async refund <R> (recipient?: Address): Promise<R> {
    return await this.execute({ admin_refund: { address: recipient } })
  }

  /** After the sale ends, admin will use this method to
    * claim all the profits accumulated during the sale */
  async claim <R> (recipient?: Address): Promise<R> {
    return await this.execute({ admin_claim: { address: recipient } })
  }

  /** Add addresses on whitelist for IDO contract */
  async addAddresses <R> (addresses: Address[]): Promise<R> {
    return await this.execute({ admin_add_addresses: { addresses } })
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
    readonly input_token: Token,
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
  input_token:    Token
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
