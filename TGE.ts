import type {
  Address, CodeHash, ContractMetadata, TokenSymbol, Snip20, ViewingKey,
  IntoLink, Uint128
} from './Core'
import { Names, validatedAddressOf, validatedCodeHashOf } from './Core'
import * as Vesting from './Vesting'
import type * as Rewards from './Rewards'
import { RewardPool_v3_1 } from './Rewards_v3'
import type { SiennaDeployment } from "./index"
import { SiennaConsole } from "./index"

export type Version = 'v1'

/** Connect to an existing TGE. */
class TGEDeployment extends Vesting.Deployment<Version> {
  log     = new SiennaConsole(`TGE ${this.version}`)
  /** The deployed SIENNA SNIP20 token contract. */
  token   = this.context.tokens.define(this.symbol)
  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt    = this.contract({ client: MGMT })
  /** The deployed RPT contracts, which claim tokens from MGMT
    * and distributes them to the reward pools.  */
  rpts    = this.contract({ client: RPT }).getMany(Names.isRPT(this.symbol), `get all RPTs for ${this.symbol} vesting`)
  /** The initial staking pool.
    * Stake TOKEN to get rewarded more TOKEN from the RPT. */
  staking = this.contract({
    name:   Names.Staking(this.symbol),
    client: RewardPool_v3_1 as unknown as Rewards.RewardsCtor
  }).get()

  constructor (
    context:          SiennaDeployment,
    version:          Version,
    /** The vesting schedule to be loaded in MGMT. */
    public schedule?: Vesting.Schedule,
    /** The token to be created. */
    public symbol:    TokenSymbol = 'SIENNA',
  ) {
    super(context, version)
    context.attach(this, 'tge', 'SIENNA token generation event')
    this.mgmt.provide({ name: Names.MGMT(this.symbol) })
  }

  /** Launch the TGE.
    * - Makes MGMT admin of token
    * - Loads final schedule into MGMT
    * - Irreversibly launches the vesting.
    * After launching, you can only modify the config of the RPT. */
  async launch (schedule: Vesting.Schedule) {
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

  /** The **RPT account** (Remaining Pool Tokens) is a special entry
    * in MGMT's vesting schedule; its funds are vested to **the RPT contract's address**,
    * and the RPT contract uses them to fund the Reward pools.
    * However, the RPT address is only available after deploying the RPT contract,
    * which in turn nees MGMT's address, therefore establishing a
    * circular dependency. To resolve it, the RPT account in the schedule
    * is briefly mutated to point to the deployer's address (before any funds are vested). */
  get rptAccount () {
    const { mintingPoolName, rptAccountName } = this.constructor as typeof TGEDeployment
    return Vesting.findInSchedule(this.schedule, mintingPoolName, rptAccountName)
  }

  /** The **LPF account** (Liquidity Provision Fund) is an entry in MGMT's vesting schedule
    * which is vested immediately in full. On devnet and testnet, this can be used
    * to provide funding for tester accounts. In practice, testers are funded with an extra
    * mint operation in `deployTGE`. */
  get lpfAccount () {
    const { mintingPoolName, lpfAccountName } = this.constructor as typeof TGEDeployment
    return Vesting.findInSchedule(this.schedule, mintingPoolName, lpfAccountName)
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
}

export { TGEDeployment as Deployment }

/** Contract address/hash pair as used by MGMT */
export type LinkTuple = [Address, CodeHash]

/** Convert Fadroma.Instance to address/hash pair as used by MGMT */
export const linkTuple = (instance: IntoLink) => (
  [ validatedAddressOf(instance), validatedCodeHashOf(instance) ]
)

export class MGMT extends Vesting.MGMT {
  /** Generate an init message for Origina MGMT */
  static init = (
    admin:    Address,
    token:    IntoLink,
    schedule: Vesting.Schedule
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

export class RPT extends Vesting.RPT {
  /** Generate an init message for original RPT */
  static init = (
    admin:   Address,
    portion: Uint128,
    config:  Vesting.RPTConfig,
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
    const { status }: { status: Vesting.RPTStatus } = await this.query({ status: {} })
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
