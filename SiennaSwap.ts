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
  TokenKind,
  Token,
  TokenPair,
  TokenAmount,
  TokenPairAmount,
  getTokenKind,
  getTokenId
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
    token_0: Token,
    token_1: Token
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
        // @ts-ignore
        if (token_0 instanceof Snip20) token_0 = token_0.asDescriptor
        // @ts-ignore
        if (token_1 instanceof Snip20) token_1 = token_1.asDescriptor
        // @ts-ignore
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
    token_0: Token,
    token_1: Token
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
      token_0: Snip20|Token,
      token_1: Snip20|Token
    }
  }>
}

export interface CreateExchangesResult {
  name?:   string,
  token_0: Snip20|Token,
  token_1: Snip20|Token
}

export type CreateExchangesResults = Array<CreateExchangesResult>

export interface FactoryExchangeInfo {
  address: string,
  pair: {
    token_0: Token,
    token_1: Token
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

  /** Get the exchange and its related contracts by querying the factory. */
  static get = async function getExchange (
    agent:   Agent,
    address: string,
    token_0: Snip20|Token,
    token_1: Snip20|Token,
  ): Promise<ExchangeInfo> {
    const EXCHANGE = agent.getClient(AMMExchange, address)
    await EXCHANGE.populate()
    const { token: TOKEN_0, name: TOKEN_0_NAME } = await Snip20.fromDescriptor(agent, token_0)
    const { token: TOKEN_1, name: TOKEN_1_NAME } = await Snip20.fromDescriptor(agent, token_1)
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

  fees = {
    add_liquidity:    new Fee('100000', 'uscrt'),
    remove_liquidity: new Fee('110000', 'uscrt'),
    swap_native:      new Fee( '55000', 'uscrt'),
    swap_snip20:      new Fee('100000', 'uscrt'),
  }

  async addLiquidity (
    pair:     TokenPair,
    amount_0: Uint128,
    amount_1: Uint128
  ) {
    return await this.execute({ add_liquidity: { deposit: { pair, amount_0, amount_1 } } })
  }

  async provideLiquidity (amount: TokenPairAmount, tolerance?: Decimal) {
    return this.execute(
      { add_liquidity: { deposit: amount, slippage_tolerance: tolerance } },
      { send: addNativeBalancePair(amount) }
    )
  }

  async withdrawLiquidity (amount: Uint128, recipient: Address) {
    const info = await this.getPairInfo()
    return this.agent
      .getClient(Snip20, info.liquidity_token.address)
      .withFee(this.getFee('remove_liquidity'))
      .send(this.address, amount, { remove_liquidity: { recipient } })
  }

  async swap (
    amount:           TokenAmount,
    expected_return?: Decimal,
    recipient:        Address|undefined = this.agent.address,
  ) {
    if (!recipient) {
      console.log('AMMExchange#swap: specify recipient')
    }
    if (getTokenKind(amount.token) == TokenKind.Native) {
      const msg = { swap: { offer: amount, to: recipient, expected_return } }
      const opt = { fee: this.getFee('swap_native'), send: addNativeBalance(amount) }
      return this.execute(msg, opt)
    }
    const tokenAddr = (amount.token as CustomToken).custom_token.contract_addr;
    return this.agent.getClient(Snip20, tokenAddr)
      .withFee(this.getFee('swap_snip20'))
      .send(this.address, amount.amount, { swap: { to: recipient, expected_return } })
  }

  async getPairInfo () {
    const { pair_info } = await this.query("pair_info")
    return pair_info
  }

  async simulateSwap (amount: TokenAmount): Promise<SwapSimulationResponse> {
    return this.query({ swap_simulation: { offer: amount } })
  }

  async simulateSwapReverse (ask_asset: TokenAmount): Promise<ReverseSwapSimulationResponse> {
    return this.query({ reverse_simulation: { ask_asset } })
  }

}

export function addNativeBalance (amount: TokenAmount): ICoin[] | undefined {
  let result: ICoin[] | undefined = []
  if (getTokenKind(amount.token) == TokenKind.Native) {
    result.push(new Coin(amount.amount, 'uscrt'))
  } else {
    result = undefined
  }
  return result
}

export function addNativeBalancePair (amount: TokenPairAmount): ICoin[] | undefined {
  let result: ICoin[] | undefined = []
  if (getTokenKind(amount.pair.token_0) == TokenKind.Native) {
    result.push(new Coin(amount.amount_0, 'uscrt'))
  } else if (getTokenKind(amount.pair.token_1) == TokenKind.Native) {
    result.push(new Coin(amount.amount_1, 'uscrt'))
  } else {
    result = undefined
  }
  return result
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

export class SwapRouter extends Client {

  supportedTokens: Token[]|null = null

  /** Register one or more supported tokens to router contract. */
  async register (...tokens: (Snip20|Token)[]) {
    tokens = tokens.map(token=>(token instanceof Snip20) ? token.asDescriptor : token)
    const result = await this.execute({ register_tokens: { tokens } })
    this.supportedTokens = await this.getSupportedTokens() 
    return result
  }

  async populate () {
    await super.populate()
    this.supportedTokens = await this.getSupportedTokens() 
  }

  async getSupportedTokens (): Promise<Token[]> {
    const tokens = await this.query({ supported_tokens: {} }) as Address[]
    return await Promise.all(tokens.map(async address=>{
      const token = this.agent.getClient(AMMSnip20, address)
      await token.populate()
      return token.asDescriptor
    }))
  }

  /* TODO */
  async exchange () {}
}

/** The result of the routing algorithm is an array of `SwapRouterHop` objects.
  *
  * Those represent a swap that the router should perform,
  * and are passed to the router contract's `Receive` method.
  *
  * The important constraint is that the native token, SCRT,
  * can only be in the beginning or end of the route, because
  * it is not a SNIP20 token and does not support the `Send`
  * callbacks that the router depends on for its operation. */
export interface SwapRouterHop {
  from_token:     Token
  pair_address:   Address
  pair_code_hash: string
}

export class SwapRoute {
  constructor (
    readonly error: string|null    = null,
    readonly hops:  SwapRouterHop[] = [],
  ) { }

  /** Create an empty route with an error message,
    * meaning that invalid data has been passed to the assemble function. */
  static error (error: string): SwapRoute {
    return new SwapRoute(error, [])
  }

  /** Create a valid route with a list of hops to be executed. */
  static valid (...hops: SwapRouterHop[]): SwapRoute {
    return new SwapRoute(null, hops)
  }

  /** Create a SwapRouterPair instance */
  static pair (
    from_token:     Token,
    into_token:     Token,
    pair_address:   Address,
    pair_code_hash: string
  ): SwapRouterPair {
    return new SwapRouterPair(
      from_token,
      into_token,
      pair_address,
      pair_code_hash
    )
  }

  /** Create a SwapRouterHop instance. */
  static hop (
    from_token: Token,
    pair:       SwapRouterPair
  ): SwapRouterHop {
    const { pair_address, pair_code_hash } = pair
    return { from_token, pair_address, pair_code_hash }
  }

  /** Get an assembled SwapRoute by calling `asHops`
    * on the result of `SwapRoute.visit`. */
  static assemble (
    known_pairs: SwapRouterPair[],
    from_token:  Token,
    into_token:  Token,
  ): SwapRoute {

    // Make sure there are pairs to pick from
    if ((known_pairs.length === 0 || !from_token || !into_token)) {
      return SwapRoute.error("No token pairs provided")
    }

    // Make sure we're not routing from and into the same token
    const from_token_id = getTokenId(from_token)
    const into_token_id = getTokenId(into_token)
    if (from_token_id === into_token_id) {
      return SwapRoute.error("Provided tokens are the same token")
    }

    // Add reversed pairs
    const pairs = known_pairs.reduce((pairs: SwapRouterPair[], pair: SwapRouterPair)=>{
      return [...pairs, pair, pair.reverse()]
    }, [])

    // Return the shortest solved route.
    const routes = visit(from_token_id, into_token_id)
    const byLength = (a, b) => a.length - b.length
    const result = routes.sort(byLength)[0] || null
    if (result) {
      return SwapRoute.valid(...result)
    } else {
      return SwapRoute.error("No possible solution for given pair")
    }

    // Recursively visit all possible routes that have a matching `from_token`.
    function visit (
      token_id:        string,
      target_token_id: string,
      visited:         string[]       = [],
      past_hops:       SwapRouterHop[] = [],
      first:           boolean        = true
    ): SwapRouterHop[] {

      const routes = []

      for (const pair of pairs) {

        // Native token cannot be in the middle of the route
        // because it's not a SNIP20 token and does not support
        // the Send callbacks required for the router to operate
        if (!first && pair.from_token_id === "native") continue

        // Parents can be any of the pairs that have a matching from_token
        if (pair.from_token_id !== token_id) continue

        // Skip pairs that we've already visited
        if (visited.includes(pair.from_token_id)) continue
        if (visited.includes(pair.into_token_id)) continue

        // Collect token ids that have already been used
        // and therefore cannot be used again
        visited.push(token_id)

        // If we've reached our destination token,
        // collect the route and continue.
        if (pair.into_token_id === target_token_id) {
          routes.push([...past_hops, pair.asHop()])
          continue
        }

        // Descend into the tree.
        visit(
          pair.into_token_id,
          target_token_id,
          visited,
          [...past_hops, pair.asHop()],
          false
        ).forEach(route=>routes.push(route))

      }

      return routes

    }

  }

  async execute () { /* TODO */ }

}

/** Represents a single step of the exchange */
export class SwapRouterPair {

  constructor(
    readonly from_token:     Token,
    readonly into_token:     Token,
    readonly pair_address:   Address,
    readonly pair_code_hash: string
  ) { }

  get from_token_id (): string {
    return getTokenId(this.from_token)
  }

  get into_token_id (): string {
    return getTokenId(this.into_token)
  }

  eq (other: SwapRouterPair): boolean {
    return this.from_token_id === other.from_token_id
        && this.into_token_id === other.into_token_id
  }

  asHop (): SwapRouterHop {
    const { from_token, pair_address, pair_code_hash } = this
    return { from_token, pair_address, pair_code_hash }
  }

  /** Return a new SwapRouterPair with the order of the two tokens swapped. */
  reverse (): SwapRouterPair {
    const { from_token, into_token, pair_address, pair_code_hash } = this
    return new SwapRouterPair(into_token, from_token, pair_address, pair_code_hash);
  }

}
