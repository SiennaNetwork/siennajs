import { Client, Agent, randomHex } from "@fadroma/client"
import { Coin } from "@fadroma/tokens"

// @ts-ignore
const decoder = new TextDecoder();
const decode = (buffer: any) => decoder.decode(buffer).trim();

export class LaunchpadClient extends Client {

  /**
   * This action will remove the token from the contract
   * and will refund all locked balances on that token back to users
   *
   * @param {number} amount
   * @param {Agent} [agent]
   * @returns
   */
  async adminRemoveToken(index: number, agent?: Agent) {
    return this.execute({admin_remove_token: { index }});
  }

  /**
   * This method will perform the native token lock.
   *
   * NOTE: For any other token, use snip20 receiver interface
   *
   * @param {string|number|bigint} amount
   * @param {string} [denom]
   * @param {Agent} [agent]
   * @returns
   */
  async lock(
    amount: string | number | bigint,
    denom: string = "uscrt",
    agent?: Agent
  ) {
    return this.tx.lock({ amount: `${amount}` }, agent, undefined, [
      { amount: `${amount}`, denom },
    ]);
  }

  /**
   * This method will perform the native token unlock
   *
   * NOTE: For any other token, use snip20 receiver interface
   *
   * @param {string|number|bigint} entries
   * @param {Agent} [agent]
   * @returns
   */
  async unlock(entries: string | number | bigint, agent?: Agent) {
    return this.tx.unlock({ entries }, agent);
  }

  /**
   * Get the configuration information about the Launchpad contract
   *
   * @returns Promise<Array<{
   *  "token_type": { "native_token": { "denom": "uscrt" } },
   *  "segment": "25000000000",
   *  "bounding_period": 604800,
   *  "active": true,
   *  "token_decimals": 6,
   *  "locked_balance": "100000000000"
   * }>>
   */
  async info() {
    return this.q.launchpad_info();
  }

  /**
   * Get the balance and entry information for a user
   *
   * @param {string} address
   * @param {string} key
   * @returns Promise<Array<{
   *  "token_type": { "native_token": { "denom": "uscrt" } },
   *  "balance": "100000000000",
   *  "entries": [
   *    "1629402109",
   *    "1629402109",
   *    "1629402109",
   *    "1629402109",
   *  ],
   *  "last_draw": null,
   * }>>
   */
  async userInfo(address: string, key: string) {
    return this.q.user_info({
      address,
      key,
    });
  }

  /**
   * Do a test draw of the addresses
   *
   * @param {number} number
   * @param {string[]} tokens
   * @returns Promise<{
   *  "drawn_addresses": [
   *    "secret1h9we43xcfyljvadjj6wfw6444t8kty4kmajdhl",
   *    "secret1tld98vmz8gq0j738cwvu2feccfwl8wz3tnuu9e",
   *    "secret1avs82agh6g46xna6qklmjnnaj7yq3974ur8qpe",
   *    "secret1udwpspt6czruhrhadtchsjzgznrq8yq9emu6m4"
   *  ]
   * }>
   */
  async draw(number: number, tokens: string[]) {
    return this.q.draw({
      number,
      tokens,
      // @ts-ignore
      timestamp: parseInt(new Date().valueOf() / 1000),
    });
  }

  /**
   * Create viewing key for the agent
   *
   * @param {Agent} agent
   * @param {string} entropy
   * @returns
   */
  createViewingKey = (agent: Agent, entropy = randomHex(32)) =>
    this.tx
      .create_viewing_key({ entropy, padding: null }, agent)
      .then((tx) => ({
        tx,
        key: JSON.parse(decode(tx.data)).create_viewing_key.key,
      }));

  /**
   * Set viewing key for the agent
   *
   * @param {Agent} agent
   * @param {string} key
   * @returns
   */
  setViewingKey = (agent: Agent, key: string) =>
    this.tx.set_viewing_key({ key }, agent).then((tx) => ({
      tx,
      status: JSON.parse(decode(tx.data)).set_viewing_key.key,
    }));
}


import { Address, Uint128 } from '../core'
import { get_token_type, TypeOfToken, CustomToken, TokenType } from '../amm/token'
import { SmartContract, Querier } from '../contract'
import { ViewingKeyExecutor } from '../executors/viewing_key_executor'
import { Snip20Contract } from '../snip20'

import { SigningCosmWasmClient, ExecuteResult } from 'secretjs'

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

export class LaunchpadContract extends SmartContract<LaunchpadExecutor, LaunchpadQuerier> {
  exec(fee?: Fee, memo?: string): LaunchpadExecutor {
    return new LaunchpadExecutor(
      this.address,
      () => this.query.apply(this),
      this.execute_client,
      fee,
      memo
    )
  }
  
  query(): LaunchpadQuerier {
    return new LaunchpadQuerier(this.address, this.query_client)
  }
}

export class LaunchpadExecutor extends ViewingKeyExecutor {
  tokens?: TokenType[];

  constructor(
    address: Address,
    private querier: () => LaunchpadQuerier,
    client?: SigningCosmWasmClient,
    fee?: Fee,
    memo?: string,
  ) {
    super(address, client, fee, memo)
  }

  private async verify_token_address(address?: Address): Promise<Address | undefined> {
    if (this.tokens === undefined) {
      this.tokens = (await this.querier().info()).map(token => token.token_type);
    }

    for (const token of this.tokens) {
      if (get_token_type(token) == TypeOfToken.Native && !address) {
        return undefined;
      }

      if (
        get_token_type(token) == TypeOfToken.Custom &&
        (token as CustomToken).custom_token.contract_addr === address) {
        return address;
      }
    }

    throw new Error(`Unsupported token address provided for locking`);
  }

  async lock(amount: Uint128, token_address?: Address): Promise<ExecuteResult> {
    token_address = await this.verify_token_address(token_address);

    if (!token_address) {
      const msg = {
        lock: {
          amount
        }
      }

      return await this.run(msg, "280000", [new Coin(amount, 'uscrt')])
    }

    const msg = {
      lock: {}
    }

    const fee = this.fee || new Fee('350000', 'uscrt')
    const snip20 = new Snip20Contract(token_address, this.client)
    return snip20.exec(fee, this.memo).send(this.address, amount, msg)
  }

  async unlock(entries: number, token_address?: Address): Promise<ExecuteResult> {
    token_address = await this.verify_token_address(token_address);

    const msg = { unlock: { entries } }

    if (!token_address) {
      return await this.run(msg, "280000")
    }

    const fee = this.fee || new Fee('400000', 'uscrt')
    const snip20 = new Snip20Contract(token_address, this.client)
    return snip20.exec(fee, this.memo).send(this.address, '0', msg)
  }

  async admin_add_token(config: TokenSettings) {
    const msg = {
      admin_add_token: {
        config,
      },
    }

    return await this.run(
      msg,
      "3000000"
    )
  }

  async admin_remove_token(index: number, fee?: Fee) {
    const msg = {
      admin_remove_token: {
        index,
      },
    }

    return await this.run(
      msg,
      "3000000"
    )
  }
}

export class LaunchpadQuerier extends Querier {
  async info(): Promise<QueryTokenConfig[]> {
    const msg = "launchpad_info" as unknown as object

    const result = await this.run(msg) as LaunchpadInfoResponse

    return result.launchpad_info
  }

  async user_info(address: Address, key: string): Promise<QueryAccountToken[]> {
    const msg = {
      user_info: {
        address,
        key
      },
    }

    const result = await this.run(msg) as UserInfoResponse

    return result.user_info
  }

  async draw(number: number, tokens: MaybeTokenAddress[]): Promise<Address[]> {
    const msg = {
      draw: {
        tokens,
        number,
        timestamp: parseInt(`${new Date().valueOf() / 1000}`),
      },
    }

    const result = await this.run(msg) as DrawnAddressesResponse

    return result.drawn_addresses
  }
}

interface LaunchpadInfoResponse {
  launchpad_info: QueryTokenConfig[]
}

interface UserInfoResponse {
  user_info: QueryAccountToken[],
}

interface DrawnAddressesResponse {
  drawn_addresses: Address[]
}

import { Client, Address, Uint128, Moment, Fee } from '@fadroma/client'
import { Snip20 } from '@fadroma/tokens'

import { ContractInfo, ViewingKey } from '../core'
import { get_token_type, TypeOfToken, CustomToken, TokenType } from '../amm/token'
import { SmartContract, Querier } from '../contract'

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
    if (get_token_type(info.input_token) == TypeOfToken.Native) {
      return this.execute({ swap: { amount, recipient } }, '280000', [ new Coin(amount, 'uscrt') ])
    }
    const token_addr = (info.input_token as CustomToken).custom_token.contract_addr;
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
    readonly sold_token: ContractInfo,
    /** The addresses that are eligible to participate in the sale. */
    readonly whitelist: Address[],
    /** Sale type settings */
    readonly sale_type: IDOSaleType | null
  ) {}
}

export interface IDOSaleInfo {
  /** The token that is used to buy the sold SNIP20. */
  input_token:    TokenType;
  /** The token that is being sold. */
  sold_token:     ContractInfo;
  /** The minimum amount that each participant is allowed to buy. */
  min_allocation: Uint128;
  /** The total amount that each participant is allowed to buy. */
  max_allocation: Uint128;
  /** The maximum number of participants allowed. */
  max_seats:      number;
  /** Number of participants currently. */
  taken_seats:    number;
  /** The conversion rate at which the token is sold. */
  rate:           Uint128;
  /** Sale start time. */
  start?:         number | null;
  /** Sale end time. */
  end?:           number | null;
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
