import { Deployment } from '@fadroma/scrt'
import AMMDeployment, { AMMVersion } from './SiennaSwap'
import GovernanceDeployment from './Poll'
import LaunchpadDeployment from './SiennaLaunch'
import LendDeployment from './SiennaLend'
import PFRDeployments from './SiennaPFR'
import RewardsDeployment, { RewardsAPIVersion } from './SiennaRewards'
import TGEDeployment from './SiennaTGE'

import { PatchedSigningCosmWasmClient_1_2 } from '@fadroma/scrt-amino'
export { PatchedSigningCosmWasmClient_1_2 as PatchedSigningCosmWasmClient }

export default class SiennaDeployment extends Deployment {
  /** The SIENNA token. */
  get token () { return this.tge.token }

  /** The SIENNA Token Generation Event. */
  tge =        new TGEDeployment(             this.name, this.state)

  /** The Sienna Swap AMM. */
  amm: Record<AMMVersion, AMMDeployment> = {
    v1:        new AMMDeployment('v1',        this.name, this.state),
    v2:        new AMMDeployment('v2',        this.name, this.state)
  }

  /** The Sienna Rewards staking system. */
  rewards: Record<RewardsAPIVersion, RewardsDeployment> = {
    'v2':      new RewardsDeployment('v2',    this.name, this.state),
    'v3':      new RewardsDeployment('v3',    this.name, this.state),
    'v3.1':    new RewardsDeployment('v3.1',  this.name, this.state),
    'v4.1':    new RewardsDeployment('v4.1',  this.name, this.state),
  }

  /** The Sienna Lend lending platform. */
  lend       = new LendDeployment('v1',       this.name, this.state)

  /** Partner-Funded Rewards: vesting of non-SIENNA tokens. */
  pfr        = new PFRDeployments('v3.1',     this.name, this.state)

  /** Sienna Governance system. */
  governance = new GovernanceDeployment('v1', this.name, this.state)

  /** Sienna Launch: Launchpad/IDO system. */
  launchpad  = new LaunchpadDeployment('v1',  this.name, this.state)
}

export * from './Core'
export * from './Auth'
export * from './SiennaTGE'
export * from './SiennaSwap'
export * from './SiennaRewards'
export * from './SiennaRewards_v2'
export * from './SiennaRewards_v3'
export * from './SiennaRewards_v4'
export * from './SiennaLend'
export * from './SiennaLaunch'
export * from './Poll'
export * from './Pagination'
export * from './Multicall'
