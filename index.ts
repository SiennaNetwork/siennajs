import { Contract, Deployment } from './Core'

import SiennaTGE,     { SiennaSnip20 }      from './SiennaTGE'
import SiennaSwap,    { AMMVersion }        from './SiennaSwap'
import SiennaRewards, { RewardsAPIVersion } from './SiennaRewards'
import SiennaAuth       from './Auth'
import SiennaGovernance from './Poll'
import SiennaLaunch     from './SiennaLaunch'
import SiennaLend       from './SiennaLend'
import SiennaPFR        from './SiennaPFR'

export default class Sienna extends Deployment {

  /** The SIENNA token. */
  get token (): Contract<SiennaSnip20> { return this.tge.token }

  /** The SIENNA Token Generation Event. */
  tge = new SiennaTGE(this as Deployment)

  /** The Sienna Swap AMM. */
  amm = {
    v1: new SiennaSwap(this, 'v1'),
    v2: new SiennaSwap(this, 'v2')
  }

  /** The Sienna Rewards staking system. */
  rewards = {
    v2:   new SiennaRewards(this, 'v2'),
    v3:   new SiennaRewards(this, 'v3'),
    v3_1: new SiennaRewards(this, 'v3.1'),
    v4_1: new SiennaRewards(this, 'v4.1'),
  }

  /** The Sienna Lend lending platform. */
  lend   = new SiennaLend(this, 'v1')

  /** Partner-Funded Rewards: vesting of non-SIENNA tokens. */
  pfr    = new SiennaPFR(this, 'v3.1')

  /** Sienna Governance system. */
  gov    = new SiennaGovernance(this as Deployment)

  /** Sienna Launch: Launchpad/IDO system. */
  launch: SiennaLaunch = new SiennaLaunch(this as Deployment)

  static Auth       = SiennaAuth
  static TGE        = SiennaTGE
  static Swap       = SiennaSwap
  static Rewards    = SiennaRewards
  static Lend       = SiennaLend
  static PFR        = SiennaPFR
  static Governance = SiennaGovernance
  static Launch     = SiennaLaunch

}

export * from './Core'
export * from './Auth'
export * from './Multicall'
export * from './SiennaTGE'
export * from './SiennaSwap'
export * from './SiennaRewards'
export * from './SiennaRewards_v2'
export * from './SiennaRewards_v3'
export * from './SiennaPFR'
export * from './SiennaLend'
export * from './SiennaRewards_v4'
export * from './Poll'
export * from './SiennaLaunch'

export * as VestingConfig from './Vesting'

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
