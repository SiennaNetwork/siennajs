import * as Scrt from '@fadroma/scrt'
import { TokenManager, Snip20 } from '@fadroma/tokens'
import type { TokenSymbol } from '@fadroma/tokens'
import { addZeros } from '@fadroma/core'
import { SecureRandom } from '@hackbg/formati'
import type { Sienna } from './index'

import type * as Auth       from './Auth'
import type * as AMM        from './AMM'
import type * as Rewards    from './Rewards'
import type * as Governance from './Governance'
import type * as Lend       from './Lend'
import type * as Launchpad  from './Launchpad'

export const SIENNA_DECIMALS = 18
export const ONE_SIENNA = BigInt(addZeros(1, SIENNA_DECIMALS))

/** All subsystems of the Sienna DeFi system are versioned. */
export abstract class VersionedSubsystem<V> extends Scrt.VersionedDeployment<V> {

  workspace = this.config?.build?.project

  /** Whether the final bundle should be broadcast or saved for multisig signing. */
  multisig = false

  constructor (public context: Sienna, public version: V) {
    super(context, version)
    this.context.tokens.template = this.context.defineContract({
      client:   Snip20,
      crate:    'amm-snip20',
      revision: 'dev'
    })
    Object.defineProperty(this, 'config', { get () { return this.context.config } })
  }

  async deploy (): Promise<this> {
    throw new Error('This method must be implemented by the subclass.')
  }
}

/** Get the current time in seconds since the Unix epoch. */
export const now = () => Math.floor(+new Date() / 1000);

export interface Pagination {
  limit: number
  start: number
}

export interface PaginatedResponse <T> {
  /** The total number of entries stored by the contract. */
  total: number
  /** The entries on this page. */
  entries: T[]
}

/** Per-user contract-to-contract migrations. */
export class Emigration extends Scrt.Client {
  enableTo(link: Scrt.ContractLink) {
    return this.execute({ emigration: { enable_migration_to: link } });
  }
  disableTo(link: Scrt.ContractLink) {
    return this.execute({ emigration: { disable_migration_to: link } });
  }
}

/** Per-user contract-to-contract migrations. */
export class Immigration extends Scrt.Client {
  enableFrom(link: Scrt.ContractLink) {
    return this.execute({ immigration: { enable_migration_from: link } });
  }
  disableFrom(link: Scrt.ContractLink) {
    return this.execute({ immigration: { disable_migration_from: link } });
  }
  migrateFrom(link: Scrt.ContractLink) {
    return this.execute({ immigration: { request_migration: link } });
  }
}

export const Versions = {

  TGE: {
    'v1': 'legacy/amm-v2-rewards-v3'
  },

  AMM: {
    'v1': 'legacy/amm-v1',
    'v2': 'legacy/amm-v2-rewards-v3'
  },

  Rewards: {
    'v2':   'legacy/rewards-v2',
    'v3':   'legacy/amm-v2-rewards-v3',
    'v3.1': 'legacy/rewards-3.1.0',
    'v4.1': 'legacy/rewards-4.1.2',
    'v4.2': 'legacy/rewards-4.2.0'
  } as Record<Rewards.Version, string>

}

/** Deployment-internal names of contracts.
  * TODO deprecate. */
export const Names = {
  MGMT: (t: TokenSymbol) =>
    `${t}.MGMT`,
  RPT: (t: TokenSymbol) =>
    `${t}.RPT`,
  Staking: (t: TokenSymbol, r: Rewards.Version = 'v3') =>
    `${t}.Rewards[${r}]`,
  Factory: (v: AMM.Version) =>
    `AMM[${v}].Factory`,
  Router:  (v: AMM.Version) =>
    `AMM[${v}].Router`,
  Exchange: (v: AMM.Version, t0: TokenSymbol, t1: TokenSymbol) =>
    `AMM[${v}].${t0}-${t1}`,
  LPToken: (v: AMM.Version, t0: TokenSymbol, t1: TokenSymbol) =>
    `AMM[${v}].${t0}-${t1}.LP`,
  Rewards: (v: AMM.Version, t0: TokenSymbol, t1: TokenSymbol, r: Rewards.Version) =>
    `AMM[${v}].${t0}-${t1}.LP.Rewards`,
  Polls: (t: TokenSymbol, r: Rewards.Version, v: Governance.Version) =>
    `${t}.Rewards[${r}].Polls[${v}]`,
  InterestModel: (v: Lend.Version) =>
    `Lend[${v}].InterestModel`,
  LendOverseer: (v: Lend.Version) =>
    `Lend[${v}].Overseer`,
  LendOracle: (v: Lend.Version) =>
    `Lend[${v}].Oracle`,
  LendMockOracle: (v: Lend.Version) =>
    `Lend[${v}].MockOracle`,
  /** The name of the launchpad contract. */
  Launchpad: (v: Launchpad.Version) =>
    `Launchpad[${v}]`,
  Provider: (v: Auth.Version) =>
    `Auth[${v}]`,
  NamedProvider: (v: Auth.Version, n: string) =>
    `${Names.Provider(v)}.${n}`,
  AuthOracle: (v: Auth.Version) =>
    `Auth[${v}].Oracle`,
  PFR_MGMT: (t: TokenSymbol) =>
    `${t}.MGMT[v3]`,
  PFR_RPT: (t: TokenSymbol) =>
    `${t}.RPT[v3]`,
  PFR_Pool: (v: AMM.Version, t0: TokenSymbol, t1: TokenSymbol, r: Rewards.Version) =>
    `${Names.Rewards(v, t0, t1, r)}.${t1}`,

  isExchange: (v: AMM.Version) => ({name}: any) =>
    name?.startsWith(`AMM[${v}]`) && !name.endsWith(`.LP`) || false,
  isLPToken:  (v: AMM.Version) => ({name}: any) =>
    name?.startsWith(`AMM[${v}]`) &&  name.endsWith(`.LP`) || false,
  isRPT: (t: TokenSymbol) => ({name}: any) =>
    name?.startsWith(`${t}.RPT`),
  isRPTPFR: (t: TokenSymbol) => ({name}: any)=>
    name?.startsWith(`${t}.RPT[v2]`),
  /** Matches IDOs by name. */
  isIDO: (v: Launchpad.Version) => ({name}: any) =>
    name?.startsWith(`${Names.Launchpad(v)}.IDO[`),
  isRewardPool: (v: Rewards.Version) => ({name}: any) =>
    name?.includes(`Rewards[${v}]`)
}

export { randomBase64, SecureRandom } from '@hackbg/formati'
export { CustomConsole, bold, colors } from '@hackbg/konzola'
export * from '@fadroma/scrt'
export * from '@fadroma/tokens'
