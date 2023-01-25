import {
  Client,
  ClientConsole,
  CustomToken,
  Fee,
  Coin,
  Snip20,
  Token,
  TokenAmount,
  TokenInfo,
  TokenManager,
  TokenPair,
  TokenPairAmount,
  VersionedDeployment,
  bold,
  colors,
  getTokenId,
  isCustomToken,
  isNativeToken,
  randomBase64,
} from './Core'
import type {
  Address,
  Agent, 
  CodeHash,
  Contract,
  ContractInfo,
  ContractLink,
  Decimal,
  Deployment,
  ExecOpts,
  Uint128,
} from "./Core";

import { b64encode } from '@waiting/base64'

export type AMMVersion = "v1" | "v2";

export default class SiennaSwap extends VersionedDeployment<AMMVersion> {
  names = {
    factory:   `AMM[${this.version}].Factory`,
    router:    `AMM[${this.version}].Router`,
    exchanges: (name: string) => name.startsWith(`AMM[${this.version}]`) && !name.endsWith(`.LP`),
    lpTokens:  (name: string) => name.startsWith(`AMM[${this.version}]`) &&  name.endsWith(`.LP`)
  }
  /** Collection of all tokens known to the swap. */
  tokens = new TokenManager(this as Deployment)
  /** The AMM factory. */
  factory = this.contract({ name: this.names.factory, client: AMMFactory[this.version!] }).get()
  /** The AMM exchanges. */
  exchanges = this.contracts(this.names.exchanges, AMMExchange as any)
  /** Create a new exchange through the factory. */
  async createExchange (name: string) {
    log.creatingExchange(name)
    const factory = await this.factory
    const { token_0, token_1 } = await this.tokens.pair(name)
    await factory.createExchange(token_0, token_1)
    log.createdExchange(name)
    return { name, token_0, token_1 }
  }
  /** Create multiple exchanges through the factory. */
  async createExchanges (names: string[]) {
    log.creatingExchanges(names)
    const result = this.agent!.bundle().wrap(async bundle => {
      const factory = (await this.factory).as(bundle)
      for (const name of names) {
        const { token_0, token_1 } = await this.tokens.pair(name)
        await factory.createExchange(token_0, token_1)
      }
    })
    log.createdExchanges(names.length)
    return result
  }
  /** The LP tokens. */
  lpTokens = this.contracts(this.names.lpTokens, LPToken)
  /** The AMM router. */
  router = this.contract({ name: this.names.router, client: AMMRouter }).get()

  showStatus = this.command('status', 'Display the status of this AMM', async () => {
    await this.showFactoryStatus()
    await this.showExchangesStatus()
  })
  /** Display the status of the factory. */
  async showFactoryStatus () {
    const factory = await this.factory
    log.factoryStatus(factory.address!)
  }
  /** Display the status of the exchanges. */
  async showExchangesStatus () {
    const factory = await this.factory
    console.log({factory})
    const exchanges = await factory.listExchangesFull()
    if (!(exchanges.length > 0)) return log.noExchanges()
    const column1 = 15
    for (const exchange of exchanges) {
      if (!exchange) continue
      log.exchangeHeader(exchange, column1)
      log.exchangeDetail(exchange, column1, ...await Promise.all([
        (exchange.token_0 instanceof Snip20) ? exchange.token_0?.getTokenInfo() : {},
        (exchange.token_1 instanceof Snip20) ? exchange.token_1?.getTokenInfo() : {},
        exchange.lpToken?.getTokenInfo(),
      ]))
    }
  }
}

export type AMMFactoryStatus = "Operational" | "Paused" | "Migrating";

export interface IContractTemplate {
  id: number
  code_hash: CodeHash
}

export interface AMMFactoryConfig {
  lp_token_contract: ContractInstantiationInfo
  pair_contract: ContractInstantiationInfo
  exchange_settings: ExchangeSettings
}

export interface ExchangeSettings {
  sienna_burner?: Address | undefined
  sienna_fee: ExchangeFee
  swap_fee: ExchangeFee
}

export interface ExchangeFee {
  denom: number
  nom: number
}

export interface ContractInstantiationInfo {
  id: number
  code_hash: string
}

export abstract class AMMFactory extends Client {

  abstract readonly version: AMMVersion

  static "v1": typeof AMMFactory_v1

  static "v2": typeof AMMFactory_v2

  /** Pause or terminate the factory. */
  async setStatus(level: AMMFactoryStatus, new_address?: Address, reason = "") {
    const set_status = { level, new_address, reason };
    return await this.execute({ set_status });
  }

  /** Create a liquidity pool, i.e. an instance of the AMMExchange contract */
  async createExchange(token_0: Token, token_1: Token) {
    const pair = { token_0, token_1 };
    const entropy = randomBase64();
    const message = { create_exchange: { pair, entropy } };
    const result = await this.execute(message);
    return result;
  }

  /** Create multiple exchanges with one transaction. */
  async createExchanges({
    pairs,
  }: AMMCreateExchangesRequest): Promise<AMMCreateExchangesResults> {
    // TODO: check for existing pairs and remove them from input
    // warn if passed zero pairs
    if (pairs.length === 0) {
      console.warn("Creating 0 exchanges.");
      return [];
    }
    // conform pairs
    const tokenPairs: [Token, Token][] = pairs.map(
      ({ pair: { token_0, token_1 } }) => {
        if (token_0 instanceof Snip20) token_0 = token_0.asDescriptor;
        if (token_1 instanceof Snip20) token_1 = token_1.asDescriptor;
        return [token_0, token_1];
      }
    );
    const newPairs: AMMCreateExchangesResults = [];
    await this.agent!.bundle().wrap(async (bundle) => {
      for (const [token_0, token_1] of tokenPairs) {
        const exchange = await this.as(bundle).createExchange(token_0, token_1);
        newPairs.push({ token_0, token_1 });
      }
    });
    return newPairs;
  }

  /** Get an AMMExchange instance corresponding to
   * the exchange contract between two tokens. */
  async getExchange(token_0: Token, token_1: Token): Promise<AMMExchange> {
    const msg = { get_exchange_address: { pair: { token_0, token_1 } } };
    const result = await this.query(msg);
    const {
      get_exchange_address: { address },
    } = <{ get_exchange_address: { address: Address } }>result;
    return await AMMExchange.fromAddressAndTokens(
      this.agent!,
      address,
      token_0,
      token_1
    );
  }
  async getExchangeForPair(pair: TokenPair): Promise<AMMExchange|null> {
    const msg = { get_exchange_address: { pair } };
    const result: any = await this.query(msg);
    if (!result?.get_exchange_address?.address) return null
    return await AMMExchange.fromAddressAndTokens(
      this.agent!,
      result.get_exchange_address.address,
      pair.token_0,
      pair.token_1
    );
  }

  /** Get multiple AMMExchange instances corresponding to
   * the passed token pairs. */
  async getExchanges(pairs: [Token, Token][]): Promise<AMMExchange[]> {
    return await Promise.all(
      pairs.map(([token_0, token_1]) => this.getExchange(token_0, token_1))
    );
  }

  /** Get the full list of raw exchange info from the factory. */
  async listExchanges(limit = 30): Promise<AMMFactoryExchangeInfo[]> {
    const result = [];
    let start = 0;
    while (true) {
      const msg = { list_exchanges: { pagination: { start, limit } } };
      const response: {
        list_exchanges: { exchanges: AMMFactoryExchangeInfo[] };
      } = await this.query(msg);
      const {
        list_exchanges: { exchanges: list },
      } = response;
      if (list.length > 0) {
        result.push(...list);
        start += limit;
      } else {
        break;
      }
    }
    return result;
  }

  async getExchangeSettings(): Promise<ExchangeSettings> {
    const resp: any = await this.query('get_exchange_settings')

    return resp.get_exchange_settings.settings
  }

  async getConfig(): Promise<AMMFactoryConfig> {
    const resp: any = await this.query({ get_config: { } })

    return resp.config
  }

  async listExchangesFull(): Promise<AMMExchange[]> {
    const exchanges = await this.listExchanges();

    return Promise.all(
      exchanges.map((info) => {
        return AMMExchange.fromAddressAndTokens(
          this.agent!,
          info.contract.address,
          info.pair.token_0,
          info.pair.token_1
        );
      })
    );
  }

  /** Return the collection of contract templates
   * (`{ id, code_hash }` structs) that the factory
   * uses to instantiate contracts. */
  async getTemplates(): Promise<AMMFactoryInventory> {
    const { config } = await this.query({ get_config: {} }) as { config: AMMFactoryInventory };
    return {
      snip20_contract: config.snip20_contract,
      pair_contract: config.pair_contract,
      lp_token_contract: config.lp_token_contract,
      ido_contract: config.ido_contract,
      launchpad_contract: config.launchpad_contract,
    };
  }

}

export interface AMMFactoryInventory {
  pair_contract:       ContractInfo
  lp_token_contract:   ContractInfo
  // unused, required by v1:
  snip20_contract?:    ContractInfo
  ido_contract?:       ContractInfo
  launchpad_contract?: ContractInfo
  // maybe needed?
  router_contract?:    ContractInfo
}

export interface AMMCreateExchangeRequest {
  name?: string, pair: { token_0: Snip20|Token, token_1: Snip20|Token }
}
export interface AMMCreateExchangesRequest {
  pairs: Array<AMMCreateExchangeRequest>;
}
export interface AMMCreateExchangesResult  {
  name?: string, token_0: Snip20|Token, token_1: Snip20|Token
}
export type AMMCreateExchangesResults = Array<AMMCreateExchangesResult>

export class AMMFactory_v1 extends AMMFactory {
  readonly version = "v1" as AMMVersion;
}

export class AMMFactory_v2 extends AMMFactory {
  readonly version = "v2" as AMMVersion;
}

AMMFactory.v1 = AMMFactory_v1;

AMMFactory.v2 = AMMFactory_v2;

export interface AMMFactoryExchangeInfo {
  contract: ContractLink,
  pair: {
    token_0: Token,
    token_1: Token
  }
}

type TokenPairStr = string;

export type AMMExchanges = Record<TokenPairStr, AMMExchange>;

export class AMMExchange extends Client {

  static fromAddress = async function getExchangeByAddress (
    agent:   Agent,
    address: Address
  ): Promise<AMMExchange> {
    const Self: NewAMMExchange = AMMExchange as unknown as NewAMMExchange
    const self: AMMExchange    = new Self(agent, address)
    await self.populate()
    return self
  }

  /** Get the exchange and its related contracts by querying the factory. */
  static fromAddressAndTokens = async function getExchangeInfo (
    agent:   Agent,
    address: Address,
    token_0: Snip20 | Token,
    token_1: Snip20 | Token
  ): Promise<AMMExchange> {
    const self = await AMMExchange.fromAddress(agent, address);
    // <dumb>
    const snip20_0 = await Snip20.fromDescriptor(
      agent,
      token_0 as CustomToken
    ).populate();
    const snip20_1 = await Snip20.fromDescriptor(
      agent,
      token_1 as CustomToken
    ).populate();
    const name = `${snip20_0.symbol}-${snip20_1.symbol}`;
    const pairInfo = await self.getPairInfo();
    const { liquidity_token } = pairInfo;
    const { address: lpTokenAddress, code_hash: lpTokenCodeHash } =
      liquidity_token;
    const lpTokenOpts = { codeHash: lpTokenCodeHash, address: lpTokenAddress };
    return self;
    // </dumb>
  }

  constructor (
    agent?:    Agent,
    address?:  Address,
    codeHash?: CodeHash,
    metadata?: Contract<AMMExchange>,
    options:   Partial<AMMExchangeOpts> = {}
  ) {
    super(agent, address, codeHash, metadata)
    if (options.token_0)  this.token_0 = options.token_0
    if (options.token_1)  this.token_1 = options.token_1
    if (options.lpToken)  this.lpToken = options.lpToken
    if (options.pairInfo) this.pairInfo = options.pairInfo
  }

  fees = {
    add_liquidity: new Fee("250000", "uscrt"),
    remove_liquidity: new Fee("250000", "uscrt"),
    swap_native: new Fee("100000", "uscrt"),
    swap_snip20: new Fee("220000", "uscrt")
  }

  name?:     string
  token_0?:  Token
  token_1?:  Token
  lpToken?:  LPToken
  pairInfo?: AMMPairInfo

  async populate () {
    await super.fetchCodeHash()
    this.pairInfo = await this.getPairInfo()
    let { pair: { token_0, token_1 }, liquidity_token } = await this.getPairInfo()
    if (isCustomToken(token_0)) token_0 = await this.agent!
      .getClient(Snip20, token_0?.custom_token?.contract_addr)
      .populate()
    if (isCustomToken(token_1)) token_1 = await this.agent!
      .getClient(Snip20, token_1?.custom_token?.contract_addr)
      .populate()
    if (this.token_0 instanceof Snip20 && this.token_1 instanceof Snip20) {
      this.name = `${this.token_0.symbol}-${this.token_1.symbol}`;
    }
    this.token_0 = token_0
    this.token_1 = token_1
    const { address, code_hash } = liquidity_token
    this.lpToken = this.agent!.getClient(LPToken, address, code_hash)
    return this
  }

  async addLiquidity (
    deposit:             TokenPairAmount,
    slippage_tolerance?: Decimal
  ) {
    const msg = { add_liquidity: { deposit, slippage_tolerance } }
    const opts: ExecOpts = { send: deposit.asNativeBalance }
    return await this.execute(msg, opts)
  }

  async addLiquidityWithAllowance (
    amount_0:            Uint128,
    snip20_0:            Snip20,
    amount_1:            Uint128,
    snip20_1:            Snip20,
    slippage_tolerance?: Decimal
  ) {
    const pair    = new TokenPair(snip20_0.asDescriptor, snip20_1.asDescriptor)
    const deposit = new TokenPairAmount(pair, amount_0, amount_1)
    return await this.agent!.bundle().wrap(async bundle=>{
      await snip20_0.as(bundle).increaseAllowance(amount_0, this.address!)
      await snip20_1.as(bundle).increaseAllowance(amount_1, this.address!)
      await this.as(bundle).addLiquidity(deposit, slippage_tolerance)
    })
  }

  async removeLiquidity (
    amount:    Uint128,
    recipient: Address
  ) {
    const info = await this.getPairInfo()
    return this.agent!
      .getClient(Snip20, info.liquidity_token.address)
      .withFee(this.getFee('remove_liquidity')!)
      .send(amount, this.address!, { remove_liquidity: { recipient } })
  }

  async swap(
    amount: TokenAmount,
    expected_return?: Decimal,
    recipient: Address | undefined = this.agent?.address
  ) {
    if (!recipient) {
      log.log('AMMExchange#swap: specify recipient')
    }
    if (isNativeToken(amount.token)) {
      const msg = { swap: { offer: amount, to: recipient, expected_return } }
      const opt = { fee: this.getFee('swap_native'), send: amount.asNativeBalance }
      return this.execute(msg, opt)
    } else {
      const msg = { swap: { to: recipient, expected_return } }
      const tokenAddr = (amount.token as CustomToken).custom_token.contract_addr
      return this.agent!
        .getClient(Snip20, tokenAddr)
        .withFee(this.getFee('swap_snip20')!)
        .send(amount.amount, this.address!, msg);
    }
  }

  async getPairInfo (): Promise<AMMPairInfo> {
    const { pair_info } = await this.query("pair_info") as { pair_info: AMMPairInfo }
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
      throw new Error(
        "AMMExchange: cannot convert to AMMRouterPair if token_0 is null"
      );
    }
    if (this.token_1 === null) {
      throw new Error(
        "AMMExchange: cannot convert to AMMRouterPair if token_1 is null"
      );
    }
    if (!this.address) {
      throw new Error('AMMExchange: cannot convert to AMMRouterPair if address is missing')
    }
    if (!this.codeHash) {
      throw new Error('AMMExchange: cannot convert to AMMRouterPair if codeHash is missing')
    }
    return new AMMRouterPair(
      this.token_0!,
      this.token_1!,
      this.address,
      this.codeHash
    );
  }

}

export interface NewAMMExchange {
  new (
    agent?:    Agent,
    address?:  Address,
    codeHash?: CodeHash,
    options?:  AMMExchangeOpts
  ): AMMExchange
}

export interface AMMExchangeOpts {
  token_0?:  Token,
  token_1?:  Token,
  lpToken?:  LPToken,
  pairInfo?: AMMPairInfo
}

export interface AMMSimulation {
  spread_amount:     Uint128,
  commission_amount: Uint128
}

export interface AMMSimulationForward extends AMMSimulation {
  return_amount: Uint128
}

export interface AMMSimulationReverse extends AMMSimulation {
  offer_amount:  Uint128
}

export interface AMMSimulation {
  spread_amount: Uint128;
  commission_amount: Uint128;
}

export interface AMMSimulationForward extends AMMSimulation {
  return_amount: Uint128;
}

export interface AMMSimulationReverse extends AMMSimulation {
  offer_amount: Uint128;
}

/** An exchange is an interaction between 4 contracts. */
export interface AMMExchangeInfo {
  /** Shorthand to refer to the whole group. */
  name?: string;
  /** One token of the pair. */
  token_0: Snip20 | string;
  /** The other token of the pair. */
  token_1: Snip20 | string;
  /** The automated market maker/liquidity pool for the token pair. */
  exchange: AMMExchange;
  /** The liquidity provision token, which is minted to stakers of the 2 tokens. */
  lpToken: LPToken;
  /** The bare-bones data needed to retrieve the above. */
  raw: any;
  /** Response from PairInfo query */
  pairInfo?: AMMPairInfo;
}

export interface AMMPairInfo {
  amount_0: Uint128;
  amount_1: Uint128;
  factory: ContractLink;
  liquidity_token: ContractLink;
  pair: TokenPair;
  total_liquidity: Uint128;
  contract_version: number;
}

export class AMMSnip20 extends Snip20 {}

export class LPToken extends Snip20 {
  async getPairName(): Promise<string> {
    const { name } = await this.getTokenInfo();
    const fragments = name.split(" ");
    const [t0addr, t1addr] = fragments[fragments.length - 1].split("-");
    const t0 = this.agent!.getClient(Snip20, t0addr);
    const t1 = this.agent!.getClient(Snip20, t1addr);
    const [t0info, t1info] = await Promise.all([
      t0.getTokenInfo(),
      t1.getTokenInfo(),
    ]);
    return `${t0info.symbol}-${t1info.symbol}`;
  }
}

/// # ROUTER //////////////////////////////////////////////////////////////////////////////////////
interface Route {
  indices: number[],
  from_tokens: Token[]
}

export class AMMRouter extends Client {
  static E00 = () => new Error("AMMRouter#assemble: no token pairs provided");
  static E01 = () =>
    new Error("AMMRouter#assemble: can't swap token with itself");
  static E02 = () =>
    new Error("AMMRouter#assemble: could not find route for given pair");
  static E03 = () =>
    new Error("AMMRouter#assemble: a pair for the provided tokens already exists");
  static E04 = () =>
    new Error("AMMRouter#swap: route length cannot be less than 2 hops");

  fees = {
    swap: new Fee("270000", "uscrt")
  }

  supportedTokens: Token[] | null = null;
  /** Register one or more supported tokens to router contract. */
  async register (...tokens: (Snip20|Token)[]) {
    tokens = tokens.map(token=>(token instanceof Snip20) ? token.asDescriptor : token)
    const result = await this.execute({ register_tokens: { tokens } })
    this.supportedTokens = await this.getSupportedTokens()
    return result
  }
  async populate () {
    await this.fetchCodeHash()
    this.supportedTokens = await this.getSupportedTokens()
    return this
  }
  async getSupportedTokens (): Promise<Token[]> {
    const tokens = await this.query({ supported_tokens: {} }) as Address[]
    return await Promise.all(tokens.map(async address=>{
      const token = this.agent!.getClient(AMMSnip20, address)
      await token.populate()
      return token.asDescriptor
    }))
  }

  assemble(
    known_pairs: AMMRouterPair[],
    from_token: Token,
    into_token: Token
  ): AMMRouterHop[] {
    const map_route = (route: Route): AMMRouterHop[] => {
      const result: AMMRouterHop[] = []

      for (let i = 0; i < route.indices.length; i++) {
        const pair = known_pairs[route.indices[i]]

        result.push({
          from_token: route.from_tokens[i],
          pair_address: pair.pair_address,
          pair_code_hash: pair.pair_code_hash
        })
      }

      return result
    }

    let best_route: Route | null = null

    for (let i = 0; i < known_pairs.length; i++) {
      const pair = known_pairs[i]
      if (pair.contains(from_token)) {
        if (pair.contains(into_token)) {
          throw AMMRouter.E03()
        }

        const route = this.buildRoute(known_pairs, from_token, into_token, i)

        if (!route) {
          continue
        } else if (route.indices.length == 2) {
          return map_route(route)
        } else if (!best_route ||
          best_route.indices.length > route.indices.length
        ) {
          best_route = route
        }
      }
    }

    if (best_route) {
      return map_route(best_route)
    }

    throw AMMRouter.E02()
  }

  private buildRoute(
    known_pairs: AMMRouterPair[],
    from_token: Token,
    into_token: Token,
    root: number
  ): Route | null {
    const queue: Route[] = [{
      indices: [root],
      from_tokens: [from_token]
    }]

    while (queue.length > 0) {
      const route = queue.pop() as Route
      const prev = known_pairs[route.indices[route.indices.length - 1]]

      const next_token = prev.getOtherToken(
        route.from_tokens[route.from_tokens.length - 1]
      ) as Token

      for (let i = 0; i < known_pairs.length; i++) {
        const pair = known_pairs[i]

        // The router cannot have pairs with native
        // tokens in the middle of the route.
        if (route.indices.includes(i) ||
          (!pair.contains(into_token) && pair.hasNative())) {
          continue
        }

        if (pair.contains(next_token)) {
          const next_route = {
            indices: [...route.indices, i],
            from_tokens: [...route.from_tokens, next_token]
          }

          if (pair.contains(into_token)) {
            return next_route
          } else {
            queue.unshift(next_route)
          }
        }
      }
    }

    return null
  }

  /** 
   * Will use the `swap` fee set under the `this.fees` object,
   * multiplied by the length of the route i.e `this.fees.swap`
   * should be set to a slightly higher gas cost than that of a
   * direct pair swap (when not using the router).
   * */
  async swap(
    route: AMMRouterHop[],
    amount: Uint128,
    expected_return?: Decimal,
    recipient: Address | undefined = this.agent?.address
  ) {
    if (route.length < 2) {
      throw AMMRouter.E04()
    }

    const first = route[0]
    const receive_msg = { hops: route, to: recipient, expected_return }
    
    if (isNativeToken(first.from_token)) {
      const msg = {
        receive: {
          from: this.agent?.address,
          msg: b64encode(JSON.stringify(receive_msg)),
          amount
        }
      }

      const opt = {
        send: [new Coin(amount, 'uscrt')]
      }

      return this.execute(msg, opt)
    }

    const fee = this.getFee('swap')!
    const gas = parseInt(fee.gas) * route.length

    return this.agent!
      .getClient(Snip20, first.from_token.custom_token.contract_addr)
      .withFee(new Fee(gas, 'uscrt'))
      .send(amount, this.address!, receive_msg);
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

  get from_token_id (): string { return getTokenId(this.from_token) }

  get into_token_id (): string { return getTokenId(this.into_token) }

  eq (other: AMMRouterPair): boolean {
    return this.contains(other.from_token) && this.contains(other.into_token)
  }

  hasNative(): boolean {
    return this.from_token_id === 'native' ||
      this.into_token_id === 'native'
  }

  getOtherToken(token: Token): Token | null {
    const id = getTokenId(token)

    if (this.from_token_id === id) {
      return this.into_token
    } else if (this.into_token_id === id) {
      return this.from_token
    }

    return null
  }

  contains(token: Token): boolean {
    const id = getTokenId(token)

    return this.from_token_id === id ||
      this.into_token_id === id
  }

  intersection (other: AMMRouterPair): Token[] {
    const result: Token[] = []

    if (this.contains(other.from_token)) {
      result.push(other.from_token)
    }

    if (this.contains(other.into_token)) {
      result.push(other.into_token)
    }

    return result
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
  from_token:     Token
  pair_address:   Address,
  pair_code_hash: CodeHash
}

const log = new class SiennaSwapConsole extends ClientConsole {

  name = 'Sienna Swap'

  creatingExchange = (name: string) => {}
  createdExchange  = (name: string) => {}

  creatingExchanges = (names: string[]) => {}
  createdExchanges  = (names: number)   => {}

  factoryStatus = (address: Address) => {
    this.info(`Status of AMMv2 Factory at`, bold(address??''))
    this.info()
  }

  exchangeHeader = (exchange: AMMExchange, column1: number) => {
    this.info()
    this.info(bold(exchange.name?.padEnd(column1)||''), bold(exchange.address||''))
  }

  exchangeDetail = (
    exchange:    AMMExchange,
    column1:     number,
    token0Info:  any,
    token1Info:  any,
    lpTokenInfo: any
  ) => {
    const fmtDecimal = (s: any, d: any, n: any) => {
      return bold(String(BigInt(Math.floor(n/(10**d)))).padStart(18) + '.' +
        String(n%(10**d)).padEnd(18)) + ' ' +
        bold(s)
    }
    for (const [name, {address}, {symbol, decimals, total_supply}, balance] of [
      ["Token 0",  exchange.token_0, token0Info,  exchange.pairInfo?.amount_0],
      ["Token 1",  exchange.token_1, token1Info,  exchange.pairInfo?.amount_1],
      ["LP token", exchange.lpToken, lpTokenInfo, null],
    ] as [string, Snip20, TokenInfo, any][] ) {
      this.info()
      this.info(name?.padStart(column1), bold(address||''))
      if (balance) {
        this.info("".padStart(column1), `In pool:     `, fmtDecimal(symbol, decimals, balance))
      }
      if (total_supply) {
        this.info("".padStart(column1), `Total supply:`, fmtDecimal(symbol, decimals, total_supply))
      } else {
        this.info("".padStart(column1), `Total supply:`, bold('unlimited'.padStart(23)))
      }
    }
  }

  noExchanges = () =>
    this.info('Factory returned no exchanges.')

  exchanges = (exchanges: any[]) => {
    if (!exchanges) {
      this.info('No exchanges found.')
      return
    }
    for (const exchange of exchanges) {
      const { name, address, codeHash, token_0, token_1, lpToken } =
        exchange as AMMExchange
      const codeId = '??'
      this.info(
        ' ', bold(colors.inverse(name!)).padEnd(30), // wat
        `(code id ${bold(String(codeId))})`.padEnd(34), bold(address!)
      )
      //await print.token(token_0)
      //await print.token(token_1)
      //await print.token(lpToken)
    }
  }

}
