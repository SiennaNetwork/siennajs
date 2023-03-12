import {
  Address,
  Client,
  CodeHash,
  Duration,
  Uint128,
  Snip20
} from './core'

/** A MGMT vesting contract of either version. */
export abstract class MGMT extends Client {

  /** See the full schedule */
  schedule () {
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
  async progress (address: Address, time = +new Date()): Promise<VestingProgress> {
    time = Math.floor(time / 1000) // JS msec -> CosmWasm seconds
    const { progress }: { progress: VestingProgress } =
      await this.query({ progress: { address, time } })
    return progress
  }

}

/** A MGMT schedule. */
export interface VestingSchedule {
  total: Uint128
  pools: Array<VestingPool>
}

export interface VestingPool {
  name:     string
  total:    Uint128
  partial:  boolean
  accounts: Array<VestingAccount>
}

export interface VestingAccount {
  name:         string
  amount:       Uint128
  address:      Address
  start_at:     Duration
  interval:     Duration
  duration:     Duration
  cliff:        Uint128
  portion_size: Uint128
  remainder:    Uint128
}

export interface VestingProgress {
  time:     number
  launcher: number
  elapsed:  number
  unlocked: string
  claimed:  string
}

/** A RPT (redistribution) contract of each version. */
export abstract class RPT extends Client {
  /** Claim from mgmt and distribute to recipients. Anyone can call this method as:
    * - the recipients can only be changed by the admin
    * - the amount is determined by MGMT */
  vest() {
    return this.execute({ vest: {} })
  }
}

export type RPTRecipient = string

export type RPTAmount    = string

export type RPTConfig    = [RPTRecipient, RPTAmount][]

export type RPTStatus    = unknown

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
  schedule:     VestingSchedule
  account:      VestingAccount
}

export function findInSchedule (
  schedule: VestingSchedule|undefined,
  pool:     string,
  account:  string
): VestingAccount|undefined {
  if (!schedule) throw new Error('No schedule.')
  return schedule.pools
    .filter((x: VestingPool)=>x.name===pool)[0]?.accounts
    .filter((x: VestingAccount)=>x.name===account)[0]
}

/** The **RPT account** (Remaining Pool Tokens) is a special entry
  * in MGMT's vesting schedule; its funds are vested to **the RPT contract's address**,
  * and the RPT contract uses them to fund the Reward pools.
  * However, the RPT address is only available after deploying the RPT contract,
  * which in turn nees MGMT's address, therefore establishing a
  * circular dependency. To resolve it, the RPT account in the schedule
  * is briefly mutated to point to the deployer's address (before any funds are vested). */
export const rptAccountName  = 'RPT'

/** The **LPF account** (Liquidity Provision Fund) is an entry in MGMT's vesting schedule
  * which is vested immediately in full. On devnet and testnet, this can be used
  * to provide funding for tester accounts. In practice, testers are funded with an extra
  * mint operation in `deployTGE`. */
export const lpfAccountName  = 'LPF'

export const mintingPoolName = 'MintingPool'

export const emptySchedule   = (address: Address) => ({
  total: "0",
  pools: [
    {
      name:     mintingPoolName,
      total:    "0",
      partial:  false,
      accounts: [
        {
          name:         lpfAccountName,
          amount:       "0",
          address,
          start_at:      0,
          interval:      0,
          duration:      0,
          cliff:        "0",
          portion_size: "0",
          remainder:    "0"
        },
        {
          name:         rptAccountName,
          amount:       "0",
          address,
          start_at:      0,
          interval:      0,
          duration:      0,
          cliff:        "0",
          portion_size: "0",
          remainder:    "0"
        }
      ]
    }
  ]
})
