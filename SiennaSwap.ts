import {
  Agent,
  Client,
  Address,
  Uint128,
  Decimal,
  Fee,
  ContractLink
} from '@fadroma/client'
import {
  Snip20,
  CustomToken,
  NativeToken,
  TokenPair,
  TokenPairAmount,
  TokenType,
  TokenTypeAmount,
  TypeOfToken,
  addNativeBalance,
  addNativeBalancePair,
  getTokenType,
} from '@fadroma/tokens'
import { b64encode } from "@waiting/base64"
import { create_entropy } from './Core'

export type ContractStatusLevel = "Operational" | "Paused" | "Migrating"

export abstract class AMMFactory extends Client {

  abstract readonly version: AMMVersion

  static "v1" = class AMMFactory_v1 extends AMMFactory {
    readonly version = "v1" as AMMVersion
  }

  static "v2" = class AMMFactory_v2 extends AMMFactory {
    readonly version = "v2" as AMMVersion
  }

  setStatus (
    level:        ContractStatusLevel,
    new_address?: Address,
    reason:       string = ""
  ) {
    return this.execute({
      set_status: { level, new_address, reason }
    })
  }

  /** Return the collection of contract templates
    * (`{ id, code_hash }` structs) that the factory
    * uses to instantiate contracts. */
  async getTemplates (): Promise<AMMFactoryTemplates> {
    const { config } = await this.query({ get_config: {} })
    return {
      snip20_contract:    config.snip20_contract,
      pair_contract:      config.pair_contract,
      lp_token_contract:  config.lp_token_contract,
      ido_contract:       config.ido_contract,
      launchpad_contract: config.launchpad_contract,
    }
  }

  /** Create a liquidity pool, i.e. an instance of the AMMExchange contract */
  createExchange (
    token_0: TokenType,
    token_1: TokenType
  ) {
    const msg = {
      create_exchange: {
        pair:    { token_0, token_1 },
        entropy: create_entropy()
      }
    }
    return this.execute(msg)
  }

  /** Create multiple exchanges with one transaction. */
  async createExchanges (input: CreateExchangesRequest): Promise<CreateExchangesResults> {
    const {
      templates = await this.getTemplates(),
      pairs,
    } = input
    if (pairs.length === 0) {
      console.warn('Creating 0 exchanges.')
      return []
    }
    const newPairs: CreateExchangesResults = []
    await this.agent.bundle().wrap(async bundle=>{
      // @ts-ignore
      const client = this.withAgent(bundle)
      const agent = this.agent
      // @ts-ignore
      this.agent = bundle
      for (const pair of pairs) {
        // @ts-ignore
        let token_0 = pair.pair?.token_0 || pair.raw?.token_0
        // @ts-ignore
        let token_1 = pair.pair?.token_1 || pair.raw?.token_1
        if (token_0 instanceof Snip20) token_0 = token_0.asCustomToken
        if (token_1 instanceof Snip20) token_1 = token_1.asCustomToken
        const exchange = await this.createExchange(token_0, token_1)
        // @ts-ignore
        newPairs.push(pair)
      }
      // @ts-ignore
      this.agent = agent
    })
    return newPairs
  }

  /** Get info about an exchange. */
  async getExchange (
    token_0: TokenType,
    token_1: TokenType
  ): Promise<ExchangeInfo> {
    const msg = { get_exchange_address: { pair: { token_0, token_1 } } }
    const {get_exchange_address:{address}} = await this.query(msg)
    return await AMMExchange.get(this.agent, address, token_0, token_1)
  }

  /** Get the full list of raw exchange info from the factory. */
  async listExchanges (limit = 30): Promise<FactoryExchangeInfo[]> {
    const result = []
    let start = 0
    while (true) {
      const msg = { list_exchanges: { pagination: { start, limit } } }
      const {list_exchanges: {exchanges: list}} = await this.query(msg)
      if (list.length > 0) {
        result.push(...list)
        start += limit
      } else {
        break
      }
    }
    return result
  }

  async listExchangesFull (): Promise<ExchangeInfo[]> {
    const exchanges = await this.listExchanges()
    return Promise.all(
      exchanges.map((info) => {
        const { pair: { token_0, token_1 } } = info
        // @ts-ignore
        const address = info.address || info.contract.address
        return AMMExchange.get(this.agent, address, token_0, token_1)
      })
    )
  }

  async getPairInfo(): Promise<PairInfo> {
    const { pair_info }: { pair_info: PairInfo } = await this.query('pair_info')
    return pair_info
  }

}

export interface IContractTemplate {
  id:        number,
  code_hash: string,
}

export class ContractTemplate implements IContractTemplate {
  constructor(
    readonly id:        number,
    readonly code_hash: string,
  ) {}
}

export interface AMMFactoryTemplates {
  pair_contract:       IContractTemplate
  lp_token_contract:   IContractTemplate
  snip20_contract?:    IContractTemplate
  ido_contract?:       IContractTemplate
  launchpad_contract?: IContractTemplate
  router_contract?:    IContractTemplate
}

export type AMMVersion = "v1"|"v2"

export interface CreateExchangesRequest {
  templates: AMMFactoryTemplates
  pairs: Array<{
    name?: string,
    pair: {
      token_0: Snip20|TokenType,
      token_1: Snip20|TokenType
    }
  }>
}

export interface CreateExchangesResult {
  name?:   string,
  token_0: Snip20|TokenType,
  token_1: Snip20|TokenType
}

export type CreateExchangesResults = Array<CreateExchangesResult>

export interface FactoryExchangeInfo {
  address: string,
  pair: {
    token_0: TokenType,
    token_1: TokenType
  }
}

export interface PairInfo {
  amount_0:         Uint128
  amount_1:         Uint128
  factory:          ContractLink
  liquidity_token:  ContractLink
  pair:             TokenPair
  total_liquidity:  Uint128
  contract_version: number
}

export class AMMExchange extends Client {

  static get = async function getExchange (
    agent:   Agent,
    address: string,
    token_0: Snip20|TokenType,
    token_1: Snip20|TokenType,
  ): Promise<ExchangeInfo> {
    const exchangeCodeId   = await agent.getCodeId(address)
    const exchangeCodeHash = await agent.getHash(address)
    const EXCHANGE = agent.getClient(AMMExchange, {
      codeId:   exchangeCodeId,
      codeHash: exchangeCodeHash,
      address,
    })
    const { TOKEN: TOKEN_0, NAME: TOKEN_0_NAME } = await Snip20.fromTokenSpec(agent, token_0)
    const { TOKEN: TOKEN_1, NAME: TOKEN_1_NAME } = await Snip20.fromTokenSpec(agent, token_1)
    const name = `${TOKEN_0_NAME}-${TOKEN_1_NAME}`
    const { liquidity_token: { address: lpTokenAddress, codeHash: lpTokenCodeHash } } = await EXCHANGE.getPairInfo()
    const lpTokenCodeId = await agent.getCodeId(lpTokenAddress)
    return {
      raw: { // no methods, just data
        exchange: { address },
        lp_token: { address: lpTokenAddress, code_hash: lpTokenCodeHash },
        token_0,
        token_1,
      },
      name,     // The human-friendly name of the exchange
      EXCHANGE, // The exchange contract
      LP_TOKEN: agent.getClient(LPToken, { // The LP token contract
        codeId:   lpTokenCodeId,
        codeHash: lpTokenCodeHash,
        address:  lpTokenAddress,
      }),
      TOKEN_0,  // One token of the pair
      TOKEN_1,  // The other token of the pair
    }
  }

  async addLiquidity (
    pair:     TokenPair,
    amount_0: Uint128,
    amount_1: Uint128
  ) {
    const msg = { add_liquidity: { deposit: { pair, amount_0, amount_1 } } }
    const result = await this.execute(msg)
    return result
  }

  async provideLiquidity (amount: TokenPairAmount, tolerance?: Decimal) {
    const msg = { add_liquidity: { deposit: amount, slippage_tolerance: tolerance } }
    const opt = { fee: new Fee('100000', 'uscrt'), send: addNativeBalancePair(amount) }
    return this.execute(msg, opt)
  }

  async withdrawLiquidity(amount: Uint128, recipient: Address) {
    const info = await this.getPairInfo()
    return this.agent
      .getClient(Snip20, info.liquidity_token.address)
      .withFees({ exec: new Fee('110000', 'uscrt') })
      .send(this.address, amount, { remove_liquidity: { recipient } })
  }

  async getPairInfo () {
    const { pair_info } = await this.query("pair_info")
    return pair_info
  }

  async swap (
    amount:           TokenTypeAmount,
    recipient?:       Address,
    expected_return?: Decimal,
    fee = new Fee('100000', 'uscrt')
  ) {
    if (getTokenType(amount.token) == TypeOfToken.Native) {
      const msg = { swap: { offer: amount, to: recipient, expected_return } }
      const opt = { fee: new Fee('55000', 'uscrt'), send: addNativeBalance(amount) }
      return this.execute(msg, opt)
    }
    const tokenAddr = (amount.token as CustomToken).custom_token.contract_addr;
    return this.agent.getClient(Snip20, tokenAddr)
      .withFees({ exec: fee })
      .send(this.address, amount.amount, { swap: { to: recipient, expected_return } })
  }

  async simulateSwap (amount: TokenTypeAmount): Promise<SwapSimulationResponse> {
    return this.query({ swap_simulation: { offer: amount } })
  }

  async simulateSwapReverse (ask_asset: TokenTypeAmount): Promise<ReverseSwapSimulationResponse> {
    return this.query({ reverse_simulation: { ask_asset } })
  }

}

export interface SwapSimulationResponse {
  return_amount:     Uint128
  spread_amount:     Uint128
  commission_amount: Uint128
}

export interface ReverseSwapSimulationResponse {
  offer_amount:      Uint128
  spread_amount:     Uint128
  commission_amount: Uint128
}

/** An exchange is an interaction between 4 contracts. */
export interface ExchangeInfo {
  /** Shorthand to refer to the whole group. */
  name?: string
  /** One token. */
  TOKEN_0:  Snip20|string,
  /** Another token. */
  TOKEN_1:  Snip20|string,
  /** The automated market maker/liquidity pool for the token pair. */
  EXCHANGE: AMMExchange,
  /** The liquidity provision token, which is minted to stakers of the 2 tokens. */
  LP_TOKEN: LPToken,
  /** The bare-bones data needed to retrieve the above. */
  raw:      any
}

export class AMMSnip20 extends Snip20 {}

export class LPToken extends Snip20 {

  async getPairName (): Promise<string> {
    const { name } = await this.getTokenInfo()
    const fragments = name.split(' ')
    const [t0addr, t1addr] = fragments[fragments.length-1].split('-')
    const t0 = this.agent.getClient(Snip20, t0addr)
    const t1 = this.agent.getClient(Snip20, t1addr)
    const [t0info, t1info] = await Promise.all([t0.getTokenInfo(), t1.getTokenInfo()])
    return `${t0info.symbol}-${t1info.symbol}`
  }

}

export class Router extends Client { /* TODO */ }
