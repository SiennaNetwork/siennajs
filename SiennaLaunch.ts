import { Client, Agent, Address, Uint128, Moment, Duration, Fee, randomHex, ContractLink, IContractLink } from "@fadroma/client"
import { ViewingKeyClient } from '@fadroma/client-scrt'
import { Coin, Snip20 } from '@fadroma/tokens'
import { getTokenType, TypeOfToken, CustomToken, TokenType } from '../amm/token'
import { SmartContract, Querier } from '../contract'
import { ViewingKeyExecutor } from '../executors/viewing_key_executor'
import { ViewingKey } from '../core'
import { getTokenType, TypeOfToken, CustomToken, TokenType } from '../amm/token'

export class Launchpad extends Client {

  /** This method will perform the native token lock.
   *  NOTE: For any other token, use snip20 receiver interface */
  async lockNative (amount: Uint128, denom = "uscrt",) {
    return this.execute({ lock: { amount } }, undefined, [new Coin(amount, denom)])
  }

  async lock(amount: Uint128, token_address?: Address) {
    token_address = await this.verifyTokenAddress(token_address)
    if (!token_address) {
      const msg = { lock: { amount } }
      return await this.execute(msg, "280000", [new Coin(amount, 'uscrt')])
    }
    return this.agent.getClient(Snip20, { address: token_address })
      .withFees({ exec: this.fee || new Fee('350000', 'uscrt') })
      .send(this.address, amount, { lock: {} })
  }

  /** This method will perform the native token unlock
    * NOTE: For any other token, use snip20 receiver interface */
  async unlockNative (entries: string | number | bigint, agent?: Agent) {
    return this.execute({ unlock: { entries } })
  }

  async unlock (entries: number, token_address?: Address) {
    token_address = await this.verifyTokenAddress(token_address)
    const msg = { unlock: { entries } }
    if (!token_address) {
      return await this.execute(msg, "280000")
    }
    return this.agent.getClient(Snip20, { address: token_address })
      .withFees({ exec: this.fee || new Fee('400000', 'uscrt') })
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

  vk = new ViewingKeyClient(this, this.agent)

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
  async addToken (config: TokenSettings) {
    return await this.execute({ admin_add_token: { config } }, '3000000')
  }
  /** This action will remove the token from the contract
    * and will refund all locked balances on that token back to users */
  async removeToken (index: number) {
    return await this.execute({ admin_remove_token: { index } }, '3000000')
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
  preLock (amount: Amount) {
    return this.execute({ amount }, undefined, [{ amount: `${amount}`, denom: "uscrt" }])
  }

  /** This method will perform the native token swap.
    *
    * IMPORTANT: if custom buy token is set, you have to use the SNIP20
    * receiver callback interface to initiate swap. */
  async swap (amount: Uint128, recipient?: Address) {
    const info = await this.getSaleInfo()
    if (getTokenType(info.input_token) == TypeOfToken.Native) {
      return this.execute({ swap: { amount, recipient } }, '280000', [ new Coin(amount, 'uscrt') ])
    }
    const token_addr = (info.input_token as CustomToken).custom_token.contract_addr
    return this.agent
      .getClient(Snip20, { address: token_addr })
      .withFees({ exec: this.fee || new Fee('350000', 'uscrt') })
      .send(this.address, amount, { swap: { recipient } })
  }

  async activate (sale_amount: Uint128, end_time: Moment, start_time?: Moment) {
    const info = await this.getSaleInfo()
    return this.agent
      .getClient(Snip20, { address: info.sold_token.address })
      .withFees({ exec: this.fee || new Fee('300000', 'uscrt') })
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
    const { eligibility }: { eligibility: IDOEligibilityInfo } =
      await this.query({ eligibility_info: { address } });
    return eligibility
  }

  admin = new IDOAdmin(this.agent, this)

}

export class IDOAdmin extends Client {
  /** After the sale ends, admin can use this method to
    * refund all tokens that weren't sold in the IDO sale */
  async refund (recipient?: Address) {
    return this.execute({ admin_refund: { address: recipient } }, '300000')
  }

  /** After the sale ends, admin will use this method to
    * claim all the profits accumulated during the sale */
  async claim (recipient?: Address) {
    return this.execute({ admin_claim: { address: recipient } }, '300000')
  }

  /** Add addresses on whitelist for IDO contract */
  async addAddresses (addresses: Address[]) {
    return this.execute({ admin_add_addresses: { addresses } }, '300000')
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
    readonly sold_token: IContractLink,
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
  sold_token:     IContractLink
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
