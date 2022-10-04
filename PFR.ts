import type { Address, CodeHash, TokenSymbol, Contract, Client, Task } from './Core'
import { Names, Snip20, VersionedSubsystem } from './Core'
import { RewardPool_v4_1 } from './Rewards_v4'
import * as Vestings from './Vesting'
import type * as AMM from './AMM'
import type * as Rewards  from './Rewards'
import type { SiennaDeployment } from "./index"
import { SiennaConsole } from "./index"

export type Version = 'v1'

/** Partner-funded rewards manager. */
class PFRDeployment extends VersionedSubsystem<Version> {
  log = new SiennaConsole(`PFR ${this.version}`)

  /** The PFR for Alter. */
  alter: PFRVesting = new PFRVesting(this.context, this.version, 'ALTER')

  /** The PFR for Shade. */
  shade: PFRVesting = new PFRVesting(this.context, this.version, 'SHD')

  async showStatus () {}

  constructor (context: SiennaDeployment, version: Version) {
    super(context, version)
    this.attach(this.alter, 'alter', 'ALTER rewards for LP-SIENNA-ALTER')
    this.attach(this.shade, 'shade', 'SHD rewards for LP-SIENNA-SHD')
  }
}

/** A partner-funded rewards vesting.
  * Allows staking LP-TOKENX-SIENNA LP tokens
  * into an alternate reward pool which distributes
  * rewards in TOKENX instead of SIENNA. This pool
  * is funded by its own TOKENX vesting. */
class PFRVesting extends Vestings.Deployment<Version> {
  log = new SiennaConsole(`PFR ${this.version} ${this.symbol}`)

  /** The incentivized token. */
  token   = this.context.tokens.define(this.symbol)
  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt    = this.contract({ client: PFRMGMT })
  /** The root RPT contract, which claims tokens from MGMT
    * and distributes them to recipients either directly or via the subRPTs. */
  rpt     = this.contract({ client: PFRRPT })
  /** The other RPT contract(s), distributing tokens in multiple transactions
    * in order to bypass the gas limit. */
  subRpts = this.contracts({ client: PFRRPT, match: Names.isRPTPFR(this.symbol) })
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
    public symbol:         TokenSymbol     = 'ALTER',
    public ammVersion:     AMM.Version     = 'v2',
    public rewardsVersion: Rewards.Version = 'v3',
  ) {
    super(context, version)
    this.mgmt.provide({
      name: Names.PFR_MGMT(this.symbol)
    })
    this.staked.provide({
      name: Names.Exchange(this.ammVersion, 'SIENNA', this.symbol)
    })
    this.staking.provide({
      name: Names.PFR_Pool(this.ammVersion, 'SIENNA', this.symbol, this.rewardsVersion)
    })
  }
}

export interface Config {
  name:         string
  rewards: {
    name:       string
    address:    Address
    codeHash:   Address
    decimals:   number
    timekeeper: Address
  }
  lp: {
    name:       string
    address:    Address
    codeHash:   CodeHash
  }
  schedule:     Vestings.Schedule
  account:      Vestings.Account
}

export class PFRMGMT extends Vestings.MGMT {
  /** Change the admin of the contract, requires the other user to accept */
  change_admin(new_admin: any) {
    return this.execute({ auth: { change_admin: { address: new_admin } } })
  }
  /** accept becoming an admin */
  accept_admin() {
    return this.execute({ auth: { accept_admin: {} } })
  }
  history(start: number, limit: number) {
    return this.query({ history: { start, limit } })
  }
  config() {
    return this.query({ config: {} })
  }
  status () {
    return this.config()
  }
}

export class PFRRPT extends Vestings.RPT {
  status () {
    return this.configuration()
  }
  configuration() {
    return this.query({ configuration: {} });
  }
  configure(distribution: any, portion: any) {
    return this.execute({ configure: { distribution, portion } });
  }
  vest() {
    return this.execute({ vest: {} });
  }
}

export {
  PFRDeployment as Deployment,
  PFRVesting    as Vesting,
  PFRMGMT       as MGMT,
  PFRRPT        as RPT
}
