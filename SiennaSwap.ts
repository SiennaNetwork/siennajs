import * as Scrt   from '@fadroma/scrt'
import * as Tokens from '@fadroma/tokens'
import { Console } from '@hackbg/konzola'
const console = Console('Sienna Swap')

import { create_entropy } from './Core'

export type AMMVersion = "v1"|"v2"

export default class AMMDeployment extends Scrt.VersionedDeployment<AMMVersion> {
  names = {
    factory: `AMM[${this.version}].Factory`,
    router:  `AMM[${this.version}].Router`,
  }

  factory = this.client(AMMFactory[this.version])
    .called(this.names.factory)
    .expect(`AMM Factory ${this.version} not found.`)

  router = this.client(AMMRouter)
    .called(this.names.router)
    .expect(`AMM Router for AMM ${this.version} not found.`)

  filters = {
    isExchange: (name: string) => name.startsWith(`AMM[${this.version}]`) && !name.endsWith(`.LP`),
    isLPToken:  (name: string) => name.startsWith(`AMM[${this.version}]`) &&  name.endsWith(`.LP`)
  }

  exchanges = this.clients(AMMExchange as any)
    .select(this.filters.isExchange)

  lpTokens = this.clients(LPToken)
    .select(this.filters.isLPToken)

  /** Create a new exchange through the factory. */
  async createExchange (name: string, factory?: AMMFactory) {
    factory ??= await this.factory
    const [ token_0, token_1 ] = await this.parsePair(name)
    await (await this.factory).createExchange(token_0, token_1)
    return { name, token_0, token_1 }
  }

  async parsePair (name: string) {
    let { token_0, token_1 } = Tokens.TokenPair.fromName(this.context.tokenRegistry.tokens, name)
    if (token_0 instanceof Tokens.Snip20) token_0 = { custom_token: token_0.custom_token }
    if (token_1 instanceof Tokens.Snip20) token_1 = { custom_token: token_1.custom_token }
    return [token_0, token_1]
  }

}

export type AMMFactoryStatus = "Operational" | "Paused" | "Migrating"

export interface IContractTemplate {
  id:        number,
  code_hash: Scrt.CodeHash,
}

export abstract class AMMFactory extends Scrt.Client {

  abstract readonly version: AMMVersion

  static "v1": typeof AMMFactory_v1

  static "v2": typeof AMMFactory_v2

  /** Pause or terminate the factory. */
  async setStatus (level: AMMFactoryStatus, new_address?: Scrt.Address, reason = "") {
    const set_status = { level, new_address, reason }
    return await this.execute({ set_status })
  }

  /** Create a liquidity pool, i.e. an instance of the AMMExchange contract */
  async createExchange (
    token_0: Tokens.Token,
    token_1: Tokens.Token
  ) {
    const pair    = { token_0, token_1 }
    const entropy = create_entropy()
    const message = { create_exchange: { pair, entropy } }
    const result  = await this.execute(message)
    return result
  }

  /** Create multiple exchanges with one transaction. */
  async createExchanges (
    { pairs }: AMMCreateExchangesRequest
  ): Promise<AMMCreateExchangesResults> {
    // TODO: check for existing pairs and remove them from input
    // warn if passed zero pairs
    if (pairs.length === 0) {
      console.warn('Creating 0 exchanges.')
      return []
    }
    // conform pairs
    const tokenPairs: [Tokens.Token, Tokens.Token][] = pairs.map(({ pair: { token_0, token_1 } })=>{
      if (token_0 instanceof Tokens.Snip20) token_0 = token_0.asDescriptor
      if (token_1 instanceof Tokens.Snip20) token_1 = token_1.asDescriptor
      return [token_0, token_1]
    })
    const newPairs: AMMCreateExchangesResults = []
    await this.agent!.bundle().wrap(async bundle=>{
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
    token_0: Tokens.Token,
    token_1: Tokens.Token
  ): Promise<AMMExchange> {
    const msg = { get_exchange_address: { pair: { token_0, token_1 } } }
    const result = await this.query(msg)
    const {get_exchange_address:{address}} = <{get_exchange_address:{address: Scrt.Address}}>result
    return await AMMExchange.fromAddressAndTokens(this.agent!, address, token_0, token_1)
  }

  /** Get multiple AMMExchange instances corresponding to
    * the passed token pairs. */
  async getExchanges (
    pairs: [Tokens.Token, Tokens.Token][]
  ): Promise<AMMExchange[]> {
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

  async listExchangesFull (): Promise<AMMExchange[]> {
    const exchanges = await this.listExchanges()
    return Promise.all(
      exchanges.map((info) => {
        const { pair: { token_0, token_1 } } = info
        // @ts-ignore
        const address = info.address || info.contract.address
        return AMMExchange.fromAddressAndTokens(
          this.agent!, address, token_0, token_1
        )
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

export class AMMFactory_v1 extends AMMFactory { readonly version = "v1" as AMMVersion }

export class AMMFactory_v2 extends AMMFactory { readonly version = "v2" as AMMVersion }

AMMFactory.v1 = AMMFactory_v1

AMMFactory.v2 = AMMFactory_v2

export interface AMMFactoryInventory {
  pair_contract:       Scrt.TemplateInfo
  lp_token_contract:   Scrt.TemplateInfo
  // unused, required by v1:
  snip20_contract?:    Scrt.TemplateInfo
  ido_contract?:       Scrt.TemplateInfo
  launchpad_contract?: Scrt.TemplateInfo
  // maybe needed?
  router_contract?:    Scrt.TemplateInfo
}

export interface AMMCreateExchangeRequest {
  name?: string,
  pair: {
    token_0: Tokens.Snip20|Tokens.Token,
    token_1: Tokens.Snip20|Tokens.Token
  }
}

export interface AMMCreateExchangesRequest {
  pairs: Array<AMMCreateExchangeRequest>
}

export interface AMMCreateExchangesResult  {
  name?:   string
  token_0: Tokens.Snip20|Tokens.Token
  token_1: Tokens.Snip20|Tokens.Token
}

export type AMMCreateExchangesResults = Array<AMMCreateExchangesResult>

export interface AMMFactoryExchangeInfo {
  address: string,
  pair: {
    token_0: Tokens.Token,
    token_1: Tokens.Token
  }
}

type TokenPairStr = string

export type AMMExchanges = Record<TokenPairStr, AMMExchange>

export class AMMExchange extends Scrt.Client {

  static fromAddress = async function getExchangeByAddress (
    agent:   Scrt.Agent,
    address: Scrt.Address
  ): Promise<AMMExchange> {
    const Self: NewAMMExchange = AMMExchange as unknown as NewAMMExchange
    const self: AMMExchange    = agent.getClient(Self, address) as unknown as AMMExchange
    await self.populate()
    return self
  }

  /** Get the exchange and its related contracts by querying the factory. */
  static fromAddressAndTokens = async function getExchangeInfo (
    agent:   Scrt.Agent,
    address: Scrt.Address,
    token_0: Tokens.Snip20|Tokens.Token,
    token_1: Tokens.Snip20|Tokens.Token,
  ): Promise<AMMExchange> {
    const self = await AMMExchange.fromAddress(agent, address)
    // <dumb>
    const snip20_0 = await Tokens.Snip20.fromDescriptor(agent, token_0 as Tokens.CustomToken).populate()
    const snip20_1 = await Tokens.Snip20.fromDescriptor(agent, token_1 as Tokens.CustomToken).populate()
    const name     = `${snip20_0.symbol}-${snip20_1.symbol}`
    const pairInfo = await self.getPairInfo()
    const { liquidity_token } = pairInfo
    const { address: lpTokenAddress, code_hash: lpTokenCodeHash } = liquidity_token
    const lpTokenOpts = { codeHash: lpTokenCodeHash, address: lpTokenAddress }
    return self
    // </dumb>
  }

  constructor (agent: Scrt.Agent, options: AMMExchangeOpts) {
    super(agent, options)
    if (options.token_0)  this.token_0 = options.token_0
    if (options.token_1)  this.token_1 = options.token_1
    if (options.lpToken)  this.lpToken = options.lpToken
    if (options.pairInfo) this.pairInfo = options.pairInfo
  }

  fees = {
    add_liquidity:    new Scrt.Fee('100000', 'uscrt'),
    remove_liquidity: new Scrt.Fee('110000', 'uscrt'),
    swap_native:      new Scrt.Fee( '55000', 'uscrt'),
    swap_snip20:      new Scrt.Fee('100000', 'uscrt'),
  }

  name?:     string
  token_0?:  Tokens.Token
  token_1?:  Tokens.Token
  lpToken?:  LPToken
  pairInfo?: AMMPairInfo

  async populate () {
    await super.populate()

    this.pairInfo = await this.getPairInfo()

    let { pair: { token_0, token_1 }, liquidity_token } = await this.getPairInfo()

    if (Tokens.isCustomToken(token_0)) token_0 = await this.agent!
      .getClient(Tokens.Snip20, token_0?.custom_token?.contract_addr)
      .populate()
    if (Tokens.isCustomToken(token_1)) token_1 = await this.agent!
      .getClient(Tokens.Snip20, token_1?.custom_token?.contract_addr)
      .populate()

    if (this.token_0 instanceof Tokens.Snip20 && this.token_1 instanceof Tokens.Snip20) {
      this.name = `${this.token_0.symbol}-${this.token_1.symbol}`
    }

    this.token_0 = token_0
    this.token_1 = token_1
    this.lpToken = this.agent!.getClient(LPToken, liquidity_token)
    return this
  }

  async addLiquidityWithAllowance (
    amount_0:            Scrt.Uint128,
    snip20_0:            Tokens.Snip20,
    amount_1:            Scrt.Uint128,
    snip20_1:            Tokens.Snip20,
    slippage_tolerance?: Scrt.Decimal
  ) {
    const pair    = new Tokens.TokenPair(snip20_0.asDescriptor, snip20_1.asDescriptor)
    const deposit = new Tokens.TokenPairAmount(pair, amount_0, amount_1)
    return await this.agent!.bundle().wrap(async bundle=>{
      await snip20_0.as(bundle).increaseAllowance(amount_0, this.address!)
      await snip20_1.as(bundle).increaseAllowance(amount_1, this.address!)
      await this.as(bundle).addLiquidity(deposit, slippage_tolerance)
    })
  }

  async addLiquidity (
    deposit:             Tokens.TokenPairAmount,
    slippage_tolerance?: Scrt.Decimal
  ) {
    const msg = { add_liquidity: { deposit, slippage_tolerance } }
    const opts: Scrt.ExecOpts = { send: deposit.asNativeBalance }
    return await this.execute(msg, opts)
  }

  async removeLiquidity (
    amount:    Scrt.Uint128,
    recipient: Scrt.Address
  ) {
    const info = await this.getPairInfo()
    return this.agent!
      .getClient(Tokens.Snip20, info.liquidity_token.address)
      .withFee(this.getFee('remove_liquidity'))
      .send(amount, this.address!, { remove_liquidity: { recipient } })
  }

  async swap (
    amount:           Tokens.TokenAmount,
    expected_return?: Scrt.Decimal,
    recipient:        Scrt.Address|undefined = this.agent?.address,
  ) {
    if (!recipient) {
      console.log('AMMExchange#swap: specify recipient')
    }
    if (Tokens.getTokenKind(amount.token) == Tokens.TokenKind.Native) {
      const msg = { swap: { offer: amount, to: recipient, expected_return } }
      const opt = { fee: this.getFee('swap_native'), send: amount.asNativeBalance }
      return this.execute(msg, opt)
    } else {
      const msg = { swap: { to: recipient, expected_return } }
      const tokenAddr = (amount.token as Tokens.CustomToken).custom_token.contract_addr
      return this.agent!
        .getClient(Tokens.Snip20, tokenAddr)
        .send(amount.amount, this.address!, msg);
    }
  }

  async getPairInfo (): Promise<AMMPairInfo> {
    const { pair_info } = await this.query("pair_info")
    return pair_info
  }

  async simulateSwap (amount: Tokens.TokenAmount): Promise<AMMSimulationForward> {
    return this.query({ swap_simulation: { offer: amount } })
  }

  async simulateSwapReverse (ask_asset: Tokens.TokenAmount): Promise<AMMSimulationReverse> {
    return this.query({ reverse_simulation: { ask_asset } })
  }

  get asRouterPair (): AMMRouterPair {
    if (this.token_0 === null) {
      throw new Error('AMMExchange: cannot convert to AMMRouterPair if token_0 is null')
    }
    if (this.token_1 === null) {
      throw new Error('AMMExchange: cannot convert to AMMRouterPair if token_1 is null')
    }
    if (!this.address) {
      throw new Error('AMMExchange: cannot convert to AMMRouterPair if address is missing')
    }
    if (!this.codeHash) {
      throw new Error('AMMExchange: cannot convert to AMMRouterPair if codeHash is missing')
    }
    return new AMMRouterPair(this.token_0!, this.token_1!, this.address, this.codeHash)
  }

}

export interface NewAMMExchange extends Scrt.NewClient<AMMExchange> {
  new (agent?: Scrt.Agent, options?: AMMExchangeOpts): AMMExchange
}

export interface AMMExchangeOpts extends Partial<Scrt.Client> {
  token_0?:  Tokens.Token,
  token_1?:  Tokens.Token,
  lpToken?:  LPToken,
  pairInfo?: AMMPairInfo
}

export interface AMMSimulation {
  spread_amount:     Scrt.Uint128,
  commission_amount: Scrt.Uint128
}

export interface AMMSimulationForward extends AMMSimulation {
  return_amount: Scrt.Uint128
}

export interface AMMSimulationReverse extends AMMSimulation {
  offer_amount:  Scrt.Uint128
}

/** An exchange is an interaction between 4 contracts. */
export interface AMMExchangeInfo {
  /** Shorthand to refer to the whole group. */
  name?:     string
  /** One token of the pair. */
  token_0:   Tokens.Snip20|string,
  /** The other token of the pair. */
  token_1:   Tokens.Snip20|string,
  /** The automated market maker/liquidity pool for the token pair. */
  exchange:  AMMExchange,
  /** The liquidity provision token, which is minted to stakers of the 2 tokens. */
  lpToken:   LPToken,
  /** The bare-bones data needed to retrieve the above. */
  raw:       any,
  /** Response from PairInfo query */
  pairInfo?: AMMPairInfo
}

export interface AMMPairInfo {
  amount_0:         Scrt.Uint128
  amount_1:         Scrt.Uint128
  factory:          Scrt.ContractLink
  liquidity_token:  Scrt.ContractLink
  pair:             Tokens.TokenPair
  total_liquidity:  Scrt.Uint128
  contract_version: number
}

export class AMMSnip20 extends Tokens.Snip20 {}

export class LPToken extends Tokens.Snip20 {
  async getPairName (): Promise<string> {
    const { name } = await this.getTokenInfo()
    const fragments = name.split(' ')
    const [t0addr, t1addr] = fragments[fragments.length-1].split('-')
    const t0 = this.agent!.getClient(Tokens.Snip20, t0addr)
    const t1 = this.agent!.getClient(Tokens.Snip20, t1addr)
    const [t0info, t1info] = await Promise.all([t0.getTokenInfo(), t1.getTokenInfo()])
    return `${t0info.symbol}-${t1info.symbol}`
  }
}

/// # ROUTER //////////////////////////////////////////////////////////////////////////////////////

export class AMMRouter extends Scrt.Client {
  static E00 = () => new Error("AMMRouter#assemble: no token pairs provided")
  static E01 = () => new Error("AMMRouter#assemble: can't swap token with itself")
  static E02 = () => new Error("AMMRouter#assemble: could not find route for given pair")
  supportedTokens: Tokens.Token[]|null = null
  /** Register one or more supported tokens to router contract. */
  async register (...tokens: (Tokens.Snip20|Tokens.Token)[]) {
    tokens = tokens.map(token=>(token instanceof Tokens.Snip20) ? token.asDescriptor : token)
    const result = await this.execute({ register_tokens: { tokens } })
    this.supportedTokens = await this.getSupportedTokens()
    return result
  }
  async populate () {
    await super.populate()
    this.supportedTokens = await this.getSupportedTokens()
    return this
  }
  async getSupportedTokens (): Promise<Tokens.Token[]> {
    const tokens = await this.query({ supported_tokens: {} }) as Scrt.Address[]
    return await Promise.all(tokens.map(async address=>{
      const token = this.agent!.getClient(AMMSnip20, address)
      await token.populate()
      return token.asDescriptor
    }))
  }
  assemble (
    known_pairs: AMMRouterPair[],
    from_token:  Tokens.Token,
    into_token:  Tokens.Token,
  ): AMMRouterHop[] {
    // Make sure there are pairs to pick from
    if ((known_pairs.length === 0 || !from_token || !into_token)) throw AMMRouter.E00()
    // Make sure we're not routing from and into the same token
    const from_token_id = Tokens.getTokenId(from_token)
    const into_token_id = Tokens.getTokenId(into_token)
    if (from_token_id === into_token_id) throw AMMRouter.E01()
    // Add reversed pairs
    const pairs = known_pairs.reduce((pairs: AMMRouterPair[], pair: AMMRouterPair)=>{
      return [...pairs, pair, pair.reverse()]
    }, [])
    // Return the shortest solved route.
    const routes = visit(from_token_id, into_token_id)
    const byLength = (a: Array<unknown>, b: Array<unknown>) => a.length - b.length
    const result = routes.sort(byLength)[0] || null
    if (result) return result
    throw AMMRouter.E02()

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
  async swap (route: AMMRouterHop[], amount: Scrt.Uint128) {}
}

/** Represents a single step of the exchange */
export class AMMRouterPair {

  constructor(
    readonly from_token:     Tokens.Token,
    readonly into_token:     Tokens.Token,
    readonly pair_address:   Scrt.Address,
    readonly pair_code_hash: string
  ) { }

  get from_token_id (): string { return Tokens.getTokenId(this.from_token) }

  get into_token_id (): string { return Tokens.getTokenId(this.into_token) }

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
  from_token:     Tokens.Token
  pair_address:   Scrt.Address,
  pair_code_hash: Scrt.CodeHash
}
