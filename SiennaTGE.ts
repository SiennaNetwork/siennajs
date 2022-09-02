import * as Scrt   from '@fadroma/scrt'
import * as Tokens from '@fadroma/tokens'
import * as ICC    from './ICC'

/** Connect to an existing TGE. */
export default class TGEDeployment extends Scrt.Deployment {
  names = { token: 'SIENNA', mgmt: 'SIENNA.MGMT', rpt: 'SIENNA.RPT' }

  /** The deployed SIENNA SNIP20 token contract. */
  token = this.client(SiennaSnip20).called(this.names.token).expect('SIENNA not found.')

  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt = this.client(MGMT_TGE).called(this.names.mgmt).expect('SIENNA MGMT not found.')

  /** The deployed RPT contract, which claims tokens from MGMT
    * and distributes them to the reward pools.  */
  rpt = this.client(RPT_TGE).called(this.names.rpt).expect('SIENNA RPT not found.')

  /** Fetch the current schedule of MGMT. */
  getMgmtSchedule = () => this.mgmt?.then((mgmt: MGMT_TGE)=>mgmt.schedule())

  /** Fetch the current schedule of MGMT. */
  getMgmtProgress = (addr: Scrt.Address) => this.mgmt.then((mgmt: MGMT_TGE) => mgmt.progress(addr))

  /** Fetch the current status of RPT. */
  getRptStatus = ()=>this.rpt?.then((rpt: RPT_TGE)=>rpt.status())

  /** Update the RPT configuration. */
  setRptConfig (config: RPTConfig) { throw 'TODO' }
}

/** Contract address/hash pair as used by MGMT */
export type LinkTuple = [Scrt.Address, Scrt.CodeHash]

/** Convert Fadroma.Instance to address/hash pair as used by MGMT */
export const linkTuple = (instance: ICC.IntoLink) => (
  [ ICC.validatedAddressOf(instance), ICC.validatedCodeHashOf(instance) ]
)

/** The SIENNA SNIP20 token. */
export class SiennaSnip20 extends Tokens.Snip20 {}

/** A MGMT vesting contract of either version. */
export abstract class MGMT extends Scrt.Client {

  static MINTING_POOL = "MintingPool"

  static LPF = "LPF"

  static RPT = "RPT"

  static emptySchedule = (address: Scrt.Address) => ({
    total: "0",
    pools: [ { 
      name: MGMT.MINTING_POOL, total: "0", partial: false, accounts: [
        { name: MGMT.LPF, amount: "0", address,
          start_at: 0, interval: 0, duration: 0,
          cliff: "0", portion_size: "0", remainder: "0" },
        { name: MGMT.RPT, amount: "0", address,
          start_at: 0, interval: 0, duration: 0,
          cliff: "0", portion_size: "0", remainder: "0" }
      ]
    } ]
  })

  /** See the full schedule */
  schedule  () {
    return this.query({ schedule: {} })
  }
  /** Load a schedule */
  configure (schedule: any) {
    return this.execute({ configure: { schedule } })
  }
  /** Add a new account to a pool */
  add       (pool_name: any, account: any) {
    return this.execute({ add_account: { pool_name, account } })
  }
  /** Launch the vesting */
  launch    () {
    return this.execute({ launch: {} })
  }
  /** Claim accumulated portions */
  claim     () {
    return this.execute({ claim: {} })
  }
  /** take over a SNIP20 token */
  async acquire (token: Tokens.Snip20) {
    const tx1 = await token.setMinters([this.address!])
    const tx2 = await token.changeAdmin(this.address!)
    return [tx1, tx2]
  }
  /** Check how much is claimable by someone at a certain time */
  async progress (address: Scrt.Address, time = +new Date()): Promise<VestingProgress> {
    time = Math.floor(time / 1000) // JS msec -> CosmWasm seconds
    const { progress } = await this.query({ progress: { address, time } })
    return progress
  }
}

/** A MGMT schedule. */
export interface VestingSchedule {
  total: Scrt.Uint128
  pools: Array<VestingPool>
}

export interface VestingPool {
  name:     string
  total:    Scrt.Uint128
  partial:  boolean
  accounts: Array<VestingAccount>
}

export interface VestingAccount {
  name:         string
  amount:       Scrt.Uint128
  address:      Scrt.Address
  start_at:     Scrt.Duration
  interval:     Scrt.Duration
  duration:     Scrt.Duration
  cliff:        Scrt.Uint128
  portion_size: Scrt.Uint128
  remainder:    Scrt.Uint128
}

export interface VestingProgress {
  time:     number
  launcher: number
  elapsed:  number
  unlocked: string
  claimed:  string
}

/** A RPT (redistribution) contract of each version. */
export abstract class RPT extends Scrt.Client {
  /** Claim from mgmt and distribute to recipients. Anyone can call this method as:
    * - the recipients can only be changed by the admin
    * - the amount is determined by MGMT */
  vest() {
    return this.execute({ vest: {} })
  }
  static legacy: typeof RPT_TGE
  static vested: typeof RPT_PFR
}

export type RPTRecipient = string

export type RPTAmount    = string

export type RPTConfig    = [RPTRecipient, RPTAmount][]

export type RPTStatus    = unknown

export class MGMT_TGE extends MGMT {

  /** Generate an init message for Origina MGMT */
  static init = (
    admin:    Scrt.Address,
    token:    Scrt.IntoLink,
    schedule: VestingSchedule
  ) => ({
    admin,
    token: linkTuple(token),
    schedule
  })

  /** Query contract status */
  status() {
    return this.query({ status: {} })
  }

  /** claim accumulated portions */
  claim() {
    return this.execute({ claim: {} })
  }

  /** set the admin */
  setOwner(new_admin: any) {
    return this.execute({ set_owner: { new_admin } })
  }

}

export class RPT_TGE extends RPT {

  /** Generate an init message for original RPT */
  static init = (
    admin:    Scrt.Address,
    portion:  RPTAmount,
    config:   RPTConfig,
    token:    Scrt.IntoLink,
    mgmt:     Scrt.IntoLink
  ) => ({
    admin,
    portion,
    config,
    token: linkTuple(token),
    mgmt:  linkTuple(mgmt),
  })

  /** query contract status */
  async status () {
    const { status }: { status: RPTStatus } = await this.query({ status: {} })
    return status
  }

  /** set the vesting recipients */
  configure(config = []) {
    return this.execute({ configure: { config } })
  }

  /** change the admin */
  setOwner (new_admin: Scrt.Address) {
    return this.execute({ set_owner: { new_admin } })
  }

}
