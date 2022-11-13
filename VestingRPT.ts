import { Client } from './Core'
import type { Address, Uint128, IntoLink } from './Core'
import { linkTuple } from './VestingConfig'
import type { RPTConfig, RPTStatus } from './VestingConfig'

/** A RPT (redistribution) contract of each version. */
export abstract class BaseRPT extends Client {
  /** Claim from mgmt and distribute to recipients. Anyone can call this method as:
    * - the recipients can only be changed by the admin
    * - the amount is determined by MGMT */
  vest() {
    return this.execute({ vest: {} })
  }
  abstract status (): Promise<unknown>
}

export class TGERPT extends BaseRPT {
  /** Generate an init message for original RPT */
  static init = (
    admin:   Address,
    portion: Uint128,
    config:  RPTConfig,
    token:   IntoLink,
    mgmt:    IntoLink
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

export class PFRRPT extends BaseRPT {
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
