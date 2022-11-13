class LendDeployment extends VersionedSubsystem<Version> {
  log = new SiennaConsole(`Lend ${this.version}`)
  /** The lend interest model contract. */
  interestModel = this.contract({ client: InterestModel })
  /** The lend overseer factory. */
  overseer      = this.contract({ client: Overseer })
  /** The known lend markets. */
  markets       = Promise.resolve([])
  /** The lend oracle. */
  oracle        = this.contract({ client: MockOracle })
  /** The reward token for Lend. Defaults to SIENNA. */
  reward        = this.context.tokens.define('SIENNA')

  constructor (context: SiennaDeployment, version: Version) {
    super(context, version)
    context.attach(this, `lend ${version}`, `Sienna Lend ${version}`)
    this.interestModel.provide({ name: Names.InterestModel(this.version) })
    this.overseer.provide({ name: Names.LendOverseer(this.version) })
    this.oracle.provide({ name: Names.LendOracle(this.version) })
  }

  async showStatus () {
    // TODO
  }

  /** Configure the overseer whitelist. */
  async whitelist () {
    const MARKET_INITIAL_EXCHANGE_RATE = "0.2";
    const MARKET_RESERVE_FACTOR        = "1";
    const MARKET_SEIZE_FACTOR          = "0.9";
    const MARKET_LTV_RATIO             = "0.7";
    const MARKET_TOKEN_SYMBOL          = "SSCRT";
    const overseer      = await this.overseer.deployed
    const interestModel = await this.interestModel.deployed
    const underlying_asset = 
    await overseer.execute({
      whitelist: {
        config: {
          entropy:                 randomBase64(36),
          prng_seed:               randomBase64(36),
          interest_model_contract: interestModel.asLink,
          ltv_ratio:               MARKET_LTV_RATIO,
          token_symbol:            MARKET_TOKEN_SYMBOL,
          config: {
            initial_exchange_rate: MARKET_INITIAL_EXCHANGE_RATE,
            reserve_factor:        MARKET_RESERVE_FACTOR,
            seize_factor:          MARKET_SEIZE_FACTOR,
          },
          underlying_asset: {
            address:               "",
            code_hash:             "",
          },
        },
      },
    })
  }
}

/** Deploy Sienna Lend. */
export class LendDeployer extends API.Lending.Deployment {

  interestModelSettings = {
    base_rate_year:       "0.02",
    blocks_year:          6311520,
    jump_multiplier_year: "4.0",
    jump_threshold:       "0.8",
    multiplier_year:      "0.225"
  }

  overseerSettings = {
    entropy:      randomHex(36),
    prng_seed:    randomHex(36),
    close_factor: "0.5",
    premium:      "1.08",
  }

  constructor (context, version) {
    super(context, version)
    this.interestModel.provide({
      crate:   'lend-interest-model',
      initMsg: () => this.interestModelSettings
    })
    this.overseer.provide({
      crate: 'lend-overseer',
      initMsg: async () => ({
        ...this.overseerSettings,
        market_contract: ((await this.contract({ crate: 'lend-market' }).uploaded)).asInfo,
        oracle_contract: ((await this.contract({ crate: 'lend-oracle' }).uploaded)).asInfo,
        oracle_source:   (await this.oracle.deployed).asLink,
        rewards_token:   (await this.reward.deployed).asLink,
        rewards_rate: "1"
      })
    })
    if (this.devMode) {
      this.oracle.provide({ crate: 'lend-mock-oracle' })
    } else {
      this.oracle.provide({ crate: 'lend-oracle' })
    }
  }

  deploy = this.command('deploy', 'deploy Sienna Lend', async () => {
    await Promise.all([
      this.overseer,
      this.interestModel,
      this.reward,
      this.oracle,
    ])
    return this
  })

}
