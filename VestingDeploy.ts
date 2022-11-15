import { SiennaConsole } from './Console'
import { Names, Versions, VersionedSubsystem, Snip20, bold, randomBase64 } from './Core'
import type {
  Agent, Uint128, Address, Contract, DeployContract, ViewingKey, TokenSymbol
} from './Core'

import { VestingReporter } from './VestingConsole'
import {
  Schedule, findInSchedule, mintingPoolName, rptAccountName, lpfAccountName, mintTestBudget
} from './VestingConfig'
import type { RPTConfig, TGEVersion, PFRVersion } from './VestingConfig'
import { BaseMGMT, TGEMGMT, PFRMGMT } from './VestingMGMT'
import { BaseRPT, TGERPT, PFRRPT } from './VestingRPT'

import type { Version as AMMVersion } from './AMMConfig'
import type { Version as RewardsVersion } from './RewardsConfig'
import { RewardPool_v4_1 } from './Rewards'

/** A vesting consists of a MGMT and one or more RPTs. */
export abstract class VestingDeployment<V> extends VersionedSubsystem<V> {

  log = new SiennaConsole(`Vesting ${this.version}`)

  show: VestingReporter = new VestingReporter(this)

  /** Fetch the current schedule of MGMT. */
  getSchedule () {
    return this.mgmt.get().schedule()
  }

  setSchedule () {
    throw new Error('TODO')
  }

  addToSchedule () {
    throw new Error('TODO')
  }

  /** Fetch the current schedule of MGMT. */
  getMgmtStatus () {
    return this.mgmt.get().status()
  }

  /** Fetch the current progress of the vesting. */
  getMgmtProgress (addr: Address) {
    return this.mgmt.get().progress(addr)
  }

  /** Fetch the current status of RPT. */
  async getRptStatus () {
    return await this.rpt.get().status()
  }

  /** Update the RPT configuration. */
  setRptConfig (config: RPTConfig) {
    console.warn('TGEDeployment#setRptConfig: TODO')
  }

  /** The token that will be distributed. */
  abstract token:   DeployContract<Snip20>

  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  abstract mgmt:    DeployContract<BaseMGMT>

  /** The deployed RPT contract, which claims tokens from MGMT
    * and distributes them to the reward pools.  */
  abstract rpt:     DeployContract<BaseRPT>

  /** TODO: RPT vesting can be split between multiple contracts
    * in order to vest to more addresses than the gas limit allows. */
  abstract subRpts: DeployContracts<BaseRPT>

}

const settings = () => ({})

/** Connect to an existing TGE. */
export class TGEDeployment extends VestingDeployment<TGEVersion> {

  log = new SiennaConsole(`TGE ${this.version}`)

  revision: string

  admin: Address

  symbol: TokenSymbol

  /** The main SIENNA token. */
  token: DeployContract<Snip20>

  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt: DeployContract<TGEMGMT>

  schedule: Schedule

  /** The deployed RPT contracts, which claim tokens from MGMT
    * and distributes them to the reward pools.  */
  rpt: DeployContract<TGERPT>

  /** TODO: RPT vesting can be split between multiple contracts
    * in order to vest to more addresses than the gas limit allows. */
  subRPTs: DeployContracts<TGERPT>

  /** The initial single-sided staking pool.
    * Stake TOKEN to get rewarded more TOKEN from the RPT. */
  staking: DeployContract<RewardPool_v4_1>

  constructor (
    context: SiennaDeployment,
    options: {
      /** The version of the subsystem. */
      version:   TGEVersion,
      /** The Git reference from which to build. */
      revision?: string,
      /** The token to be created. */
      symbol:    TokenSymbol
      /** The vesting schedule to be loaded in MGMT. */
      schedule?: Schedule,
      /** The address that will own the contracts. */
      admin?:    Address
    } = {
      version:  'v1',
      symbol:   'SIENNA',
    }
  ) {
    super(context, options.version!)
    this.version  = options.version
    this.symbol   = options.symbol
    this.admin    = options.admin ?? context.agent?.address
    this.schedule = options.schedule ?? settings(context.chain?.mode).schedule
    this.revision = options.revision ?? Versions.TGE[this.version]
    this.token = this.contract<Snip20>({
      id: options.symbol,
      crate: 'snip20-sienna',
      revision: this.revision,
      client: Snip20,
      initMsg: {
        name: options.symbol,
        symbol: options.symbol,
        decimals: 18,
        admin: this.admin,
        config: { public_total_supply: true },
        prng_seed: randomBase64()
      }
    })
    this.mgmt = this.contract<TGEMGMT>({
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
    this.rpt = this.contract<TGERPT>({
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
    this.subRPTs = this.contracts<TGERPT>({
      match:    Names.isRPT(this.symbol),
      client:   TGERPT
    })
    this.staking = this.contract({
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

type DeployContractGroup<T> = T
type DeployContractGroups<T> = Record<string, T>

/** Partner-funded rewards manager. */
export class PFRDeployment extends VersionedSubsystem<PFRVersion> {

  log = new SiennaConsole(`PFR ${this.version}`)

  constructor (
    context: SiennaDeployment,
    options?: Partial<{
      version:        PFRVersion,
      ammVersion:     AMMVersion,
      rewardsVersion: RewardsVersion,
    }>
  ) {
    options ??= {}
    options.version        ??= 'v1'
    options.ammVersion     ??= 'v2'
    options.rewardsVersion ??= 'v3.1'

    super(context, options.version)

    this.vesting = this.contracts((symbol: TokenSymbol)=>{
      const { ammVersion, rewardsVersion } = this
      const token = this.contract({
        client: Snip20,
        id:     symbol
      })
      const mgmt = this.contract({
        client: PFRMGMT,
        id:     Names.PFR_MGMT(symbol)
      })
      const rpt = this.contract({
        client: PFRRPT
      })
      const subRpts = this.contracts({ client: PFRRPT })
      const staked  = this.contract({
        client: Snip20,
        id:     Names.Exchange(this.ammVersion, 'SIENNA', symbol)
      })
      const reward  = token
      const staking = this.contract({
        client: RewardPool_v4_1,
        id:     Names.PFR_Pool(this.ammVersion, 'SIENNA', symbol, this.rewardsVersion)
      })
      return { token, mgmt, rpt, subRpts, staked, reward, staking }
    })

    this.vestings = {
      alter: this.vesting('ALTER'),
      shade: this.vesting('SHADE')
    }

    //context.attach(this, 'pfr', 'Sienna Partner-Funded Rewards')
    //this.attach(this.alter, 'alter', 'ALTER rewards for LP-SIENNA-ALTER')
    //this.attach(this.shade, 'shade', 'SHD rewards for LP-SIENNA-SHD')
  }

  vesting: DeployContractGroup<{
    token:   Snip20
    mgmt:    PFRMGMT
    rpt:     PFRRPT
    subRPTs: PFRRPT
    staked:  Snip20
    reward:  Snip20
    staking: RewardPool_v4_1
  }>

  vestings: DeployContractGroups<PFRDeployment["vesting"]> = {}

  deploy = this.command('deploy', 'deploy and launch a partner-funded vesting', async () => {
    this.log.warn('TODO')
    //this.log.info('Vestings:', this.vestings)
    //const tokens  = await this.tokenPairs
    //const mgmts   = await this.mgmts
    //const rewards = await this.rewardPools
    //const rpts    = await this.rpts
    //// Set RPT addresses in MGMTs
    //await this.agent.bundle().wrap(async bundle => {
      //const mgmtBundleClients = mgmts.map(mgmt => mgmt.as(bundle))
      //await Promise.all(this.vestings.map(async ({ schedule, account }, i) => {
        //account.address = rpts[i].address
        //await mgmtBundleClients[i].add(schedule.pools[0].name, account)
      //}))
    //})
    //// Return grouped vestings
    //const toVesting = (token, i)=>({token, mgmt: mgmts[i], rpt: rpts[i], rewards: rewards[i]})
    //const deployedVestings = tokens.map(toVesting)
    //return deployedVestings
    return this
  })

  //admin = this.agent?.address

  //vestings = settings(this.chain?.mode).vesting

  //Rewards = API.Rewards[this.rewardsVersion]

  //mgmts = this.contract({
    //crate:  'sienna-mgmt',
    //client: API.PFR.MGMT
  //}).deployMany(async () => {
    //const tokens = await this.tokenPairs
    //return this.vestings.map((vesting, i)=>[
      //this.names.mgmts(vesting),
      //this.inits.mgmts(tokens)(vesting, i)
    //])
  //})

  //rewardPools = this.contract({
    //crate:    'sienna-rewards',
    //revision: Pinned.Rewards[this.rewardsVersion],
    //client:   this.Rewards as any
  //}).deployMany(async () => {
    //const tokens = await this.tokenPairs
    //return this.vestings.map((vesting, i)=>[
      //this.names.rewards(vesting),
      //this.inits.rewards(tokens)(vesting, i)
    //])
  //}) as Promise<API.Rewards[]>

  //rpts = this.contract({
    //crate:  'sienna-rpt',
    //client: API.PFR.RPT
  //}).deployMany(async () => {
    //const tokens  = await this.tokenPairs
    //const mgmts   = await this.mgmts
    //const rewards = await this.rewardPools
    //return this.vestings.map((vesting, i)=>[
      //this.names.rpts(vesting),
      //this.inits.rpts(tokens, mgmts, rewards)(vesting, i)
    //])
  //})

  //inits = {

    //tokens: ({ name }) => ({
      //id:             `PFR.Mock.${name}`,
      //symbol:           name.toUpperCase(),
      //decimals:         18,
      //config:           { public_total_supply: true, enable_deposit: true, },
      //initial_balances: [{address: this.admin, amount: "9999999999999"}],
      //prng_seed:        randomHex(36),
    //}),

    //mgmts:
      //(tokens: API.StakingTokens[]) =>
      //({schedule, rewards, lp}, i) => ({
        //admin:   this.admin,
        //token:   tokens[i].rewardToken.asLink,
        //prefund: true,
        //schedule,
      //}),

    //rewards:
      //(tokens: API.StakingTokens[]) =>
      //({schedule}, i) => this.Rewards.init({
        //admin:       this.admin,
        //timekeeper:  this.admin,
        //stakedToken: tokens[i].stakedToken.asLink,
        //rewardToken: tokens[i].rewardToken.asLink
      //}),

    //rpts:
      //(tokens: API.StakingTokens[], mgmts: API.MGMT_PFR[], rewardPools: API.Rewards[]) =>
      //({name, schedule, account}, i) => ({
        //mgmt:         mgmts[i].asLink,
        //token:        tokens[i].rewardToken.asLink,
        //portion:      account.portion_size,
        //distribution: [[rewardPools[i].address, account.portion_size]],
      //})

  //}

}

/** A partner-funded rewards vesting.
  * Allows staking LP-TOKENX-SIENNA LP tokens
  * into an alternate reward pool which distributes
  * rewards in TOKENX instead of SIENNA. This pool
  * is funded by its own TOKENX vesting. */
export class PFRVesting extends VestingDeployment<PFRVersion> {
  log = new SiennaConsole(`PFR ${this.version} ${this.symbol}`)

  /** The incentivized token. */
  token   = this.context.tokens.define(this.symbol)
  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt    = this.contract<PFRMGMT>({ client: PFRMGMT })
  /** The root RPT contract, which claims tokens from MGMT
    * and distributes them to recipients either directly or via the subRPTs. */
  rpt     = this.contract<PFRRPT>({ client: PFRRPT })
  /** The other RPT contract(s), distributing tokens in multiple transactions
    * in order to bypass the gas limit. */
  subRpts = this.contracts<PFRRPT>({ client: PFRRPT, match: Names.isRPTPFR(this.symbol) })
  /** The staked token, e.g. LP-SIENNA-SMTHNG. */
  staked  = this.contract({ client: Snip20 })
  /** The incentive token. */
  reward  = this.token
  /** The staking pool for this PFR instance.
    * Stake `this.staked` to get rewarded in `this.reward`,
    * either of which may or may not be `this.token` */
  staking = this.contract({ client: RewardPool_v4_1 })

  constructor (
    context: SiennaDeployment,
    version: Version,
    public symbol:         TokenSymbol    = 'ALTER',
    public ammVersion:     AMMVersion     = 'v2',
    public rewardsVersion: RewardsVersion = 'v3',
  ) {
    super(context, version)
    this.mgmt.define({
      id: Names.PFR_MGMT(this.symbol)
    })
    this.staked.define({
      id: Names.Exchange(this.ammVersion, 'SIENNA', this.symbol)
    })
    this.staking.define({
      id: Names.PFR_Pool(this.ammVersion, 'SIENNA', this.symbol, this.rewardsVersion)
    })
  }
}
