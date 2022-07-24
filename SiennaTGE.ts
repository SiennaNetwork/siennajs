import { VestingSchedule } from '@sienna/settings'
import { Client, Address, Instance } from '@fadroma/client'
import { Snip20 } from '@fadroma/tokens'
import { linkStruct } from './Core'

export class SiennaSnip20 extends Snip20 {}

export interface VestingProgress {
  time:     number
  launcher: number
  elapsed:  number
  unlocked: string
  claimed:  string
}

export abstract class MGMT extends Client {

  /** launch the vesting */
  launch() {
    return this.execute({ launch: {} })
  }

  /** claim accumulated portions */
  claim() {
    return this.execute({ claim: {} })
  }

  /** take over a SNIP20 token */
  async acquire(token: Snip20) {
    const tx1 = await token.setMinters([this.address])
    const tx2 = await token.changeAdmin(this.address)
    return [tx1, tx2]
  }

  /** See the full schedule */
  schedule() {
    return this.query({ schedule: {} })
  }

  /** Load a schedule */
  async configure(schedule: any) {
    return this.execute({ configure: { schedule } })
  }

  /** add a new account to a pool */
  add(pool_name: any, account: any) {
    return this.execute({ add_account: { pool_name, account } })
  }
  /** Check how much is claimable by someone at a certain time */
  async progress (address: Address, time = +new Date()): Promise<VestingProgress> {
    time = Math.floor(time / 1000) // JS msec -> CosmWasm seconds
    const { progress } = await this.query({ progress: { address, time } })
    return progress
  }

  static "legacy" = class MGMT_TGE extends MGMT {

    static init = (
      admin:    Address,
      token:    Instance,
      schedule: VestingSchedule
    ) => ({
      admin,
      token: linkStruct(token),
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

  static "vested" = class MGMT_Vested extends MGMT {
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

}

export type RPTRecipient = string
export type RPTAmount = string
export type RPTConfig = [RPTRecipient, RPTAmount][]
export type RPTStatus = unknown

export abstract class RPT extends Client {

  static "legacy" = class RPT_TGE extends RPT {

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
      token: linkStruct(token),
      mgmt:  linkStruct(mgmt),
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

    /** claim from mgmt and distribute to recipients */
    vest() {
      return this.execute({ vest: {} })
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
