import type { TokenSymbol } from '@fadroma/tokens'
import type * as AMM from './AMM/AMM'
import type * as Auth from './Auth/Auth'
import type * as Governance from './Governance/Governance'
import type * as Launchpad from './Launchpad/Launchpad'
import type * as Lend from './Lend/Lend'
import type * as Rewards from './Rewards/Rewards'

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
