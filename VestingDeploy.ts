import { SiennaConsole } from './Console'
import { Names, Versions, VersionedSubsystem, Snip20 } from './Core'
import type { Address, Contract, ViewingKey, TokenSymbol } from './Core'

import { VestingReporter } from './VestingConsole'
import { Schedule, findInSchedule } from './VestingConfig'
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

  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  abstract mgmt:    Contract<BaseMGMT>

  /** Fetch the current schedule of MGMT. */
  getSchedule () {
    return this.mgmt.expect().then((mgmt: BaseMGMT)=>mgmt.schedule())
  }

  setSchedule () {
    throw new Error('TODO')
  }

  addToSchedule () {
    throw new Error('TODO')
  }

  /** Fetch the current schedule of MGMT. */
  getMgmtStatus () {
    return this.mgmt.expect().then((mgmt: BaseMGMT)=>mgmt.status())
  }

  /** Fetch the current progress of the vesting. */
  getMgmtProgress (addr: Address) {
    return this.mgmt.expect().then((mgmt: BaseMGMT)=>mgmt.progress(addr))
  }

  /** The deployed RPT contract, which claims tokens from MGMT
    * and distributes them to the reward pools.  */
  abstract rpt:     Contract<BaseRPT>

  /** TODO: RPT vesting can be split between multiple contracts
    * in order to vest to more addresses than the gas limit allows. */
  abstract subRpts: Contracts<BaseRPT>

  /** Fetch the current status of RPT. */
  async getRptStatus () {
    const rpt = await this.rpt.expect()
    return await rpt.status()
  }

  /** Update the RPT configuration. */
  setRptConfig (config: RPTConfig) {
    console.warn('TGEDeployment#setRptConfig: TODO')
  }

}

const settings = () => ({})

/** Connect to an existing TGE. */
export class TGEDeployment extends VestingDeployment<TGEVersion> {

  log = new SiennaConsole(`TGE ${this.version}`)

  admin = this.agent?.address

  revision = Versions.TGE[this.version]

  /** The deployed SIENNA SNIP20 token contract. */
  token = this.context.tokens.define(this.symbol)
  /** The main SIENNA token. */
  token = this.context.tokens.define(this.symbol, {
    name:     'SIENNA',
    decimals: 18,
    admin:    this.admin,
    config:   { public_total_supply: true }
  }).define({
    crate:    'snip20-sienna',
    revision: this.revision,
    client:   Snip20
  })

  /** The initial single-sided staking pool.
    * Stake TOKEN to get rewarded more TOKEN from the RPT. */
  staking = this.contract({ 
    name:   Names.Staking(this.symbol),
    client: RewardPool_v4_1
  })

  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt = this.contract<TGEMGMT>({
    name:     Names.MGMT(this.symbol),
    client:   TGEMGMT,
    crate:    'sienna-mgmt',
    revision: this.revision,
    initMsg: async () => this.mgmt.client.init(
      this.admin,
      (await this.token.deployed).asLink,
      this.schedule
    )
  })

  /** The deployed RPT contracts, which claim tokens from MGMT
    * and distributes them to the reward pools.  */
  rpt = this.contract<TGERPT>({
    client: TGERPT,
    crate: 'sienna-rpt',
    revision: this.revision,
    name: Names.RPT(this.symbol),
    initMsg: async () => this.rpt.client.init(
      this.agent.address,
      this.rptAccount.portion_size,
      [[this.agent.address, this.rptAccount.portion_size]],
      (await this.token.deployed).asLink,
      (await this.mgmt.deployed).asLink
    )
  })

  /** TODO: RPT vesting can be split between multiple contracts
    * in order to vest to more addresses than the gas limit allows. */
  subRpts = this.contracts<TGERPT>({ match: Names.isRPT(this.symbol), client: TGERPT })

  schedule: Schedule = settings(this.chain?.mode).schedule

  constructor (
    context: SiennaDeployment,
    version: Version,
    /** The vesting schedule to be loaded in MGMT. */
    public schedule?: Schedule,
    /** The token to be created. */
    public symbol:    TokenSymbol = 'SIENNA',
  ) {
    super(context, version)
    context.attach(this, 'tge', 'SIENNA token generation event')
  }

  /** Launch the TGE.
    * - Makes MGMT admin of token
    * - Loads final schedule into MGMT
    * - Irreversibly launches the vesting.
    * After launching, you can only modify the config of the RPT. */
  async launch (schedule: Schedule) {
    const [token, mgmt, rpt] = await Promise.all([
      this.token.deployed,
      this.mgmt.deployed,
      this.rpt.deployed
    ])
    await this.agent!.bundle().wrap(async bundle => {
      // Make MGMT admin and sole minter of token;
      await mgmt.as(bundle).acquire(token)
      // Set final vesting config in MGMT;
      await mgmt.as(bundle).configure(schedule)
      // Irreversibly launch MGMT.
      await mgmt.as(bundle).launch()
    })
  }

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

  /** The **RPT account** (Remaining Pool Tokens) is a special entry
    * in MGMT's vesting schedule; its funds are vested to **the RPT contract's address**,
    * and the RPT contract uses them to fund the Reward pools.
    * However, the RPT address is only available after deploying the RPT contract,
    * which in turn nees MGMT's address, therefore establishing a
    * circular dependency. To resolve it, the RPT account in the schedule
    * is briefly mutated to point to the deployer's address (before any funds are vested). */
  get rptAccount () {
    const { mintingPoolName, rptAccountName } = this.constructor as typeof TGEDeployment
    return findInSchedule(this.schedule, mintingPoolName, rptAccountName)
  }

  /** The **LPF account** (Liquidity Provision Fund) is an entry in MGMT's vesting schedule
    * which is vested immediately in full. On devnet and testnet, this can be used
    * to provide funding for tester accounts. In practice, testers are funded with an extra
    * mint operation in `deployTGE`. */
  get lpfAccount () {
    const { mintingPoolName, lpfAccountName } = this.constructor as typeof TGEDeployment
    return findInSchedule(this.schedule, mintingPoolName, lpfAccountName)
  }

  static rptAccountName  = 'RPT'
  static lpfAccountName  = 'LPF'
  static mintingPoolName = 'MintingPool'
  static emptySchedule   = (address: Address) => ({
    total: "0",
    pools: [ { 
      name: this.mintingPoolName, total: "0", partial: false, accounts: [
        { name: this.lpfAccountName, amount: "0", address,
          start_at: 0, interval: 0, duration: 0,
          cliff: "0", portion_size: "0", remainder: "0" },
        { name: this.rptAccountName, amount: "0", address,
          start_at: 0, interval: 0, duration: 0,
          cliff: "0", portion_size: "0", remainder: "0" }
      ]
    } ]
  })

  deploy = this.command('deploy', 'deploy and launch a token generation event', async () => {
    if (!this.agent) throw new Error('no deploy agent')
    const token = await this.token.deployed
    this.rptAccount.address = this.agent.address // mutates this.schedule
    const mgmt  = await this.mgmt.deployed
    const rpt   = await this.rpt.deployed
    this.rptAccount.address = rpt.address // mutates this.schedule
    const { status: { launched } } = await mgmt.status()
    if (launched) {
      this.log.info('TGE already launched.')
    } else {
      if (this.isTestnet || this.devMode) await this.mintTestBudget()
      await this.launch(this.schedule)
    }
    return this
  })

  /** In test deployments, extra budget can be minted for easier testing. */
  async mintTestBudget (
    agent:   Agent   = this.agent,
    amount:  Uint128 = "5000000000000000000000",
    admin:   Address = agent.address,
    testers: Address[] = [
      admin,
      "secret13nkfwfp8y9n226l9sy0dfs0sls8dy8f0zquz0y",
      "secret1xcywp5smmmdxudc7xgnrezt6fnzzvmxqf7ldty",
    ]
  ) {
    this.log.warn(`Dev mode: minting initial balances for ${testers.length} testers.`)
    this.log.warn(`Minting will not be possible after launch.`)
    const token = (await this.token.deployed).as(agent)
    try {
      await token.setMinters([admin])
      await agent.bundle().wrap(async bundle => {
        for (const addr of testers) {
          this.log.warn(bold('Minting'), bold(`${amount}u`), 'to', bold(addr))
          await token.as(bundle).mint(amount, admin)
        }
      })
    } catch (e) {
      this.log.warn('Could not mint test tokens. Maybe the TGE is already launched.')
    }
  }

}

/** Partner-funded rewards manager. */
export class PFRDeployment extends VersionedSubsystem<PFRVersion> {
  log = new SiennaConsole(`PFR ${this.version}`)

  /** The PFR for Alter. */
  alter: PFRVesting = new PFRVesting(this.context, this.version, 'ALTER')

  /** The PFR for Shade. */
  shade: PFRVesting = new PFRVesting(this.context, this.version, 'SHD')

  constructor (
    context: SiennaDeployment,
    version: PFRVersion,
    public rewardsVersion: API.Rewards.Version = '3.1' as API.Rewards.Version
  ) {
    super(context, version)
    context.attach(this, 'pfr', 'Sienna Partner-Funded Rewards')
    this.attach(this.alter, 'alter', 'ALTER rewards for LP-SIENNA-ALTER')
    this.attach(this.shade, 'shade', 'SHD rewards for LP-SIENNA-SHD')
  }

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
      //name:             `PFR.Mock.${name}`,
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
      name: Names.PFR_MGMT(this.symbol)
    })
    this.staked.define({
      name: Names.Exchange(this.ammVersion, 'SIENNA', this.symbol)
    })
    this.staking.define({
      name: Names.PFR_Pool(this.ammVersion, 'SIENNA', this.symbol, this.rewardsVersion)
    })
  }
}
