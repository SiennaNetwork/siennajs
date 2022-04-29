import { Client, Snip20 } from '@hackbg/fadroma'

export type RPTRecipient = string
export type RPTAmount = string
export type RPTConfig = [RPTRecipient, RPTAmount][]

export abstract class RPT extends Client {

  static "legacy" = class RPT_TGE extends RPT {
    /** query contract status */
    async status() {
      return (await this.query({ status: {} })).status
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
