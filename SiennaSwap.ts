import {
  Address,
  Client,
  ClientCtor,
  ClientOpts,
  CodeHash,
  ContractLink,
  Decimal,
  Executor,
  ExecOpts,
  Fee,
  Uint128,
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
import { create_entropy } from './Core'

export type AMMVersion = "v1"|"v2"

export type AMMFactoryStatus = "Operational" | "Paused" | "Migrating"

export interface IContractTemplate {
  id:        number,
  code_hash: CodeHash,
}

export interface AMMFactoryInventory {
  pair_contract:       IContractTemplate
  lp_token_contract:   IContractTemplate

  // unused, required by v1:
  snip20_contract?:    IContractTemplate
  ido_contract?:       IContractTemplate
  launchpad_contract?: IContractTemplate

  // ???
  router_contract?:    IContractTemplate
}

export interface AMMCreateExchangeRequest {
  name?: string,
  pair: {
    token_0: Snip20|Token,
    token_1: Snip20|Token
  }
}

export interface AMMCreateExchangesRequest {
  pairs: Array<AMMCreateExchangeRequest>
}

export interface AMMCreateExchangesResult {
  name?:   string,
  token_0: Snip20|Token,
  token_1: Snip20|Token
}

export type AMMCreateExchangesResults = Array<AMMCreateExchangesResult>

export interface AMMFactoryExchangeInfo {
  address: string,
  pair: {
    token_0: Token,
    token_1: Token
  }
}

export interface AMMPairInfo {
  amount_0:         Uint128
  amount_1:         Uint128
  factory:          ContractLink
  liquidity_token:  ContractLink
  pair:             TokenPair
  total_liquidity:  Uint128
  contract_version: number
}

export type AMMExchangeCtor = ClientCtor<AMMExchange, AMMExchangeOpts>

export interface AMMExchangeOpts extends ClientOpts {
  token_0?: Token
  token_1?: Token
}

export interface AMMSimulation {
  spread_amount:     Uint128
  commission_amount: Uint128
}

export interface AMMSimulationForward extends AMMSimulation {
  return_amount:     Uint128
}

export interface AMMSimulationReverse {
  offer_amount:      Uint128
}

/** An exchange is an interaction between 4 contracts. */
export interface AMMExchangeInfo {
  /** Shorthand to refer to the whole group. */
  name?:    string
  /** One token of the pair. */
  TOKEN_0:  Snip20|string,
  /** The other token of the pair. */
  TOKEN_1:  Snip20|string,
  /** The automated market maker/liquidity pool for the token pair. */
  EXCHANGE: AMMExchange,
  /** The liquidity provision token, which is minted to stakers of the 2 tokens. */
  LP_TOKEN: LPToken,
  /** The bare-bones data needed to retrieve the above. */
  raw:      any,
  /** Response from PairInfo query */
  pairInfo?: AMMPairInfo
}

/** The result of the routing algorithm is an array of `AMMRouterHop` objects.
  *
  * Those represent a swap that the router should perform,
  * and are passed to the router contract's `Receive` method.
  *
  * The important constraint is that the native token, SCRT,
  * can only be in the beginning or end of the route, because
  * it is not a SNIP20 token and does not support the `Send`
  * callbacks that the router depends on for its operation. */
export interface AMMRouterHop {
  from_token:     Token
  pair_address:   Address
  pair_code_hash: string
}

export abstract class AMMFactory extends Client {

  abstract readonly version: AMMVersion

  static "v1" = class AMMFactory_v1 extends AMMFactory {
    readonly version = "v1" as AMMVersion
  }

  static "v2" = class AMMFactory_v2 extends AMMFactory {
    readonly version = "v2" as AMMVersion
  }

  /** Pause or terminate the factory. */
  async setStatus (
    level:        AMMFactoryStatus,
    new_address?: Address,
    reason:       string = ""
  ) {
    const set_status = { level, new_address, reason }
    return await this.execute({ set_status })
  }

  /** Create a liquidity pool, i.e. an instance of the AMMExchange contract */
  async createExchange (
    token_0: Token,
    token_1: Token
  ) {
    const pair    = { token_0, token_1 }
    const entropy = create_entropy()
    return await this.execute({ create_exchange: { pair, entropy } })
  }

  /** Create multiple exchanges with one transaction. */
  async createExchanges ({ pairs }: AMMCreateExchangesRequest): Promise<AMMCreateExchangesResults> {

    // TODO: check for existing pairs and remove them from input

    // warn if passed zero pairs
    if (pairs.length === 0) {
      console.warn('Creating 0 exchanges.')
      return []
    }

    // conform pairs
    const tokenPairs: [Token, Token][] = pairs.map(({ pair: { token_0, token_1 } })=>{
      if (token_0 instanceof Snip20) token_0 = token_0.asDescriptor
      if (token_1 instanceof Snip20) token_1 = token_1.asDescriptor
      return [token_0, token_1]
    })

    const newPairs: AMMCreateExchangesResults = []

    await this.agent.bundle().wrap(async bundle=>{
      for (const [token_0, token_1] of tokenPairs) {
        const exchange = await this.as(bundle).createExchange(token_0, token_1)
        newPairs.push({ token_0, token_1 })
      }
    })

    return newPairs

  }

  /** Get an AMMExchange instance corresponding to
    * the exchange contract between two tokens. */
  async getExchange (
    token_0: Token,
    token_1: Token
  ): Promise<AMMExchangeInfo> {
    const msg = { get_exchange_address: { pair: { token_0, token_1 } } }
    const result = await this.query(msg)
    const {get_exchange_address:{address}} = <{get_exchange_address:{address: Address}}>result
    return await AMMExchange.fromAddressAndTokens(this.agent, address, token_0, token_1)
  }

  /** Get multiple AMMExchange instances corresponding to
    * the passed token pairs. */
  async getExchanges (
    pairs: [Token, Token][]
  ): Promise<AMMExchangeInfo[]> {
    return await Promise.all(pairs.map(([token_0, token_1])=>this.getExchange(token_0, token_1)))
  }

  /** Get the full list of raw exchange info from the factory. */
  async listExchanges (limit = 30): Promise<AMMFactoryExchangeInfo[]> {
    const result = []
    let start = 0
    while (true) {
      const msg = { list_exchanges: { pagination: { start, limit } } }
      const response: {list_exchanges:{exchanges:AMMFactoryExchangeInfo[]}} = await this.query(msg)
      const {list_exchanges: {exchanges: list}} = response
      if (list.length > 0) {
        result.push(...list)
        start += limit
      } else {
        break
      }
    }
    return result
  }

  async listExchangesFull (): Promise<AMMExchangeInfo[]> {
    const exchanges = await this.listExchanges()
    return Promise.all(
      exchanges.map((info) => {
        const { pair: { token_0, token_1 } } = info
        // @ts-ignore
        const address = info.address || info.contract.address
        return AMMExchange.fromAddressAndTokens(this.agent, address, token_0, token_1)
      })
    )
  }

  /** Return the collection of contract templates
    * (`{ id, code_hash }` structs) that the factory
    * uses to instantiate contracts. */
  async getTemplates (): Promise<AMMFactoryInventory> {
    const { config } = await this.query({ get_config: {} })
    return {
      snip20_contract:    config.snip20_contract,
      pair_contract:      config.pair_contract,
      lp_token_contract:  config.lp_token_contract,
      ido_contract:       config.ido_contract,
      launchpad_contract: config.launchpad_contract,
    }
  }

}

export class AMMExchange extends Client {

  static fromAddress = async function getExchangeByAddress (
    agent:   Executor,
    address: Address
  ): Promise<AMMExchange> {
    const Self: AMMExchangeCtor = AMMExchange as AMMExchangeCtor
    const self: AMMExchange = agent.getClient(Self, address) as unknown as AMMExchange
    await self.populate()
    return self
  }

  /** Get the exchange and its related contracts by querying the factory. */
  static fromAddressAndTokens = async function getExchangeInfo (
    agent:   Executor,
    address: Address,
    token_0: Snip20|Token,
    token_1: Snip20|Token,
  ): Promise<AMMExchangeInfo> {
    const self = await AMMExchange.fromAddress(agent, address)

    // <dumb>
    const snip20_0 = await Snip20.fromDescriptor(agent, token_0 as CustomToken).populate()
    const snip20_1 = await Snip20.fromDescriptor(agent, token_1 as CustomToken).populate()
    const name     = `${snip20_0.symbol}-${snip20_1.symbol}`
    const pairInfo = await self.getPairInfo()
    const { liquidity_token } = pairInfo
    const { address: lpTokenAddress, code_hash: lpTokenCodeHash } = liquidity_token
    const lpTokenOpts = { codeHash: lpTokenCodeHash, address: lpTokenAddress }
    return {
      name,
      EXCHANGE: self,
      LP_TOKEN: await agent.getClient(LPToken, lpTokenOpts).populate(),
      TOKEN_0:  snip20_0,
      TOKEN_1:  snip20_1,
      raw: {
        exchange: { address },
        lp_token: { address: lpTokenAddress, code_hash: lpTokenCodeHash },
        token_0,
        token_1,
      },
      pairInfo
    }
    // </dumb>
  }

  fees = {
    add_liquidity:    new Fee('100000', 'uscrt'),
    remove_liquidity: new Fee('110000', 'uscrt'),
    swap_native:      new Fee( '55000', 'uscrt'),
    swap_snip20:      new Fee('100000', 'uscrt'),
  }

  constructor (agent: Executor, options: AMMExchangeOpts) {
    super(agent, options)
    if (options.token_0) this.token_0 = options.token_0
    if (options.token_1) this.token_1 = options.token_1
  }

  token_0: Token|null = null
  token_1: Token|null = null

  async populate () {
    await super.populate()
    const {pair} = await this.getPairInfo()
    this.token_0 = pair.token_0
    this.token_1 = pair.token_1
    return this
  }

  async addLiquidityWithAllowance (
    amount_0:            Uint128,
    snip20_0:             Snip20,
    amount_1:            Uint128,
    snip20_1:             Snip20,
    slippage_tolerance?: Decimal
  ) {
    const pair    = new TokenPair(snip20_0.asDescriptor, snip20_1.asDescriptor)
    const deposit = new TokenPairAmount(pair, amount_0, amount_1)
    return await this.agent.bundle().wrap(async bundle=>{
      await snip20_0.as(bundle).increaseAllowance(amount_0, this.address)
      await snip20_1.as(bundle).increaseAllowance(amount_1, this.address)
      await this.as(bundle).addLiquidity(deposit, slippage_tolerance)
    })
  }

  async addLiquidity (
    deposit:             TokenPairAmount,
    slippage_tolerance?: Decimal
  ) {
    const msg = { add_liquidity: { deposit, slippage_tolerance } }
    const opts: ExecOpts = { send: deposit.asNativeBalance }
    return await this.execute(msg, opts)
  }

  async removeLiquidity (amount: Uint128, recipient: Address) {
    const info = await this.getPairInfo()
    return this.agent
      .getClient(Snip20, info.liquidity_token.address)
      .withFee(this.getFee('remove_liquidity'))
      .send(amount, this.address, { remove_liquidity: { recipient } })
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
      const opt = { fee: this.getFee('swap_native'), send: amount.asNativeBalance }
      return this.execute(msg, opt)
    } else {
      const msg = { swap: { to: recipient, expected_return } }
      const tokenAddr = (amount.token as CustomToken).custom_token.contract_addr
      return this.agent.getClient(Snip20, tokenAddr).send(amount.amount, this.address, msg);
    }
  }

  async getPairInfo (): Promise<AMMPairInfo> {
    const { pair_info } = await this.query("pair_info")
    return pair_info
  }

  async simulateSwap (amount: TokenAmount): Promise<AMMSimulationForward> {
    return this.query({ swap_simulation: { offer: amount } })
  }

  async simulateSwapReverse (ask_asset: TokenAmount): Promise<AMMSimulationReverse> {
    return this.query({ reverse_simulation: { ask_asset } })
  }

  get asRouterPair (): AMMRouterPair {
    if (this.token_0 === null) {
      throw new Error('AMMExchange: cannot convert to AMMRouterPair if token_0 is null')
    }
    if (this.token_1 === null) {
      throw new Error('AMMExchange: cannot convert to AMMRouterPair if token_1 is null')
    }
    if (!this.codeHash) {
      throw new Error('AMMExchange: cannot convert to AMMRouterPair if codeHash is null')
    }
    return new AMMRouterPair(
      this.token_0,
      this.token_1,
      this.address,
      this.codeHash
    )
  }

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

export class AMMRouter extends Client {

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
    return this
  }

  async getSupportedTokens (): Promise<Token[]> {
    const tokens = await this.query({ supported_tokens: {} }) as Address[]
    return await Promise.all(tokens.map(async address=>{
      const token = this.agent.getClient(AMMSnip20, address)
      await token.populate()
      return token.asDescriptor
    }))
  }

  assemble (
    known_pairs: AMMRouterPair[],
    from_token:  Token,
    into_token:  Token,
  ): AMMRouterHop[] {
    // Make sure there are pairs to pick from
    if ((known_pairs.length === 0 || !from_token || !into_token)) {
      throw new Error("AMMRouter#assemble: no token pairs provided")
    }
    // Make sure we're not routing from and into the same token
    const from_token_id = getTokenId(from_token)
    const into_token_id = getTokenId(into_token)
    if (from_token_id === into_token_id) {
      throw new Error("AMMRouter#assemble: can't swap token with itself")
    }
    // Add reversed pairs
    const pairs = known_pairs.reduce((pairs: AMMRouterPair[], pair: AMMRouterPair)=>{
      return [...pairs, pair, pair.reverse()]
    }, [])
    // Return the shortest solved route.
    const routes = visit(from_token_id, into_token_id)
    const byLength = (a: Array<unknown>, b: Array<unknown>) => a.length - b.length
    const result = routes.sort(byLength)[0] || null
    if (result) {
      return result
    } else {
      throw new Error("AMMRouter#assemble: could not find route for given pair")
    }

    // Recursively visit all possible routes that have a matching `from_token`.
    function visit (
      token_id:        string,
      target_token_id: string,
      visited:         string[]       = [],
      past_hops:       AMMRouterHop[] = [],
      first:           boolean        = true
    ): AMMRouterHop[][] {
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

  /* TODO */
  async swap (
    route:  AMMRouterHop[],
    amount: Uint128
  ) {

  }
}

/** Represents a single step of the exchange */
export class AMMRouterPair {

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

  eq (other: AMMRouterPair): boolean {
    return this.from_token_id === other.from_token_id
        && this.into_token_id === other.into_token_id
  }

  asHop (): AMMRouterHop {
    const { from_token, pair_address, pair_code_hash } = this
    return { from_token, pair_address, pair_code_hash }
  }

  /** Return a new AMMRouterPair with the order of the two tokens swapped. */
  reverse (): AMMRouterPair {
    const { from_token, into_token, pair_address, pair_code_hash } = this
    return new AMMRouterPair(into_token, from_token, pair_address, pair_code_hash);
  }

}
