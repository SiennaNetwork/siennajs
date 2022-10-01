import {
  Address,
  Client,
  ClientConsole,
  CodeHash,
  Deployment,
  Duration,
  IntoLink,
  Name,
  Snip20,
  Uint128,
  ViewingKey,
  YAML,
  bold,
  validatedAddressOf,
  validatedCodeHashOf
} from './Core'
import {
  Vesting,
  MGMT,
  RPT
} from './Vesting'
import type {
  VestingSchedule,
  RPTAmount,
  RPTConfig,
  RPTStatus
} from './Vesting'
import {
  Rewards_v3_1
} from './SiennaRewards_v3'

/** Connect to an existing TGE. */
export default class SiennaTGE extends Vesting {
  /** The deployed SIENNA SNIP20 token contract. */
  token:   Promise<Snip20>
  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt:    Promise<MGMT_TGE> 
  /** The deployed RPT contracts, which claim tokens from MGMT
    * and distributes them to the reward pools.  */
  rpts:    Promise<RPT_TGE[]>
  /** The initial staking pool.
    * Stake TOKEN to get rewarded more TOKEN from the RPT. */
  staking: Promise<Rewards_v3_1>

  constructor (
    context: unknown,
    public symbol: string = 'SIENNA',
  ) {
    super(context)

    this.token  = this.tokens.deploy(symbol)

    let name

    name = `${symbol}.MGMT`
    this.mgmt = this.contract({ client: MGMT_TGE, name }).get()

    this.rpts = this.contract({ client: RPT_TGE })
      .getMany(({name})=>name.startWith(`${symbol}.RPT`))

    name = `${symbol}.Rewards[v3]`
    this.staking = this.contract({ client: Rewards_v3_1 })
      .get()
  }

  /** Launch the TGE.
    * - Makes MGMT admin of token
    * - Loads final schedule into MGMT
    * - Irreversibly launches the vesting.
    * After launching, you can only modify the config of the RPT. */
  async launch (schedule: VestingSchedule) {
    const [token, mgmt, rpts] = await Promise.all([this.token, this.mgmt, this.rpts])
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
    return await (await this.token).getBalance(addr, vk)
  }

  /** Print the result of getBalance. */
  async showBalance (addr: Address, vk: ViewingKey) {
    this.log.balance(addr, await this.getBalance(addr, vk))
  }

  /** Set the VK of the calling address in the vested token. */
  async setVK (vk: ViewingKey) {
    this.log.info('Setting VK...')
    return await (await this.token).vk.set(vk)
  }
}

/** Contract address/hash pair as used by MGMT */
export type LinkTuple = [Address, CodeHash]

/** Convert Fadroma.Instance to address/hash pair as used by MGMT */
export const linkTuple = (instance: IntoLink) => (
  [ validatedAddressOf(instance), validatedCodeHashOf(instance) ]
)

export class MGMT_TGE extends MGMT {
  /** Generate an init message for Origina MGMT */
  static init = (
    admin:    Address,
    token:    IntoLink,
    schedule: VestingSchedule
  ) => ({
    admin,
    token: linkTuple(token),
    schedule
  })
  /** Query contract status */
  status(): Promise<{ status: { launched: boolean } }> {
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
    admin:   Address,
    portion: RPTAmount,
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
