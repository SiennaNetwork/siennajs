export * from './core'
import { Contract, Deployment, TokenManager } from './core'

export * from './Vesting'

export * from './SiennaTGE'
import SiennaTGE, { SiennaSnip20 }from './SiennaTGE'

export * from './SiennaPFR'
import SiennaPFR from './SiennaPFR'

export * from './SiennaSwap'
import SiennaSwap from './SiennaSwap'

export * from './Auth'
import SiennaAuth from './Auth'

export * from './SiennaRewards'
export * from './SiennaRewards_v2'
export * from './SiennaRewards_v3'
export * from './SiennaRewards_v4'
import SiennaRewards from './SiennaRewards'

export * from './Poll'
import SiennaGovernance from './Poll'

export * from './SiennaLaunch'
import SiennaLaunch from './SiennaLaunch'

export * from './SiennaLend'
import SiennaLend from './SiennaLend'

export * from './Multicall'

export * from './Versions'

import {
  TGEVersion,
  AuthVersion,
  AMMVersion,
  RewardsVersion,
  LendVersion,
  PFRVersion,
  GovernanceVersion,
  LaunchpadVersion
} from './Versions'

export default class Sienna extends Deployment {

  /** All tokens. */
  tokens = new TokenManager(this as Deployment)

  /** The SIENNA token. */
  get token (): Contract<SiennaSnip20> {
    return this.tge['v1'].token
  }

  /** API for SIENNA Token Generation Event. */
  static TGE = SiennaTGE

  /** Deployments of SIENNA Token Generation Event. */
  tge: Record<TGEVersion, SiennaTGE> = {
    'v1': new SiennaTGE(this as Deployment)
  }

  /** API for SIENNA Authentication Provider. */
  static Auth = SiennaAuth

  /** Deployments of SIENNA Authentication Provider. */
  auth: Record<AuthVersion, SiennaAuth> = {
    'v1': new SiennaAuth(this as Deployment)
  }

  /** API for Sienna Swap. */
  static Swap = SiennaSwap

  /** Deployments of Sienna Swap. */
  amm: Record<AMMVersion, SiennaSwap> = {
    'v1': new SiennaSwap(this, 'v1'),
    'v2': new SiennaSwap(this, 'v2')
  }

  /** API for Sienna Rewards. */
  static Rewards = SiennaRewards

  /** Deployments of Sienna Rewards. */
  rewards: Record<RewardsVersion, SiennaRewards> = {
    'v2':   new SiennaRewards(this, 'v2'),
    'v3':   new SiennaRewards(this, 'v3'),
    'v3.1': new SiennaRewards(this, 'v3.1'),
    'v4.1': new SiennaRewards(this, 'v4.1'),
  }

  /** API for Sienna Lend */
  static Lend = SiennaLend

  /** Deployments of Sienna Lend. */
  lend: Record<LendVersion, SiennaLend> = {
    'v1': new SiennaLend(this, 'v1')
  }

  /** API for Partner-Funded Rewards. */
  static PFR = SiennaPFR

  /** Deployments of Partner-Funded Rewards. */
  pfr: Record<PFRVersion, SiennaPFR> = {
    'v1': new SiennaPFR(this, 'v3.1')
  }

  /** API for Sienna Governance. */
  static Governance = SiennaGovernance

  /** Deployments of Sienna Governance. */
  gov: Record<GovernanceVersion, SiennaGovernance> = {
    'v1': new SiennaGovernance(this as Deployment)
  }

  /** API for Sienna Launchpad. */
  static Launch = SiennaLaunch

  /** Deployments of Sienna Launchpad. */
  launch: Record<LaunchpadVersion, SiennaLaunch> = {
    'v1': new SiennaLaunch(this as Deployment)
  }

}

export {
  SiennaAuth,
  SiennaSwap,
  SiennaGovernance,
  SiennaLaunch,
  SiennaLend,
  SiennaPFR,
  SiennaRewards,
  SiennaTGE
}
