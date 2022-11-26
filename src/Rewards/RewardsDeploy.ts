import type { Sienna } from '../index'
import type { Name, Address, Contract, IntoLink } from '../Core'
import { bold, Snip20, linkStruct } from '../Core'
import { Names } from '../Names'
import { Versions, Versioned } from '../Versions'
import { SiennaConsole } from '../Console'

import type { TGERPT, RPTConfig } from '../Vesting/Vesting'
import type { Version as AMMVersion } from '../AMM/AMM'
import type { Version as AuthVersion, Deployment as AuthProviderDeployment } from '../Auth/Auth'
import type { Version, RewardsCtor } from '../Rewards/Rewards'
import { AuthVersions, AMMVersions } from '../Rewards/Rewards'
import { RewardPool } from './RewardsBase'

export class RewardsDeployment extends Versioned<Version> {

  log = new SiennaConsole(`Rewards ${this.version}`)

  /** Git reference to source code version. */
  revision: string = Versions.Rewards[this.version]

  /** Address to set as admin of newly created pools. */
  admin: Address = this.agent!.address!

  /** The token distributed by the reward pools. */
  reward: Contract<Snip20>

  /** The RPT contract that will fund the reward pools. */
  rpt: Contract<TGERPT>

  /** Whether to update the RPT contract's config after deploying the new pools. */
  adjustRpt: boolean = true

  /** Which version of Auth Provider should these rewards use. */
  authVersion?: AuthVersion = AuthVersions[this.version]

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

  /** Which reward pairs should exist, and what portion of rewards should they receive. */
  pairs: [Name, number][] = []//Object.entries(settings(this.chain?.mode).rewardPairs??{})

  /** The reward pools in this deployment. */
  pools = this.defineContract({
    client: this.client as RewardPool,
    //match: Names.isRewardPool(this.version),
    crate: 'sienna-rewards',
  })//.findMany()

  constructor (
    context: Sienna,
    options: {
      version: V,
      reward:  Contract<Snip20>
    }
  ) {
    super(context, options.version)
    this.reward = options.reward
    this.addCommand('deploy one',  'deploy one reward pool',   this.deployOne.bind(this))
        .addCommand('deploy all',  'deploy all reward pools',  this.deploy.bind(this))
        .addCommand('upgrade all', 'upgrade all reward pools', this.upgradeAll.bind(this))
  }

  async showStatus () {
    this.log.rewardPools(this.name, this.state)
  }

  /** Having deployed the pools, get the [Address, Uint128] pairs representing the RPT config. */
  async getRptConfig (pairs = this.pairs): Promise<RPTConfig> {
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

  async deploy () {
    const template = await this.pools.uploaded
    const rptConf = await this.getRptConfig()

    // resolve dependencies
    const authProvider = this.auth ? (await this.auth.provider.deployed).asLink : undefined
    const rewardToken  = (await this.reward.deployed).asLink
    // collect deploy-ready init configurations
    const inits: Record<string, any> = {}
    for (const [name] of this.pairs) {
      // define the name of the reward pool from the staked token
      const { tokenName, poolName } = this.getNames(name)
      // collect
      inits[poolName] = template.instance({
        id: poolName,
        initMsg: async () => {
          const stakedToken = (await this.context.tokens.define(tokenName)).asLink
          const admin       = this.admin
          const timekeeper  = this.admin
          return RewardPool[this.version].init({
            rewardToken, stakedToken, admin, timekeeper, authProvider
          })
        }
      })
    }

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
    const oldRewards = await this.defineContracts<Rewards.RewardPool>({
      match:  ({name})=>name.endsWith(`.Rewards[${oldVer}]`),
      client: RewardPool[oldVer]
    })

    const rewardToken      = await this.defineContract({ name: 'SIENNA', client: Snip20 })
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
    const NewRewards: Rewards.RewardsCtor = RewardPool[newVer]
    const newRewards = await this.defineContracts({
      crate:    'sienna-rewards',
      revision: Versions.Rewards[newVer],
      client:   NewRewards,
      inits:    async () => Object.fromEntries(oldRewards.map(old=>{
        const stakedToken = stakedTokens.get(old)
        const newAmmVer: AMMVersion = AMMVersions[newVer]
        const name = (stakedToken.address === rewardToken.address)
          ? `SIENNA.Rewards[${newVer}]`
          : `AMM[${newAmmVer}].${stakedTokenNames.get(stakedToken)}.LP.Rewards[${newVer}]`
        return [name, [name, NewRewards.init({
          rewardToken: rewardToken as IntoLink,
          stakedToken: stakedToken,
          admin:       this.agent!.address,
          timekeeper:  this.agent!.address
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
  ): Promise<Rewards.RewardPool> {
    return this.defineContract<RewardPool>({
      name, crate: 'sienna-rewards', client: RewardPool[this.version] as any,
    }).deploy(() => ({
      admin: this.agent!.address,
      config: {
        reward_vk:    null,
        lp_token:     linkStruct(staked),
        reward_token: linkStruct(reward),
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
    await this.agent!.bundle().wrap(async bundle=>{
      await oldPool.as(bundle).emigration.enableTo(newPool.asLink)
      await newPool.as(bundle).immigration.enableFrom(oldPool.asLink)
    }, undefined, this.multisig)
  }

}
