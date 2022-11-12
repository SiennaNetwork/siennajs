/** The AMM subsystem. */
export class AMMDeployment extends VersionedSubsystem<Version> {
  log = new SiennaConsole(`AMM ${this.version}`)
  /** The AMM factory is the hub of Sienna Swap.
    * It keeps track of all exchange pair contracts,
    * and allows anyone to create new ones. */
  factory   = this.contract<Factory>({ client: Factory[this.version] })
  /** All exchanges stored in the deployment. */
  exchanges = this.contracts({ client: Exchange, match: Names.isExchange(this.version) })
  /** Each AMM exchange emits its Liquidity Provision token
    * to users who provide liquidity. Later, reward pools are
    * spawned for select LP tokens. */
  lpTokens  = this.contracts({ client: LPToken, match: Names.isLPToken(this.version) })
  /** The AMM router bounces transactions across multiple exchange
    * pools within the scode of a a single transaction, allowing
    * multi-hop swaps for tokens between which no direct pairing exists. */
  router    = this.contract({ client: Router })

  constructor (context: SiennaDeployment, version: Version) {
    super(context, version)
    context.attach(this, `amm ${version}`, `Sienna Swap AMM ${version}`)
    this.factory.provide({ name: Names.Factory(this.version) })
    this.router.provide({ name: Names.Router(this.version) })
  }

  async showStatus () {
    await this.showFactoryStatus()
    await this.showExchangesStatus()
  }
  /** Display the status of the factory. */
  async showFactoryStatus () {
    const factory = await this.factory.deployed
    this.log.factoryStatus(factory.address!)
  }
  /** Display the status of the exchanges. */
  async showExchangesStatus () {
    const factory = await this.factory.deployed
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
  /** All exchanges known to the factory.
    * This is a list fetched from an external source. */
  async getAllExchanges (): Promise<Record<PairName, Exchange>> {
    return this.task('get all exchanges from AMM', async () =>
      (await this.factory.deployed).getAllExchanges())
  }
  /** TODO: all LP tokens known to the factory. */
  async getAllLPTokens (): Promise<never> {
    return this.task('get all LP tokens from amm', () => { throw new Error('TODO') })
  }

  /** Create a new exchange through the factory. */
  async createExchange (name: PairName) {
    this.log.creatingExchange(name)
    const factory = await this.factory.deployed
    const { token_0, token_1 } = await this.context.tokens.pair(name)
    await factory.createExchange(token_0, token_1)
    this.log.createdExchange(name)
    return { name, token_0, token_1 }
  }
  /** Create multiple exchanges through the factory. */
  async createExchanges (names: PairName[]) {
    this.log.creatingExchanges(names)
    const result = this.agent!.bundle().wrap(async bundle => {
      const factory = (await this.factory.deployed).as(bundle)
      for (const name of names) {
        const { token_0, token_1 } = await this.context.tokens.pair(name)
        await factory.createExchange(token_0, token_1)
      }
    })
    this.log.createdExchanges(names.length)
    return result
  }

}
