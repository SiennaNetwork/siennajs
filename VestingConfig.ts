import {
  bold, assertAddress, codeHashOf, Agent, Address, CodeHash, Uint128, Duration
} from './Core'
import type { TGEDeployment } from './VestingDeploy'

export type TGEVersion = 'v1'

export type PFRVersion = 'v1'

export interface Config {
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
  schedule:     Schedule
  account:      Account
}

/** A MGMT schedule. */
export interface Schedule {
  total: Uint128
  pools: Array<Pool>
}

/** A pool of a Schedule. */
export interface Pool {
  name:     string
  total:    Uint128
  partial:  boolean
  accounts: Array<Account>
}

/** An account in a Pool. */
export interface Account {
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

export function findInSchedule (
  schedule: Schedule|undefined,
  pool:     string,
  account:  string
): Account|undefined {
  if (!schedule) throw new Error('No schedule.')
  return schedule.pools
    .filter((x: Pool)=>x.name===pool)[0]?.accounts
    .filter((x: Account)=>x.name===account)[0]
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

export type RPTConfig    = [Address, Uint128][]

export type RPTStatus    = unknown

/** Contract address/hash pair as used by MGMT */
export type LinkTuple = [Address, CodeHash]

/** Convert Fadroma.Instance to address/hash pair as used by MGMT */
export const linkTuple = (instance: IntoLink) =>
  ([ assertAddress(instance), codeHashOf(instance) ])

/** In test deployments, extra budget can be minted for easier testing. */
export async function mintTestBudget (
  context: TGEDeployment,
  agent:   Agent   = context.agent!,
  amount:  Uint128 = "5000000000000000000000",
  admin:   Address = agent.address!,
  testers: Address[] = [
    admin,
    "secret13nkfwfp8y9n226l9sy0dfs0sls8dy8f0zquz0y",
    "secret1xcywp5smmmdxudc7xgnrezt6fnzzvmxqf7ldty",
  ]
) {
  context.log.warn(`Dev mode: minting initial balances for ${testers.length} testers.`)
  context.log.warn(`Minting will not be possible after launch.`)
  const token = (await context.token.deployed).as(agent)
  try {
    await token.setMinters([admin])
    await agent.bundle().wrap(async bundle => {
      for (const addr of testers) {
        context.log.warn(bold('Minting'), bold(`${amount}u`), 'to', bold(addr))
        await token.as(bundle).mint(amount, admin)
      }
    })
  } catch (e) {
    context.log.warn('Could not mint test tokens. Maybe the TGE is already launched.')
  }
}
