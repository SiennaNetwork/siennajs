import type { Sienna } from './index'
import type { Contract } from './Core'
import { Names, Versions, VersionedSubsystem, randomBase64 } from './Core'
import { SiennaConsole } from './Console'

import type { LendOptions, Version } from './LendConfig'
import { InterestModel } from './LendInterestModel'
import { Overseer } from './LendOverseer'
import { Oracle, MockOracle } from './LendOracle'

export class LendDeployment extends VersionedSubsystem<Version> {

  log = new SiennaConsole(`Lend ${this.version}`)

  /** The lend interest model contract. */
  interestModel: Contract<InterestModel> = this.defineContract({
    client:  InterestModel,
    id:      Names.InterestModel(this.version),
    crate:   'lend-interest-model',
    initMsg: () => this.interestModelSettings
  })

  market = this.defineTemplate({ crate: 'lend-market' })

  /** The lend oracle. */
  oracle: Contract<any> = this.defineContract({
    client: MockOracle,
    id:     Names.LendOracle(this.version),
    crate:  this.devMode ? 'lend-mock-oracle' : 'lend-oracle'
  })

  /** The lend overseer factory. */
  overseer: Contract<Overseer> = this.defineContract({
    client: Overseer,
    id:     Names.LendOverseer(this.version),
    crate: 'lend-overseer',
    initMsg: async () => ({
      ...this.overseerSettings,
      market_contract: (await this.market()).asInfo,
      oracle_contract: (await this.oracle.uploaded).asInfo,
      oracle_source:   (await this.oracle()).asLink,
      rewards_token:   (await this.reward.deployed).asLink,
      rewards_rate: "1"
    })
  })

  /** The reward token for Lend. Defaults to SIENNA. */
  reward = this.context.tokens.define('SIENNA')

  constructor (context: Sienna, { version }: LendOptions) {
    super(context, version)
    context.attachSubsystem(this, `lend ${version}`, `Sienna Lend ${version}`)
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

  interestModelSettings = {
    base_rate_year:       "0.02",
    blocks_year:          6311520,
    jump_multiplier_year: "4.0",
    jump_threshold:       "0.8",
    multiplier_year:      "0.225"
  }

  overseerSettings = {
    entropy:      randomBase64(64),
    prng_seed:    randomBase64(64),
    close_factor: "0.5",
    premium:      "1.08",
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
