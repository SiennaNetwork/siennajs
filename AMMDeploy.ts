import { randomHex } from '@hackbg/formati'
import {
  Snip20, Names, Versions, VersionedSubsystem, randomBase64, getMaxLength, bold
} from './Core'
import type { Address, Contract, TokenSymbol } from './Core'
import type { Version, PairName } from './AMMConfig'
import { Factory } from './AMMFactory'
import { Exchange } from './AMMExchange'
import { LPToken } from './AMMLPToken'
import { Router } from './AMMRouter'
import { SiennaConsole } from './Console'

/** The AMM subsystem. */
export class AMMDeployment extends VersionedSubsystem<Version> {

  log = new SiennaConsole(`AMM ${this.version}`)

  /** Git revision corresponding to subsystem version. */
  revision = Versions.AMM[this.version]

  swapPairs: PairName[]

  swapFee:   [number, number]

  siennaFee: [number, number]

  burner:    Address|null = null

  /** The AMM factory is the hub of Sienna Swap.
    * It keeps track of all exchange pair contracts,
    * and allows anyone to create new ones. */
  factory: Contract<Factory> = this.defineContract<Factory>({
    id:       Names.Factory(this.version),
    crate:    'factory',
    revision: this.revision,
    client:   Factory[this.version],
    initMsg: async () => {
      const exchange = await this.exchanges.uploaded
      const lpToken  = await this.lpTokens.uploaded
      const config: any = {
        admin: this.agent!.address,
        prng_seed: randomBase64(64),
        pair_contract: { id: Number(exchange.codeId), code_hash: exchange.codeHash },
        lp_token_contract: { id: Number(lpToken.codeId), code_hash: lpToken.codeHash },
        exchange_settings: {
          swap_fee: { nom: this.swapFee[0], denom: this.swapFee[1] },
          sienna_fee: { nom: this.siennaFee[0], denom: this.siennaFee[1] },
          sienna_burner: this.burner,
        },
      }
      // Plug in the dummy templates for v1
      if (this.version === 'v1') {
        config.token_contract = config.launchpad_contract = config.ido_contract = {
          code_id:    "0",
          code_hash: "0000000000000000000000000000000000000000000000000000000000000000",
        }
      }
      return config
    }
  })

  /** All exchanges stored in the deployment. */
  exchanges = this.defineContract({
    client: Exchange,
    crate: 'exchange',
    revision: this.revision,
  })//.find(Names.isExchange(this.version))

  /** Each AMM exchange emits its Liquidity Provision token
    * to users who provide liquidity. Later, reward pools are
    * spawned for select LP tokens. */
  lpTokens  = this.defineContract({
    client: LPToken,
    crate: 'lp-token',
    revision: this.revision
  })//.find(Names.isExchange(this.version))

  /** The AMM router bounces transactions across multiple exchange
    * pools within the scode of a a single transaction, allowing
    * multi-hop swaps for tokens between which no direct pairing exists. */
  router    = this.defineContract({
    id:      Names.Router(this.version),
    crate:   'router',
    revision: this.revision,
    client:   Router,
    initMsg: async () => {
      const exchanges = await this.updateExchanges()
      return { register_tokens: [/*TODO?*/] }
    }
  })

  constructor (
    context: SiennaDeployment,
    options: {
      version:   Version,
      swapPairs: PairName[],
      swapFee:   [number, number],
      siennaFee: [number, number],
      burner:    Address,
    }
  ) {
    super(context, options.version)
    this.swapFee   = options.swapFee
    this.siennaFee = options.siennaFee
    this.burner    = options.burner
    this.swapPairs = options.swapPairs
    context.attachSubsystem(this, `amm ${options.version}`, `Sienna Swap AMM ${options.version}`)
    this.addCommand('deploy',  'deploy Sienna Swap',
                    this.deploy.bind(this)) 
        .addCommand('upgrade', 'upgrade Sienna Swap factory and exchanges',
                    this.upgrade.bind(this)) 
        .addCommand('update exchanges', 'update Sienna Swap exchange pairs',
                    this.updateExchanges.bind(this))
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

  get exchangedTokens (): Record<TokenSymbol, Contract<Snip20>> {
    const tokens: Record<TokenSymbol, Contract<Snip20>> = {}
    for (const pair of this.swapPairs) {
      const [symbol1, symbol2] = pair.split('-')
      const token1 = this.findContract<Snip20>(contract=>contract.id === symbol1)
      if (token1) tokens[symbol1] = token1
      const token2 = this.findContract<Snip20>(contract=>contract.id === symbol2)
      if (token2) tokens[symbol2] = token2
    }
    return tokens
  }

  async deploy () {
    const factory   = await this.factory.deployed
    const exchanges = await this.updateExchanges()
    const router    = this.version === 'v1' ? null : await this.router.deployed
    return this
  }

  async upgrade (oldVer: Version = 'v1', newVer: Version = 'v2', multisig: boolean = false) {
    throw new Error('Upgrade me')
    const oldFactory   = await this.factory.deployed
    const oldTemplates = await oldFactory.getTemplates()
    const oldExchanges = await oldFactory.listExchangesFull()
    const toPair       = ({token_0, token_1})=>({pair:{token_0, token_1}})
    const pairs        = oldExchanges.map(toPair)
    const deployer     = new AMMDeployer(this, newVer)
    const newFactory   = await deployer.factory
    const results      = await newFactory.createExchanges({ pairs })
    const newExchanges = []
    for (const { token_0, token_1 } of results) {
      const exchange = await newFactory.getExchange(token_0, token_1)
      //await deployer.saveExchange(exchange.name)
      newExchanges.push(exchange)
    }
    return newExchanges
  }

  /** Each AMM exchange emits its LP token in return for providing liquidity.
    * Later, reward pools are spawned for select LP tokens. */
  async updateExchanges () {
    // expect the factory to be deployed
    const factory = await this.factory.deployed
    // the current list of exchanges
    const exchanges = await factory.getAllExchanges()
    // collect exchanges that don't exist yet and will be created after 1st loop
    const create = new Set<PairName>()
    this.log.br()
    this.log.info(`Exchange pairs:`)
    const align = getMaxLength(this.swapPairs)
    for (const name of this.swapPairs) {
      if (name in exchanges) {
        this.log.info('Pair:    ', bold(name.padEnd(align)), '(found)')
      } else {
        this.log.info('Pair:    ', bold(name.padEnd(align)), '(deploying)')
        create.add(name)
      }
    }
    const tokens = this.showExchangedTokens()
    // create any exchanges that don't exist yet in a single tx
    if (create.size > 0) {
      // on mainnet/testnet, the "real" tokens should be provided
      // on devnet/mocknet, deploy placeholders for missing tokens now:
      if (this.devMode) {
        const notDeployed = (key: string) => !tokens[key].address
        this.log.log(`Deploying mock tokens:`, Object.keys(tokens).filter(notDeployed).join(', '))
        await this.context.tokens.template.uploaded
        const deployed = await this.agent.instantiateMany(tokens)
        // FIXME: this should be done by TokenManager but it results
        // in the deployment receipt being created too early
        for (const [name, instance] of Object.entries(deployed)) {
          this.context.add(name, instance)
        }
      }
      // then create all exchange pairs not yet created
      this.log.log(`Creating ${create.size} pair(s)`)
      const result = await this.agent.bundle().wrap(async bundle=>{
        for (const name of [...create]) {
          const { token_0, token_1 } = this.context.tokens.pair(name)
          await factory.as(bundle).createExchange(token_0, token_1)
        }
      })
    }
    // get the updated list of exchanges
    const newExchanges = await factory.getAllExchanges()
    // get the expected pair and lp token ids and code hashes
    const { pair_contract, lp_token_contract } = await factory.getTemplates()
    // populate the new exchanges
    const { meta: { prefix } } = factory
    for (const [name, { meta, lpToken: { meta: lpMeta } }] of Object.entries(newExchanges)) {
      // skip pre-existing exchanges (otherwise reconfiguring inventory would break this)
      if (name in exchanges) continue
      // populate and save exchange receipt
      this.addExchange(meta, name, prefix, pair_contract.id, pair_contract.code_hash)
      // populate and save lp token receipt
      this.addLPToken(lpMeta, name, prefix, lp_token_contract.id, lp_token_contract.code_hash)
    }
    // return the up-to-date list of exchange clients
    return newExchanges
  }

  showExchangedTokens () {
    const tokens = this.exchangedTokens
    this.log.br()
    this.log.info(`Exchanged tokens:`)
    const align = getMaxLength(Object.keys(tokens))
    for (const name of Object.keys(tokens)) {
      const { address } = tokens[name]
      if (address) {
        this.log.info('Token:   ', bold(name.padEnd(align)), `(found: ${address})`)
      } else {
        this.log.info('Token:   ', bold(name.padEnd(align)), '(not found)')
      }
    }
    return tokens
  }

  async addExchange (meta, name, prefix, codeId?, codeHash?) {
    meta.prefix = prefix
    await fetchLabel(meta, this.agent)
    await fetchCodeHash(meta, this.agent, codeHash)
    await fetchCodeId(meta, this.agent, codeId&&String(codeId))
    this.add(`AMM[${this.version}].${name}`, meta)
  }

  async addLPToken (lpMeta, name, prefix, codeId?, codeHash?) {
    lpMeta.prefix = prefix
    await fetchLabel(lpMeta, this.agent)
    await fetchCodeHash(lpMeta, this.agent, codeHash)
    await fetchCodeId(lpMeta, this.agent, codeId&&String(codeId))
    this.add(`AMM[${this.version}].${name}.LP`, lpMeta)
  }

}
