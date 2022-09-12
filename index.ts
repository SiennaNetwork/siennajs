import { Deployment } from './Core'

import SiennaTGE        from './SiennaTGE'
import SiennaSwap,    { AMMVersion }        from './SiennaSwap'
import SiennaRewards, { RewardsAPIVersion } from './SiennaRewards'
import SiennaAuth       from './Auth'
import SiennaGovernance from './Poll'
import SiennaLaunch     from './SiennaLaunch'
import SiennaLend       from './SiennaLend'
import SiennaPFR        from './SiennaPFR'

import { PatchedSigningCosmWasmClient_1_2 } from '@fadroma/scrt-amino'
export { PatchedSigningCosmWasmClient_1_2 as PatchedSigningCosmWasmClient }

export default class Sienna extends Deployment {
  /** The SIENNA token. */
  get token () { return this.tge.token }

  /** The SIENNA Token Generation Event. */
  tge = new SiennaTGE(this)

  /** The Sienna Swap AMM. */
  amm = {
    v1: new SiennaSwap(this, 'v1'),
    v2: new SiennaSwap(this, 'v2')
  }

  /** The Sienna Rewards staking system. */
  rewards = {
    'v2':   new SiennaRewards(this, 'v2'),
    'v3':   new SiennaRewards(this, 'v3'),
    'v3.1': new SiennaRewards(this, 'v3.1'),
    'v4.1': new SiennaRewards(this, 'v4.1'),
  }

  /** The Sienna Lend lending platform. */
  lend = new SiennaLend(this, 'v1')

  /** Partner-Funded Rewards: vesting of non-SIENNA tokens. */
  pfr = new SiennaPFR(this, 'v3.1')

  /** Sienna Governance system. */
  governance = new SiennaGovernance(this)

  /** Sienna Launch: Launchpad/IDO system. */
  launchpad = new SiennaLaunch(this)

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
