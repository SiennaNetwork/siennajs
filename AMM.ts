import type {
  Class,
  Agent, Address, CodeHash, ContractInfo, ContractLink, ContractMetadata, ExecOpts,
  Token, TokenSymbol, CustomToken, TokenAmount, Decimal, Uint128
} from './Core'
import {
  Client, Fee, Snip20, VersionedSubsystem,
  TokenPair, TokenPairAmount, 
  bold, getTokenId, isCustomToken, isNativeToken, randomBase64
} from './Core'
import type * as Rewards from './Rewards'
import { Names } from './Names';
import type { SiennaDeployment } from "./index";
import { SiennaConsole } from "./index";

/** Supported versions of the AMM subsystem. */
export type Version = 'v1'|'v2'

/** The AMM subsystem client. */
class AMMDeployment extends VersionedSubsystem<Version> {

  log = new SiennaConsole(`AMM ${this.version}`)

  constructor (context: SiennaDeployment, version: Version) {
    super(context, version)
    context.attach(this, `amm ${version}`, `Sienna Swap AMM ${version}`)
  }

  /** The AMM factory is the hub of Sienna Swap.
    * It keeps track of all exchange pair contracts,
    * and allows anyone to create new ones. */
  factory = this.contract({ name: Names.Factory(this.version), client: Factory[this.version] })
    .get()
  /** All exchanges stored in the deployment. */
  exchanges: Promise<Exchange[]> = this.contract({ client: Exchange })
    .getMany(Names.isExchange(this.version))
  /** All exchanges known to the factory.
    * This is a list fetched from an external source. */
  async getAllExchanges (): Promise<Record<PairName, Exchange>> {
    return this.task('get all exchanges from AMM', async () =>
      (await this.factory).getAllExchanges())
  }
  /** Each AMM exchange emits its Liquidity Provision token
    * to users who provide liquidity. Later, reward pools are
    * spawned for select LP tokens. */
  lpTokens = this.contract({ client: LPToken })
    .getMany(Names.isLPToken(this.version))
  /** TODO: all LP tokens known to the factory. */
  async getAllLPTokens (): Promise<never> {
    return this.task('get all LP tokens from amm', () => { throw new Error('TODO') })
  }
  /** The AMM router bounces transactions across multiple exchange
    * pools within the scode of a a single transaction, allowing
    * multi-hop swaps for tokens between which no direct pairing exists. */
  router = this.contract({ name: Names.Router(this.version), client: Router })
    .get()

  async showStatus () {
    await this.showFactoryStatus()
    await this.showExchangesStatus()
  }
  /** Display the status of the factory. */
  async showFactoryStatus () {
    const factory = await this.factory
    this.log.factoryStatus(factory.address!)
  }
  /** Display the status of the exchanges. */
  async showExchangesStatus () {
    const factory = await this.factory
    const exchanges = await factory.listExchangesFull()
    if (!(exchanges.length > 0)) return this.log.noExchanges()
    const column1 = 15
    for (const exchange of exchanges) {
      if (!exchange) continue
      this.log.exchangeHeader(exchange, column1)
      this.log.exchangeDetail(exchange, column1, ...await Promise.all([
        (exchange.token_0 instanceof Snip20) ? exchange.token_0?.getTokenInfo() : {},
        (exchange.token_1 instanceof Snip20) ? exchange.token_1?.getTokenInfo() : {},
        exchange.lpToken?.getTokenInfo(),
      ]))
    }
  }

  /** Create a new exchange through the factory. */
  async createExchange (name: PairName) {
    this.log.creatingExchange(name)
    const factory = await this.factory
    const { token_0, token_1 } = await this.context.tokens.pair(name)
    await factory.createExchange(token_0, token_1)
    this.log.createdExchange(name)
    return { name, token_0, token_1 }
  }
  /** Create multiple exchanges through the factory. */
  async createExchanges (names: PairName[]) {
    this.log.creatingExchanges(names)
    const result = this.agent!.bundle().wrap(async bundle => {
      const factory = (await this.factory).as(bundle)
      for (const name of names) {
        const { token_0, token_1 } = await this.context.tokens.pair(name)
        await factory.createExchange(token_0, token_1)
      }
    })
    this.log.createdExchanges(names.length)
    return result
  }

}

export { AMMDeployment as Deployment }

/** Format: SYMBOL0-SYMBOL1 */
export type PairName = string;

/// # Factory /////////////////////////////////////////////////////////////////////////////////////
export abstract class Factory extends Client {

  abstract readonly version: Version

  static "v1": typeof Factory_v1

  static "v2": typeof Factory_v2

  constructor (...args: ConstructorParameters<typeof Client>) {
    super(...args)
    setImmediate(()=>this.log.name = `AMM Factory ${this.version}`)
  }

  /** Pause or terminate the factory. */
  async setStatus(level: FactoryStatus, new_address?: Address, reason = "") {
    const set_status = { level, new_address, reason };
    return await this.execute({ set_status });
  }

  /** Create a liquidity pool, i.e. an instance of the Exchange contract */
  async createExchange(token_0: Token, token_1: Token) {
    const pair = { token_0, token_1 };
    const entropy = randomBase64();
    const message = { create_exchange: { pair, entropy } };
    const result = await this.execute(message);
    return result;
  }

  /** Create multiple exchanges with one transaction. */
  async createExchanges({ pairs }: CreateExchangesRequest): Promise<CreateExchangesResults> {
    // TODO: check for existing pairs and remove them from input
    // warn if passed zero pairs
    if (pairs.length === 0) {
      this.log.warn("Creating 0 exchanges.");
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
    const newPairs: CreateExchangesResults = [];
    await this.agent!.bundle().wrap(async (bundle) => {
      for (const [token_0, token_1] of tokenPairs) {
        const exchange = await this.as(bundle).createExchange(token_0, token_1);
        newPairs.push({ token_0, token_1 });
      }
    });
    return newPairs;
  }

  async getAllExchanges (): Promise<Record<PairName, Exchange>> {
    const exchanges = await this.listExchangesFull()
    const result: Record<PairName, Exchange> = {}
    const pairNames = await Promise.all(exchanges.map(exchange=>exchange.pairName))
    this.log.info('All exchanges:', pairNames.map(x=>bold(x)).join(', '))
    await Promise.all(exchanges.map(async exchange=>result[await exchange.pairName] = exchange))
    return result
  }

  /** Get multiple Exchange instances corresponding to
   * the passed token pairs. */
  async getExchanges(pairs: [Token, Token][]): Promise<Exchange[]> {
    return await Promise.all(
      pairs.map(([token_0, token_1]) => this.getExchange(token_0, token_1))
    );
  }

  /** Get an Exchange instance corresponding to
   * the exchange contract between two tokens. */
  async getExchange(token_0: Token, token_1: Token): Promise<Exchange> {
    const msg = { get_exchange_address: { pair: { token_0, token_1 } } };
    const result = await this.query(msg);
    const {
      get_exchange_address: { address },
    } = <{ get_exchange_address: { address: Address } }>result;
    return await Exchange.fromAddressAndTokens(
      this.agent!,
      address,
      token_0,
      token_1
    );
  }

  async getExchangeForPair(pair: TokenPair): Promise<Exchange|null> {
    const msg = { get_exchange_address: { pair } };
    const result: any = await this.query(msg);
    if (!result?.get_exchange_address?.address) return null
    return await Exchange.fromAddressAndTokens(
      this.agent!,
      result.get_exchange_address.address,
      pair.token_0,
      pair.token_1
    );
  }

  /** Get the full list of raw exchange info from the factory. */
  async listExchanges(limit = 30): Promise<FactoryExchangeInfo[]> {
    const result = [];
    let start = 0;
    while (true) {
      const msg = { list_exchanges: { pagination: { start, limit } } };
      const response: {
        list_exchanges: { exchanges: FactoryExchangeInfo[] };
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

  async listExchangesFull(): Promise<Exchange[]> {
    const exchanges = await this.listExchanges();
    return Promise.all(
      exchanges.map((info) => {
        const {
          pair: { token_0, token_1 },
        } = info;
        // @ts-ignore
        const address = info.address || info.contract.address;
        return Exchange.fromAddressAndTokens(
          this.agent!,
          address,
          token_0,
          token_1
        );
      })
    );
  }

  /** Return the collection of contract templates
   * (`{ id, code_hash }` structs) that the factory
   * uses to instantiate contracts. */
  async getTemplates(): Promise<FactoryInventory> {
    const { config } = await this.query({ get_config: {} }) as { config: FactoryInventory };
    return {
      snip20_contract: config.snip20_contract,
      pair_contract: config.pair_contract,
      lp_token_contract: config.lp_token_contract,
      ido_contract: config.ido_contract,
      launchpad_contract: config.launchpad_contract,
    };
  }

}

export class Factory_v1 extends Factory {
  readonly version: Version = "v1";
}

export class Factory_v2 extends Factory {
  readonly version: Version = "v2" as Version;
}

Factory.v1 = Factory_v1;

Factory.v2 = Factory_v2;

export type FactoryStatus = "Operational" | "Paused" | "Migrating";

/** The templates from which the factory instantiates contracts. */
export interface FactoryInventory {
  pair_contract:       ContractInfo
  lp_token_contract:   ContractInfo
  // unused, required by v1:
  snip20_contract?:    ContractInfo
  ido_contract?:       ContractInfo
  launchpad_contract?: ContractInfo
  // maybe needed?
  router_contract?:    ContractInfo
}

export interface FactoryExchangeInfo {
  address: string,
  pair: {
    token_0: Token,
    token_1: Token
  }
}

export interface CreateExchangeRequest {
  name?: string, pair: { token_0: Snip20|Token, token_1: Snip20|Token }
}
export interface CreateExchangesRequest {
  pairs: Array<CreateExchangeRequest>;
}
export interface CreateExchangesResult  {
  name?: string, token_0: Snip20|Token, token_1: Snip20|Token
}
export type CreateExchangesResults = Array<CreateExchangesResult>

/// # Exchange (liquidity pool) and LP token (liqidity provider token) /////////////////////////////

export interface ExchangeClass extends Class<Exchange, [
  Agent?, Address?, CodeHash?, ContractMetadata?, Partial<ExchangeOpts>?
]> {}

export interface ExchangeOpts {
  token_0:  Token,
  token_1:  Token,
  lpToken:  LPToken,
  pairInfo: PairInfo
}

/** An exchange is an interaction between 4 contracts. */
export interface ExchangeInfo {
  /** Shorthand to refer to the whole group. */
  name?: string;
  /** One token of the pair. */
  token_0: Snip20 | string;
  /** The other token of the pair. */
  token_1: Snip20 | string;
  /** The automated market maker/liquidity pool for the token pair. */
  exchange: Exchange;
  /** The liquidity provision token, which is minted to stakers of the 2 tokens. */
  lpToken: LPToken;
  /** The bare-bones data needed to retrieve the above. */
  raw: any;
  /** Response from PairInfo query */
  pairInfo?: PairInfo;
}

export interface PairInfo {
  amount_0: Uint128;
  amount_1: Uint128;
  factory: ContractLink;
  liquidity_token: ContractLink;
  pair: TokenPair;
  total_liquidity: Uint128;
  contract_version: number;
}

export type Exchanges = Record<PairName, Exchange>

export class Exchange extends Client {

  static fromAddress = async function getExchangeByAddress (
    agent:   Agent,
    address: Address
  ): Promise<Exchange> {
    const Self: ExchangeClass = Exchange as unknown as ExchangeClass
    const self: Exchange      = new Self(agent, address)
    await self.populate()
    return self
  }

  /** Get the exchange and its related contracts by querying the factory. */
  static fromAddressAndTokens = async function getExchangeInfo (
    agent:   Agent,
    address: Address,
    token_0: Snip20 | Token,
    token_1: Snip20 | Token
  ): Promise<Exchange> {
    const self = await Exchange.fromAddress(agent, address);
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
    metadata?: ContractMetadata,
    options:   Partial<ExchangeOpts> = {}
  ) {
    super(agent, address, codeHash, metadata)
    if (options.token_0)  this.token_0 = options.token_0
    if (options.token_1)  this.token_1 = options.token_1
    if (options.lpToken)  this.lpToken = options.lpToken
    if (options.pairInfo) this.pairInfo = options.pairInfo
  }

  fees = {
    add_liquidity: new Fee("100000", "uscrt"),
    remove_liquidity: new Fee("110000", "uscrt"),
    swap_native: new Fee("55000", "uscrt"),
    swap_snip20: new Fee("100000", "uscrt"),
  };

  name?: PairName

  get pairName (): Promise<PairName> {
    const self = this
    return new Promise(async (resolve)=>{
      if (self.name) return resolve(self.name)
      const agent = self.assertAgent()
      const { pair, liquidity_token } = await self.getPairInfo()
      const symbol_0 = isNativeToken(pair.token_0) ? 'SCRT' :
        (await agent.getClient(
          Snip20,
          pair.token_0.custom_token!.contract_addr,
          pair.token_0.custom_token!.token_code_hash
        ).getTokenInfo()).symbol
      const symbol_1 = isNativeToken(pair.token_1) ? 'SCRT' :
        (await agent.getClient(
          Snip20,
          pair.token_1.custom_token!.contract_addr,
          pair.token_1.custom_token!.token_code_hash
        ).getTokenInfo()).symbol
      return resolve(self.name = `${symbol_0}-${symbol_1}`)
    })
  }

  token_0?:  Token
  token_1?:  Token
  lpToken?:  LPToken
  pairInfo?: PairInfo

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
      console.warn('Exchange#swap: specify recipient')
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

  async getPairInfo (): Promise<PairInfo> {
    const { pair_info } = await this.query("pair_info") as { pair_info: PairInfo }
    return pair_info
  }

  async simulateSwap (amount: TokenAmount): Promise<SimulationForward> {
    return this.query({ swap_simulation: { offer: amount } })
  }

  async simulateSwapReverse (ask_asset: TokenAmount): Promise<SimulationReverse> {
    return this.query({ reverse_simulation: { ask_asset } })
  }

  get asRouterPair (): RouterPair {
    if (this.token_0 === null) {
      throw new Error(
        "Exchange: cannot convert to RouterPair if token_0 is null"
      );
    }
    if (this.token_1 === null) {
      throw new Error(
        "Exchange: cannot convert to RouterPair if token_1 is null"
      );
    }
    if (!this.address) {
      throw new Error('Exchange: cannot convert to RouterPair if address is missing')
    }
    if (!this.codeHash) {
      throw new Error('Exchange: cannot convert to RouterPair if codeHash is missing')
    }
    return new RouterPair(
      this.token_0!,
      this.token_1!,
      this.address,
      this.codeHash
    );
  }

}

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

export type Simulation = { spread_amount: Uint128; commission_amount: Uint128; }
export type SimulationForward = Simulation & { return_amount: Uint128; }
export type SimulationReverse = Simulation & { offer_amount: Uint128; }

/// # ROUTER //////////////////////////////////////////////////////////////////////////////////////
interface Route {
  indices: number[],
  from_tokens: Token[]
}

class RouterError {
  static E00 = () =>
    new Error("Router#assemble: no token pairs provided");
  static E01 = () =>
    new Error("Router#assemble: can't swap token with itself");
  static E02 = () =>
    new Error("Router#assemble: could not find route for given pair");
  static E03 = () =>
    new Error("Router#assemble: a pair for the provided tokens already exists");
}

export class Router extends Client {
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
      const token = this.agent!.getClient(Snip20, address)
      await token.populate()
      return token.asDescriptor
    }))
  }

  assemble(
    known_pairs: RouterPair[],
    from_token: Token,
    into_token: Token
  ): RouterHop[] {
    const map_route = (route: Route): RouterHop[] => {
      const result: RouterHop[] = []

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
          throw RouterError.E03()
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

    throw RouterError.E02()
  }

  private buildRoute(
    known_pairs: RouterPair[],
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

  async swap(route: RouterHop[], amount: Uint128) {}
}

/** Represents a single step of the exchange */
export class RouterPair {

  constructor(
    readonly from_token:     Token,
    readonly into_token:     Token,
    readonly pair_address:   Address,
    readonly pair_code_hash: string
  ) { }

  get from_token_id (): string { return getTokenId(this.from_token) }

  get into_token_id (): string { return getTokenId(this.into_token) }

  eq (other: RouterPair): boolean {
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

  intersection (other: RouterPair): Token[] {
    const result: Token[] = []

    if (this.contains(other.from_token)) {
      result.push(other.from_token)
    }

    if (this.contains(other.into_token)) {
      result.push(other.into_token)
    }

    return result
  }
  
  asHop (): RouterHop {
    const { from_token, pair_address, pair_code_hash } = this
    return { from_token, pair_address, pair_code_hash }
  }

  /** Return a new RouterPair with the order of the two tokens swapped. */
  reverse (): RouterPair {
    const { from_token, into_token, pair_address, pair_code_hash } = this
    return new RouterPair(into_token, from_token, pair_address, pair_code_hash);
  }

}

/** The result of the routing algorithm is an array of `RouterHop` objects.
  *
  * Those represent a swap that the router should perform,
  * and are passed to the router contract's `Receive` method.
  *
  * The important constraint is that the native token, SCRT,
  * can only be in the beginning or end of the route, because
  * it is not a SNIP20 token and does not support the `Send`
  * callbacks that the router depends on for its operation. */
export interface RouterHop {
  from_token:     Token
  pair_address:   Address,
  pair_code_hash: CodeHash
}
