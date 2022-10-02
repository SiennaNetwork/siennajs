import type { Address, CodeHash, TokenSymbol, ContractMetadata } from './Core'
import { Snip20, VersionedSubsystem } from './Core'
import { Rewards_v4_1 } from './Rewards_v4'
import * as Vestings from './Vesting'
import type * as AMM      from './AMM'
import type * as Rewards  from './Rewards'
import { Names } from './Names'
import type { SiennaDeployment } from "./index"
import { SiennaConsole } from "./index"

export type Version = 'v1'

/** Partner-funded rewards manager. */
export class Deployment extends VersionedSubsystem<Version> {
  log = new SiennaConsole(`PFR ${this.version}`)

  constructor (context: SiennaDeployment, version: Version) {
    super(context, version)
    this.attach(this.alter, 'alter', 'ALTER rewards for LP-SIENNA-ALTER')
    this.attach(this.shade, 'shade', 'SHD rewards for LP-SIENNA-SHD')
  }

  /** The PFR for Alter. */
  alter: Vesting = new Vesting(this.context, this.version,
                               'ALTER')

  /** The PFR for Shade. */
  shade: Vesting = new Vesting(this.context, this.version,
                               'SHD')

  async showStatus () {}

}

/** A partner-funded rewards vesting.
  * Allows staking LP-TOKENX-SIENNA LP tokens
  * into an alternate reward pool which distributes
  * rewards in TOKENX instead of SIENNA. This pool
  * is funded by its own TOKENX vesting. */
export class Vesting extends Vestings.Deployment<Version> {
  log = new SiennaConsole(`PFR ${this.version} ${this.symbol}`)

  constructor (
    context: SiennaDeployment,
    version: Version,
    public symbol:         TokenSymbol     = 'ALTER',
    public ammVersion:     AMM.Version     = 'v2',
    public rewardsVersion: Rewards.Version = 'v3',
  ) {
    super(context, version)
  }
  /** The incentivized token. */
  token:  Promise<Snip20> =
    this.context.token(this.symbol)
  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt:   Promise<MGMT> =
    this.contract({ name: Names.PFR_MGMT(this.symbol), client: MGMT }).get()
  /** The deployed RPT contract(s), which claim tokens from MGMT
    * and distribute them to the reward pools.  */
  rpts:   Promise<RPT[]> = this.contract({ client: RPT })
    .getMany(Names.isRPTPFR(this.symbol), `get all RPT contracts for ${this.symbol} vesting`)
  /** The incentive token. */
  reward: Promise<Snip20> =
    this.token
  /** The staked token. */
  staked: Promise<Snip20> = this.contract({
    name:   Names.Exchange(this.ammVersion, 'SIENNA', this.symbol), 
    client: Snip20
  }).get()
  /** The staking pool for this PFR instance.
    * Stake `this.staked` to get rewarded in `this.reward`,
    * either of which may or may not be `this.token` */
  staking: Promise<Rewards_v4_1> =
    this.contract({
      name:   Names.PFR_Pool(this.ammVersion, 'SIENNA', this.symbol, this.rewardsVersion),
      client: Rewards_v4_1
    }).get()
}

export interface PFRConfig {
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

export class MGMT extends Vestings.MGMT {
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

export class RPT extends Vestings.RPT {
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
