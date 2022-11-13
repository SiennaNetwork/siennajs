import { Client, Fee, TokenAmount, TokenPair, TokenPairAmount } from './Core'
import type {
  Class, Agent, Address, CodeHash, Contract, ContractLink, Uint128, Snip20, Token,
  Decimal, ExecOpts,
} from './Core'
import { LPToken } from './AMMLPToken'

/** Format: SYMBOL0-SYMBOL1 */
export type PairName = string;

export interface ExchangeClass extends Class<Exchange, [
  Agent?, Address?, CodeHash?, Contract<Exchange>?, Partial<ExchangeOpts>?
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
    metadata?: Contract<Exchange>,
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
      const agent = assertAgent(self)
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

export type Simulation = { spread_amount: Uint128; commission_amount: Uint128; }
export type SimulationForward = Simulation & { return_amount: Uint128; }
export type SimulationReverse = Simulation & { offer_amount: Uint128; }
