import { SiennaConsole } from './Console'
import { VersionedSubsystem } from './Core'
import type { Uint128 } from './Core'
import type { Uint128 } from './Core'
import type { Version } from './GovernanceConfig'

export class GovernanceDeployment extends VersionedSubsystem<Version> {

  log = new SiennaConsole(`Governance ${this.version}`)
  /** The token staked in the governance pool for voting power. */
  token = this.context.tge['v1'].token
  /** The RPT contract which needs to be reconfigured when we upgrade
    * the staking pool, so that the new pool gets rewards budget. */
  rpt = this.context.tge['v1'].rpt
  /** The up-to-date Rewards v4 staking pool with governance support. */
  staking = this.context.tge['v1'].staking
  /** The governance voting contract. */
  voting = this.contract({ client: Polls })
  /** The auth provider and oracle used to give
    * the voting contract access to the balances in the
    * staking contract, which it uses to compute voting power. */
  auth = this.context.auth['v1']
    .provider('Governance')
    //.group('Rewards_and_Governance', async () => [
      //(await this.voting.deployed).asLink,
      //(await this.staking.deployed).asLink
    //])

  constructor (context: SiennaDeployment, version: Version,) {
    super(context, version)
    context.attach(this, `gov ${version}`, `Sienna Governance ${version}`)
    this.voting.provide({ name: Names.Polls('SIENNA', 'v4.1', this.version) })
  }

  /** Display the status of the governance system. */
  async showStatus () {
    const [staking, voting] = await Promise.all([this.staking.deployed, this.voting.deployed])
    this.log.pool(staking)
    const stakedToken = await staking.getStakedToken()
    const label = '(todo)'
    this.log.stakedToken(stakedToken, label)
    this.log.epoch(await staking.getEpoch())
    this.log.config(await staking.getConfig())
    this.log.pollsContract(voting)
    this.log.pollsAuthProvider(await voting.auth.getProvider())
    this.log.pollsConfig(await voting.getPollConfig())
    this.log.activePolls(await voting.getPolls(+ new Date() / 1000, 0, 10, 0))
  }

  revision = Pinned.Rewards['v4.2']
  /** Suffix to enable faster iteration in the same deployment. */
  suffix   = this.isTestnet ? `@${Math.floor(+ new Date/1000)}` : ''
  /** TODO use multisig address here for mainnet */
  admin    = this.agent?.address
  /** Whether the final bundle should be broadcast or saved for multisig signing. */
  multisig = false
  /** Deploy settings for the staking contract where voting power is established. */
  staking = this.staking.provide({
    crate:    'sienna-rewards',
    revision: this.revision,
    client:   API.Rewards.RewardPool['v4.1'],
    initMsg:  async () => this.staking.client.init({
      authProvider: (await (await this.auth).provider).asLink,
      stakedToken:  (await this.token.deployed).asLink,
      rewardToken:  (await this.token.deployed).asLink
    })
  })
  /** Deploy settings for the poll contract where voting is conducted. */
  voting = this.voting.provide({
    crate: 'sienna-poll',
    revision: this.revision,
    initMsg: async () => ({
      provider: (await (await this.auth).provider).asLink,
      config:   { ...this.pollsConfig, rewards: (await this.staking.deployed).asLink },
    })
  })
  /** Config for the voting contract. */
  pollsConfig = settings(this.chain?.mode).governance.config

  deploy = this.command('deploy', 'deploy Sienna Governance', async () => {
    // Need AuthProvider
    const auth    = await this.auth.provider.deployed
    // Need a link to the polls contract
    const polls   = await this.voting.deployed
    // Need a link to the staking contract
    const staking = await this.staking.deployed
    // Create the auth group and connect the pool to the polls
    await this.agent.bundle().wrap(async bundle => {
      // Create auth group
      const members = [ polls.asLink, staking.asLink ]
      console.log({members})
      await auth.as(bundle).createGroup('Rewards_and_Governance', members)
      // Need the pool to know about the polls
      await staking.as(bundle).setGovernanceLink(polls.asLink)
    })
    // Update RPT config and enable migrations: this part needs to be multisig on mainnet
    await this.agent.bundle().wrap(async bundle => {
      await this.configureRpt(bundle)
      await this.enableMigration(bundle)
    }, undefined, this.multisig)
    return this
  })

  /** A pre-existing Rewards v3 staking pool, from which users need to migrated.
    * In dev mode, one can be deployed to test the migration without having to
    * deploy a whole crop of legacy reward pools. */
  oldPool = this.contract({
    name:     'SIENNA.Rewards[v3]',
    client:   API.Rewards.RewardPool['v3.1']
  }).provide(this.devMode ? { // in dev mode, deploy a new old pool for testing
    crate:    'sienna-rewards',
    revision: Pinned.Rewards['v3.1'],
    initMsg:  async () => API.Rewards.RewardPool['v3.1'].init({
      rewardToken: (await this.token.deployed).asLink,
      stakedToken: (await this.token.deployed).asLink,
      admin:       await this.admin,
      timekeeper:  await this.admin
    })
  } : { /* in non-dev mode, use existing. */ })

  /** Enable internal per-user migrations between old and new pool. */
  async enableMigration (agent: Agent) {
    const [oldPool, newPool] = await Promise.all([
      this.oldPool.deployed,
      this.staking.deployed
    ])
    this.log.info(`Enabling migration from ${oldPool.address} to ${newPool.address}`)
    await oldPool?.as(agent).emigration.enableTo(newPool.asLink)
    await newPool.as(agent).immigration.enableFrom(oldPool.asLink)
  }

  /** Replace address of old pool with new pool in RPT config. */
  async configureRpt (agent: Agent) {
    const [rpt, oldPool, newPool] = await Promise.all([
      this.rpt.deployed,
      this.oldPool.deployed,
      this.staking.deployed
    ])
    const { config } = await rpt.status() as { config: API.Vesting.RPTConfig }
    this.log.log('Current RPT config:', config)
    const entry = await this.findRPTEntry(config, oldPool.address)
    this.log.info(`Replacing ${entry[0]} with ${newPool.address} in RPT config`)
    entry[0] = newPool.address
    this.log.log('New RPT config:', config)
    await rpt.as(agent).configure(config)
  }

  /** If old pool is not defined, pick an address from the RPT config */
  async findRPTEntry (
    config:  API.Vesting.RPTConfig,
    oldAddr: Address
  ): Promise<[Address, Uint128]> {
    let entry = config.find(([addr, sum])=>addr===oldAddr)
    if (!entry) {
      if (!process.stdin.isTTY) {
        this.log.error(
          `Old pool (${oldAddr}) not found in RPT config; ` +
          `no TTY is available for manual selection. Bailing. `
        )
        throw new Error('Could not update RPT config.')
      }
      const { index } = await (await import('prompts')).default({
        type: 'select',
        name: 'index',
        message: `Which one of these to replace with the new staking contract?`,
        choices: await (await Promise.all(config.map(async ([address, sum], index)=>({
          title: await (await this.rpt.deployed).agent.getLabel(address),
          description: `(${address}) ${sum}`,
          value: index
        }))))
      })
      entry = config[index]
    }
    return entry
  }

  //async upgradeStaking (context): Promise<API.Rewards> {
    //const { contract, config: { multisig } } = context
    //this.log.info('Upgrading SIENNA staking pool to support governance')
    //const SIENNA       = await contract('SIENNA')
      //.get("Deploy the SIENNA token first.")
    //const authProvider = await contract('SIENNA.AuthProvider[v1]', API.AuthProvider)
      //.get('Deploy auth provider first.')
    //const newPool      = contract('SIENNA.Rewards[v4]', API.Rewards['v4.1'])
    //return await enableMigrationOfRewardPoolFrom3to4(
      //context,
      //await contract('SIENNA.Rewards[v3]', API.Rewards['v3.1'])
        //.get("Deploy the old pool first."),
      //await (multisig
        //? newPool.get('Deploy the new pool first.')
        //: newPool.getOrDeploy('sienna-rewards', API.Rewards['v4.1'].init({
            //authProvider,
            //stakedToken: SIENNA,
            //rewardToken: SIENNA
          //})))
    //)
  //}

}
