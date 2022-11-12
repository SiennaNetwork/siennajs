import { Address, CodeHash, Uint128, Duration } from './Core'

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

export type RPTConfig    = [Address, Uint128][]

export type RPTStatus    = unknown

/** Contract address/hash pair as used by MGMT */
export type LinkTuple = [Address, CodeHash]

/** Convert Fadroma.Instance to address/hash pair as used by MGMT */
export const linkTuple = (instance: IntoLink) =>
  ([ assertAddress(instance), codeHashOf(instance) ])
