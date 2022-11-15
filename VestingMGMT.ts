import { Client } from './Core'
import type { Snip20, Address, IntoLink } from './Core'
import type { Schedule } from './VestingConfig'
import { linkTuple } from './VestingConfig'

/** A MGMT vesting contract of either version. */
export abstract class BaseMGMT extends Client {

  /** See the full schedule */
  schedule  () {
    return this.query({ schedule: {} })
  }

  /** Load a schedule */
  configure (schedule: any) {
    return this.execute({ configure: { schedule } })
  }

  /** Add a new account to a pool */
  add (pool_name: any, account: any) {
    return this.execute({ add_account: { pool_name, account } })
  }

  /** Launch the vesting */
  launch () {
    return this.execute({ launch: {} })
  }

  /** Claim accumulated portions */
  claim () {
    return this.execute({ claim: {} })
  }

  /** take over a SNIP20 token */
  async acquire (token: Snip20) {
    const tx1 = await token.setMinters([this.address!])
    const tx2 = await token.changeAdmin(this.address!)
    return [tx1, tx2]
  }

  /** Check how much is claimable by someone at a certain time */
  async progress (address: Address, time = +new Date()): Promise<Progress> {
    time = Math.floor(time / 1000) // JS msec -> CosmWasm seconds
    const { progress }: { progress: Progress } =
      await this.query({ progress: { address, time } }) 
    return progress
  }

  abstract status (): Promise<unknown>

}

export class TGEMGMT extends BaseMGMT {

  /** Generate an init message for Original MGMT */
  static init = (admin: Address, token: IntoLink, schedule: Schedule) => ({
    admin,
    token: linkTuple(token),
    schedule
  })

  /** Query contract status */
  status(): Promise<{ status: { launched: boolean } }> {
    return this.query({ status: {} })
  }

  /** set the admin */
  setOwner (new_admin: any) {
    return this.execute({ set_owner: { new_admin } })
  }

}

export class PFRMGMT extends BaseMGMT {

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

/** The overall progress of a vesting. */
export interface Progress {
  time:     number
  launcher: number
  elapsed:  number
  unlocked: string
  claimed:  string
}
