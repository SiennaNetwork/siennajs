import type { Sienna } from '../index'
import { SiennaConsole } from '../Console'
import { ClientError as Error, Snip20, bold, randomBase64 } from '../Core'
import { Names } from '../Names'
import { Versions, Versioned } from '../Versions'
import type { Agent, Uint128, Address, Contract, ViewingKey, TokenSymbol, Named } from '../Core'

import { VestingReporter } from './VestingConsole'
import {
  Schedule, findInSchedule, mintingPoolName, rptAccountName, lpfAccountName, mintTestBudget
} from './VestingConfig'
import type { TGEVersion, TGEOptions, RPTConfig, PFRVersion } from './VestingConfig'
import { BaseMGMT, TGEMGMT, PFRMGMT } from './VestingMGMT'
import { BaseRPT, TGERPT, PFRRPT } from './VestingRPT'

import type { Version as AMMVersion } from '../AMM/AMM'
import type { Version as RewardsVersion } from '../Rewards/Rewards'
import { RewardPool_v4_1 } from '../Rewards/Rewards'

/** A vesting consists of a MGMT and one or more RPTs. */
export abstract class VestingDeployment<V> extends Versioned<V> {

  log = new SiennaConsole(`Vesting ${this.version}`)

  /** The token that will be distributed. */
  abstract token: Contract<Snip20>

  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  abstract mgmt: Contract<BaseMGMT>

  /** The deployed RPT contract, which claims tokens from MGMT
    * and distributes them to the reward pools.  */
  abstract rpt: Contract<BaseRPT>

  /** TODO: RPT vesting can be split between multiple contracts
    * in order to vest to more addresses than the gas limit allows. */
  //abstract subRPTs: Contracts<BaseRPT>

  /** Fetch the current schedule of MGMT. */
  async getSchedule () {
    return (await this.mgmt()).schedule()
  }

  setSchedule () {
    throw new Error('TODO')
  }

  addToSchedule () {
    throw new Error('TODO')
  }

  /** Fetch the current schedule of MGMT. */
  async getMgmtStatus () {
    return (await this.mgmt()).status()
  }

  /** Fetch the current progress of the vesting. */
  async getMgmtProgress (addr: Address) {
    return (await this.mgmt()).progress(addr)
  }

  /** Fetch the current status of RPT. */
  async getRptStatus () {
    return (await this.rpt()).status()
  }

  /** Update the RPT configuration. */
  setRptConfig (config: RPTConfig) {
    this.log.warn('TGEDeployment#setRptConfig: TODO')
  }

  show: VestingReporter = new VestingReporter(this)

}

const settings = () => ({})

/** Deploy the TGE. */
export class TGEDeployment extends VestingDeployment<TGEVersion> {

  log = new SiennaConsole(`TGE ${this.version}`)

  revision: string

  admin:    Address

  symbol:   TokenSymbol

  /** The main SIENNA token. */
  token:    Contract<Snip20>

  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt:     Contract<TGEMGMT>

  /** The vesting schedule for the TGE. */
  schedule: Schedule

  /** The deployed RPT contracts, which claim tokens from MGMT
    * and distributes them to the reward pools.  */
  rpt:      Contract<TGERPT>

  /** TODO: RPT vesting can be split between multiple contracts
    * in order to vest to more addresses than the gas limit allows. */
  //subRPTs:  Contracts<TGERPT>

  /** The initial single-sided staking pool.
    * Stake TOKEN to get rewarded more TOKEN from the RPT. */
  staking:  Contract<RewardPool_v4_1>

  constructor (
    context: Sienna,
    { version, revision, symbol, schedule, admin }: TGEOptions
  ) {
    super(context, version)
    this.version  = version
    this.symbol   = symbol
    this.admin    = admin ?? context.agent?.address
    this.schedule = schedule ?? settings(context.chain?.mode).schedule
    this.revision = revision ?? Versions.TGE[this.version]
    this.token = this.defineContract<Snip20>({
      id: symbol,
      crate: 'snip20-sienna',
      revision: this.revision,
      client: Snip20,
      initMsg: {
        name: symbol,
        symbol: symbol,
        decimals: 18,
        admin: this.admin,
        config: { public_total_supply: true },
        prng_seed: randomBase64()
      }
    })
    this.mgmt = this.defineContract<TGEMGMT>({
      id:       Names.MGMT(this.symbol),
      client:   TGEMGMT,
      crate:    'sienna-mgmt',
      revision: this.revision,
      initMsg: async () => this.mgmt.client!.init(
        this.admin,
        (await this.token()).asLink,
        this.schedule
      )
    })
    this.rpt = this.defineContract<TGERPT>({
      id:       Names.RPT(this.symbol),
      client:   TGERPT,
      crate:    'sienna-rpt',
      revision: this.revision,
      initMsg: async () => this.rpt.client!.init(
        this.agent!.address,
        this.rptAccount!.portion_size,
        [[this.agent!.address, this.rptAccount!.portion_size]],
        (await this.token()).asLink,
        (await this.mgmt()).asLink
      )
    })
    //this.subRPTs = this.defineContract<TGERPT>({
      //match:    Names.isRPT(this.symbol),
      //client:   TGERPT
    //}).many([])
    this.staking = this.defineContract({
      id:       Names.Staking(this.symbol),
      client:   RewardPool_v4_1
    })
  }

  deploy = this.command<(this: TGEDeployment)=>Promise<TGEDeployment>>(
    'deploy',
    'deploy and launch a token generation event',
    async (): Promise<TGEDeployment> => {
      if (!this.agent) throw new Error('no deploy agent')
      const token = await this.token()        // find or deploy vested token
      this.rptAccount!.address = this.admin   // fix rpt account pt. 1 (mutates this.schedule)
      const mgmt  = await this.mgmt()         // find or deploy mgmt
      const rpt   = await this.rpt()          // find or deploy rpt
      this.rptAccount!.address = rpt.address! // fix rpt account pt. 2 (mutates this.schedule)
      const { status: { launched } } = await mgmt.status() // check if vesting is launched
      if (launched) {
        this.log.info('TGE already launched.')
      } else {
        if (this.isTestnet || this.devMode) await mintTestBudget(this)
        await this.agent!.bundle().wrap(async bundle => { // irrevocably launch vesting
          await mgmt.as(bundle).acquire(token)            // make MGMT admin and sole minter
          await mgmt.as(bundle).configure(this.schedule)  // set final vesting config in MGMT
          await mgmt.as(bundle).launch()                  // launch MGMT
        })
      }
      return this
    })

  /** Get the balance of an address in the vested token. */
  async getBalance (addr: Address, vk: ViewingKey) {
    this.log.info(`Querying balance of ${addr}...`)
    return await (await this.token.deployed).getBalance(addr, vk)
  }

  /** Print the result of getBalance. */
  async showBalance (addr: Address, vk: ViewingKey) {
    this.log.balance(addr, await this.getBalance(addr, vk))
  }

  /** Set the VK of the calling address in the vested token. */
  async setVK (vk: ViewingKey) {
    this.log.info('Setting VK...')
    return await (await this.token.deployed).vk.set(vk)
  }

  get rptAccount () {
    return findInSchedule(this.schedule, mintingPoolName, rptAccountName)
  }

  get lpfAccount () {
    return findInSchedule(this.schedule, mintingPoolName, lpfAccountName)
  }

}

/** A partner-funded rewards vesting.
  * Allows staking LP-TOKENX-SIENNA LP tokens
  * into an alternate reward pool which distributes
  * rewards in TOKENX instead of SIENNA. This pool
  * is funded by its own TOKENX vesting. */
interface PFRVesting {
  /** The incentivized token. */
  token:   Snip20
  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt:    PFRMGMT
  /** The root RPT contract, which claims tokens from MGMT
    * and distributes them to recipients either directly or via the subRPTs. */
  rpt:     PFRRPT
  /** The other RPT contract(s), distributing tokens in multiple transactions
    * in order to bypass the gas limit. */
  //subRPTs: PFRRPT
  /** The staked token, e.g. LP-SIENNA-SMTHNG. */
  staked:  Snip20
  /** The incentive token. */
  reward:  Snip20
  /** The staking pool for this PFR instance.
    * Stake `this.staked` to get rewarded in `this.reward`,
    * either of which may or may not be `this.token` */
  staking: RewardPool_v4_1
}

type ContractGroup<T> = T

type ContractGroups<T, U extends ContractGroup<T>> = Record<string, T>

/** Partner-funded rewards manager. Deploys multiple PFR vestings. */
export class PFRDeployment extends VersionedSubsystem<PFRVersion> {

  log = new SiennaConsole(`PFR ${this.version}`)

  admin?:         Address

  /** The version of the AMM to integrate with (for incentivizing swap pairs) */
  ammVersion:     AMMVersion

  /** The version of the rewards contract to use. */
  rewardsVersion: RewardsVersion

  /** A collection of all currently defined PFR vestings. */
  vestings:       Named<PFRVesting>

  constructor (
    context: Sienna,
    options?: Partial<{
      admin:          Address,
      version:        PFRVersion,
      ammVersion:     AMMVersion,
      rewardsVersion: RewardsVersion,
      schedules:      unknown
    }>
  ) {
    super(context, options?.version ?? 'v1')
    this.ammVersion = options?.ammVersion ?? 'v2'
    this.rewardsVersion = options?.rewardsVersion ?? 'v3.1'
    this.admin = options?.admin ?? this.agent?.address
    this.schedules = options?.schedules ?? settings(this.chain?.mode).vesting
    this.vestings = this.vesting.many({
      //alter: 'ALTER',
      //shade: 'SHADE'
    })
    //context.attach(this, 'pfr', 'Sienna Partner-Funded Rewards')
    //this.attach(this.alter, 'alter', 'ALTER rewards for LP-SIENNA-ALTER')
    //this.attach(this.shade, 'shade', 'SHD rewards for LP-SIENNA-SHD')
  }

  /** The template for a partner-funded rewards vesting. */
  vesting = this.defineGroup(function pfrVestingContracts (
    this: PFRDeployment, symbol: TokenSymbol
  ) {

    const { ammVersion, rewardsVersion } = this

    const token = this.defineContract<Snip20>({
      id:      symbol,
      client:  Snip20,
      crate:   'amm-snip20',
      revision: 'dev',
      initMsg: {
        name:     `PFR.Mock.${symbol}`,
        symbol:   symbol,
        decimals: 18,
        config: {
          public_total_supply: true,
          enable_deposit: true
        },
        initial_balances: [
          { address: this.admin, amount: "9999999999999" }
        ],
        prngSeed: randomBase64()
      }
    })

    const mgmt = this.defineContract({
      id:      Names.PFR_MGMT(symbol),
      client:  PFRMGMT,
      crate:   'sienna-mgmt',
      revision: 'dev',
      initMsg: async () => ({
        admin:   this.admin,
        token:   (await reward()).asLink,
        prefund: true,
        schedule
      })
    })

    const rpt = this.defineContract({
      id:     Names.PFR_RPT(symbol),
      client: PFRRPT,
      crate:  'sienna-rpt',
      revision: 'dev',
      initMsg: async () => ({
        mgmt:         (await mgmt()).asLink,
        token:        (await reward()).asLink,
        portion:      account.portion_size,
        distribution: [(await staking()).address, account.portion_size]
      })
    })

    //const subRPTs = this.defineContract({
      //id: () => '',
      //client: PFRRPT,
      //crate:  'sienna-rpt-child',
    //}).many({})

    const staked  = this.defineContract({
      id: Names.LPToken(this.ammVersion, 'SIENNA', symbol),
      crate: 'lp-token',
      revision: 'dev',
      client: Snip20,
    })

    const reward  = token

    const staking = this.defineContract({
      id:     Names.PFR_Pool(this.ammVersion, 'SIENNA', symbol, this.rewardsVersion),
      crate:  'sienna-rewards',
      client: RewardPool_v4_1,
      revision: 'dev',
      initMsg: async () => ({
        admin:       this.admin,
        timekeeper:  this.admin,
        stakedToken: (await staked()).asLink,
        rewardToken: (await reward()).asLink
      })
    })

    return { token, mgmt, rpt, staked, reward, staking }

  })

  deploy = this.command('deploy', 'deploy and launch a partner-funded vesting', async () => {
    throw new Error.NotImplemented()
    //const vestings = await this.vestings()
    //await this.agent!.bundle().wrap(async bundle => {
      //for (const [vesting, { mgmt, rpt }] of Object.entries(vestings)) {
        //await this.agent.bundle().wrap(async bundle => {
          //const mgmtBundleClients = mgmts.map(mgmt => mgmt.as(bundle))
          //await Promise.all(this.vestings.map(async ({ schedule, account }, i) => {
            //account.address = rpts[i].address
            //await mgmtBundleClients[i].add(schedule.pools[0].name, account)
          //}))
        //})
      //}
    //})
    //return this
  })

}
