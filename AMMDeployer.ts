/** Deploy Sienna Swap AMM and create exchanges and LP tokens. */
export class AMMDeployer extends API.AMM.Deployment {

  constructor (
    context,
    version,
    public config = settings(context.agent?.chain?.mode),
  ) {
    super(context, version)
    this.addCommand('deploy',  'deploy Sienna Swap',
                    this.deploy.bind(this)) 
        .addCommand('upgrade', 'upgrade Sienna Swap factory and exchanges',
                    this.upgrade.bind(this)) 
        .addCommand('update exchanges', 'update Sienna Swap exchange pairs',
                    this.updateExchanges.bind(this))
  }

  revision = Pinned.AMM[this.version]

  factory = this.factory.provide({
    crate: 'factory',
    revision: this.revision,
    initMsg: async () => {
      const config: any = {
        admin:             this.agent.address,
        pair_contract:     (await this.contract({ crate: 'exchange' }).uploaded).asInfo,
        lp_token_contract: (await this.contract({ crate: 'lp-token' }).uploaded).asInfo,
        ...this.config.amm,
        prng_seed:         randomHex(64),
      }
      if (this.version === 'v1') {
        config.token_contract =
          config.launchpad_contract =
          config.ido_contract =
          config.lp_token_contract
      }
      return config
    }
  })

  get exchangedTokens (): Record<TokenSymbol, Contract<Snip20>> {
    return this.context.tokens.defineMany(
      this.config.swapPairs.reduce((tokens, name)=>{
        for (const symbol of name.split('-')) tokens[symbol] = {}
        return tokens
      },
      {})
    )
  }

  router = this.router.provide({
    crate: 'router',
    revision: this.revision,
    initMsg: async () => {
      const exchanges = await this.updateExchanges()
      return { register_tokens: [/*TODO?*/] }
    }
  })

  async deploy () {
    const factory   = await this.factory.deployed
    const exchanges = await this.updateExchanges()
    const router    = this.version === 'v1' ? null : await this.router.deployed
    return this
  }

  async upgrade (
    oldVer: API.AMM.Version = 'v1',
    newVer: API.AMM.Version = 'v2',
    multisig: boolean = false
  ) {
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
    const create = new Set<API.AMM.PairName>()
    this.log.br()
    this.log.info(`Exchange pairs:`)
    const align = getMaxLength(this.config.swapPairs)
    for (const name of this.config.swapPairs) {
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
