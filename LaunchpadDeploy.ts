import { SiennaConsole } from './Console'
import { VersionedSubsystem } from './Core'
import { Version } from './LaunchpadConfig'
import { Launchpad } from './LaunchpadLPD'
import { IDO } from './LaunchpadIDO'

export class LaunchpadDeployment extends VersionedSubsystem<Version> {

  log     = new SiennaConsole(`Launchpad ${this.version}`)

  revision = Pinned.Rewards['v4.2']

  /** Launchpad settings. */
  config = {}//settings(this.chain?.mode).launchpad

  /** Template that the Launchpad will use to create IDOs. */
  idoTemplate = this.contract({ crate: 'ido' })

  /** Template that the Launchpad will use to create tokens. */
  tokenTemplate = this.contract(this.config?.tokenContract ?? { crate: `amm-snip20` })

  /** The launchpad contract. */
  lpd = this.contract({
    id: Names.Launchpad(this.version),
    client: Launchpad,
    crate: 'launchpad',
    revision: this.revision,
    initMsg: async () => {
      const [provider, staking, tokenTemplate, idoTemplate] = await Promise.all([
        (await this.auth).provider.deployed,
        this.staking.deployed,
        this.tokenTemplate.deployed,
        this.idoTemplate.deployed
      ])
      return {
        ...this.config,
        admin:          this.agent.address,
        prng_seed:      randomBase64(64),
        auth_provider:  provider.asLink,
        rewards_pool:   staking.asLink,
        token_contract: tokenTemplate.asInfo,
        ido_contract:   idoTemplate.asInfo,
      }
    }
  })

  /** The launchpad staking pool. */
  staking = this.context.tge['v1'].staking

  /** TODO: What does launchpad use RPT for? */
  rpt     = this.context.tge['v1'].rpt

  /** The known IDOs, matched by name */
  idos    = this.contracts({ client: IDO, match: Names.isIDO(this.version) })

  /** The auth provider and oracle used by the deployment.
    * This allows the staking contract to see the user's balance
    * in the staking contract. */
  auth = this.context.auth['v1'].provider('Launchpad').group('Rewards_and_Launchpad')

  constructor (context: SiennaDeployment, version: Version) {
    super(context, version)
    context.attach(this, `lpd ${version}`, `Sienna Launch ${version}`)
  }

  /** Display the status of the Launchpad/IDO system. */
  async showStatus () {
    const launchpad = await this.lpd.deployed
    this.log.authProvider(await launchpad.auth.getProvider())
    this.log.saleConstraints(await launchpad.saleConstraints())
    this.log.latestIdos(await launchpad.getIdos())
  }

  /** Deploy the Launchpad and its dependencies. */
  async deploy () {
    await this.lpd.deployed
    return this
  }
}
