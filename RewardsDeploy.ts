import type { Address } from './Core'
import { bold, Names, Versions, VersionedSubsystem } from './Core'
import { SiennaConsole } from './Console'
import type { Version } from './RewardsConfig'
import type { AuthProviderDeployment } from './AuthDeploy'
import { RewardPool } from './RewardsBase'

export class RewardsDeployment extends VersionedSubsystem<Version> {

  log = new SiennaConsole(`Rewards ${this.version}`)

  /** Which version of Auth Provider should these rewards use. */
  authVersion? = AuthVersions[this.version]

  /** The name of the auth provider, if used. */
  authProviderName = this.authVersion
    ? `Rewards[${this.version}]`
    : undefined

  /** The auth provider, if used. */
  auth = this.authVersion
    ? this.context.auth[this.authVersion].provider(this.authProviderName!)
    : null

  /** Which version of the AMM are these rewards for. */
  ammVersion = AMMVersions[this.version]

  /** The version of the Rewards client to use. */
  client: RewardsCtor = RewardPool[this.version] as unknown as RewardsCtor

  /** The reward pools in this deployment. */
  pools = this.contracts({ client: this.client, match: Names.isRewardPool(this.version) })

  /** Whether to emit a multisig TX instead of broadcasting. */
  multisig: boolean  = false

  /** Address to set as admin of newly created pools. */
  admin: Address = this.agent?.address

  /** Auth provider to use if required. */
  auth: AuthProviderDeployment = this.authVersion
    ? this.context.auth[this.authVersion].provider(`Rewards[${this.version}]`)
    : null

  /** Which reward pairs should exist, and what portion of rewards should they receive. */
  pairs: [Name, number][] = Object.entries(settings(this.chain?.mode).rewardPairs??{})

  /** Git reference to source code version. */
  revision: string = Versions.Rewards[this.version]

  constructor (
    context: SiennaDeployment,
    version: Version,
    /** The token distributed by the reward pools. */
    public reward: Contract<Snip20> = context.SIENNA
  ) {
    super(context, version)
    context.attach(this, `rewards ${version}`, `Sienna Rewards ${version}`)
  }
  constructor (context, version: API.Rewards.Version, reward: Contract<Snip20>) {
    super(context, version, reward ?? context.tge['v1'].token)
    this.addCommand('deploy one',  'deploy one reward pool',   this.deployOne.bind(this))
        .addCommand('deploy all',  'deploy all reward pools',  this.deployAll.bind(this))
        .addCommand('upgrade all', 'upgrade all reward pools', this.upgradeAll.bind(this))
  }

  async showStatus () {
    this.log.rewardPools(this.name, this.state)
  }

  /** The reward pools to create. */
  pools = this.pools.provide({
    crate: 'sienna-rewards',
    revision: this.revision,
    inits: async () => {
      // resolve dependencies
      const authProvider = this.auth ? (await this.auth.provider.deployed).asLink : undefined
      const rewardToken  = (await this.reward.deployed).asLink
      const template     = await this.pools.asTemplate.uploaded
      // collect deploy-ready init configurations
      const inits = {}
      for (const [name] of this.pairs) {
        // define the name of the reward pool from the staked token
        const { tokenName, poolName } = this.getNames(name)
        // collect
        inits[poolName] = template.instance({
          name: poolName,
          initMsg: async () => {
            const stakedToken = (await this.context.tokens.define(tokenName).deployed).asLink
            const admin       = this.admin
            const timekeeper  = this.admin
            return API.Rewards.RewardPool[this.version].init({
              rewardToken, stakedToken, admin, timekeeper, authProvider
            })
          }
        })
      }
      return inits
    }
  })

  /** Whether to update the RPT contract's config after deploying the new pools. */
  adjustRpt: boolean = true

  /** The RPT contract that will fund the reward pools. */
  rpt: Contract<API.Vesting.RPT> = this.context.tge['v1'].rpt

  /** Having deployed the pools, get the [Address, Uint128] pairs representing the RPT config. */
  async getRptConfig (pairs = this.pairs): Promise<API.Vesting.RPTConfig> {
    const rewards = await this.pools.deployed
    return this.pairs.map(([name, rewardAmount])=>{
      const { poolName } = this.getNames(name)
      const { address } = rewards[poolName]
      const amount = String(BigInt(rewardAmount) * ONE_SIENNA)
      return [address, amount]
    })
  }

  /** Get token and pool name from what's written in the config.
    * FIXME use deployment names in the config */
  getNames (name: string) {
    let tokenName = name
    // get the full staked token name if it's a LP token
    if (tokenName !== this.reward.name) tokenName = `AMM[${this.ammVersion}].${tokenName}.LP`
    // pool name based on staked token name
    const poolName = `${tokenName}.Rewards[${this.version}]`
    return { tokenName, poolName }
  }

  async deployAll () {
    const pools   = await this.pools.deployed
    const rptConf = await this.getRptConfig()
    if (this.adjustRpt) {
      if (this.isMainnet) {
        this.log.info('Now set this config in RPT by multisig:')
        this.log.log()
        this.log.log(JSON.stringify(rptConf))
        //this.deployment.save({config: rptConf}, 'RPTConfig.json')
        //this.log.info('Wrote RPT config to:', this.deployment.prefix)
      } else {
        const rpt = await this.context.tge['v1'].rpt.deployed
        this.log.info('Configuring RPT:')
        for (const [address, amount] of rptConf) {
          this.log.info(' ', address, bold(amount))
        }
        await rpt.configure(rptConf)
      }
    }
    return { pools, rewardsRPTConfig: rptConf }
  }

  async upgradeAll (oldVer: Version, newVer: Version, multisig: boolean = false) {
    /** Find list of old rewards pool from the deployment.
      * Rewards pool not recorded in the receipt will be unaffected by the upgrade. */
    const oldRewards = await this.contracts<API.Rewards.RewardPool>({
      match:  ({name})=>name.endsWith(`.Rewards[${oldVer}]`),
      client: API.Rewards.RewardPool[oldVer]
    })

    const rewardToken      = await this.contract({ name: 'SIENNA', client: API.Snip20 })
    const stakedTokens     = new Map()
    const stakedTokenNames = new Map()
    await Promise.all(oldRewards.map(async pool=>{
      const { name } = pool.meta
      this.log.info(bold('Getting staked token info for:'), name)
      if (name === 'SIENNA.Rewards[v2]') {
        stakedTokens.set(pool, rewardToken)
        stakedTokenNames.set(rewardToken, 'SIENNA')
      } else {
        const staked = await pool.getStakedToken()
        stakedTokens.set(pool, staked)
        const name = await staked.getPairName()
        stakedTokenNames.set(staked, name)
      }
    }))

    // !!! WARNING: This might've been the cause of the wrong behavior
    // of the AMM+Rewards migration; new pools should point to new LP tokens.
    const NewRewards: API.Rewards.RewardsCtor = RewardPool[newVer]
    const newRewards = await this.contracts({
      crate:    'sienna-rewards',
      revision: Pinned.Rewards[newVer],
      client:   NewRewards,
      inits:    async () => Object.fromEntries(oldRewards.map(old=>{
        const stakedToken = stakedTokens.get(old)
        const newAmmVer: API.AMM.Version = API.Rewards.AMMVersions[newVer]
        const name = (stakedToken.address === rewardToken.address)
          ? `SIENNA.Rewards[${newVer}]`
          : `AMM[${newAmmVer}].${stakedTokenNames.get(stakedToken)}.LP.Rewards[${newVer}]`
        return [name, [name, NewRewards.init({
          rewardToken: rewardToken as IntoLink,
          stakedToken: stakedToken,
          admin:       this.agent.address,
          timekeeper:  this.agent.address
        })]]
      }))
    })

    return { newRewards, oldRewards }
  }

  async deployOne (
    name,
    staked: IntoLink,
    reward: IntoLink,
    bonding: number = 86400,
    timekeeper?: Address
  ): Promise<API.Rewards.RewardPool> {
    return this.contract<API.Rewards.RewardPool>({
      name, crate: 'sienna-rewards', client: API.Rewards[this.version] as any,
    }).deploy(() => ({
      admin: this.agent.address,
      config: {
        reward_vk:    null,
        lp_token:     API.linkStruct(staked),
        reward_token: API.linkStruct(reward),
        timekeeper,
        bonding,
      }
    }))
  }

  /** Enable inter-contract migrations between old and new pool. */
  async enableMigrationOne (oldPool: RewardPool, newPool: RewardPool) {
    this.log.info(`Enabling user migration`)
    this.log.info(`  from ${bold(oldPool.address!)}`)
    this.log.info(`  into ${bold(newPool.address!)}`)
    await this.agent.bundle().wrap(async bundle=>{
      await oldPool.as(bundle).emigration.enableTo(newPool.asLink)
      await newPool.as(bundle).immigration.enableFrom(oldPool.asLink)
    }, undefined, this.multisig)
  }

}
