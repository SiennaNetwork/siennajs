import { VestingSchedule } from '@sienna/settings'
import { Client, Address, Instance } from '@fadroma/client'
import { Snip20 } from '@fadroma/tokens'
import { linkStruct, linkTuple } from './Core'

export class SiennaSnip20 extends Snip20 {}

export interface VestingProgress {
  time:     number
  launcher: number
  elapsed:  number
  unlocked: string
  claimed:  string
}

export abstract class MGMT extends Client {
  static MINTING_POOL = "MintingPool"
  static LPF = "LPF"
  static RPT = "RPT"
  static emptySchedule = (address: Address) => ({
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
  async acquire (token: Snip20) {
    const tx1 = await token.setMinters([this.address])
    const tx2 = await token.changeAdmin(this.address)
    return [tx1, tx2]
  }
  /** Check how much is claimable by someone at a certain time */
  async progress (address: Address, time = +new Date()): Promise<VestingProgress> {
    time = Math.floor(time / 1000) // JS msec -> CosmWasm seconds
    const { progress } = await this.query({ progress: { address, time } })
    return progress
  }

  static legacy: typeof MGMT_TGE
  static vested: typeof MGMT_Vested
}

export class MGMT_TGE extends MGMT {
  /** Generate an init message for Origina MGMT */
  static init = (
    admin:    Address,
    token:    Instance,
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

MGMT.legacy = MGMT_TGE

export class MGMT_Vested extends MGMT {
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
}

MGMT.vested = MGMT_Vested

export type RPTRecipient = string
export type RPTAmount = string
export type RPTConfig = [RPTRecipient, RPTAmount][]
export type RPTStatus = unknown

export abstract class RPT extends Client {
  /** Claim from mgmt and distribute to recipients. Anyone can call this method as:
    * - the recipients can only be changed by the admin
    * - the amount is determined by MGMT */
  vest() {
    return this.execute({ vest: {} })
  }

  static "legacy" = class RPT_TGE extends RPT {
    /** Generate an init message for original RPT */
    static init = (
      admin:    Address,
      portion:  RPTAmount,
      config:   RPTConfig,
      token:    Instance,
      mgmt:     Instance
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
    setOwner (new_admin: Address) {
      return this.execute({ set_owner: { new_admin } })
    }
  }

  static "vested" = class RPT_Vested extends RPT {
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
}
