import { Instance } from '@fadroma/scrt'
import { Snip20 } from '@fadroma/tokens'
import { MGMT, MGMT_Vested, RPT, RPT_Vested, RPTConfig } from './SiennaTGE'
import { AMMVersion, AMMRouter, AMMExchanges, AMMFactory } from './SiennaSwap'
import { RewardsAPIVersion, Rewards } from './SiennaRewards'
import { Rewards_v3_1 } from './SiennaRewards_v3'
import { LendOverseer, LendInterestModel, LendMarket, LendOracle, MockOracle } from './SiennaLend'
import { AuthProvider } from './Auth'
import { Poll } from './Poll'
import { Launchpad } from './SiennaLaunch'

export interface Deployment {
  token:      Snip20
  tge:        TGEDeployment
  amm:        Record<AMMVersion, AMMDeployment>
  rewards:    Record<RewardsAPIVersion, RewardsDeployment>
  pfr:        PFRDeployment[]
  governance: GovernanceDeployment
  launchpad:  LaunchpadDeployment
}

export interface TGEDeployment {
  /** The deployed SIENNA SNIP20 token contract. */
  SIENNA: Snip20
  /** The deployed MGMT contract. */
  MGMT:   MGMT
  /** The deployed RPT contract. */
  RPT:    RPT
}

export interface AMMDeployment {
  version:   AMMVersion
  router:    AMMRouter|null
  exchanges: AMMExchanges
  factory:   AMMFactory
}

export interface RewardsDeployment {
  rewards:          Rewards[],
  rewardsRPTConfig: RPTConfig
}

export interface LendDeployment {
  OVERSEER:       LendOverseer
  INTEREST_MODEL: LendInterestModel
  MARKET?:        LendMarket
  ORACLE?:        LendOracle
  MOCK_ORACLE?:   MockOracle
  TOKEN1?:        Snip20
}

/** The tokens for a non-SIENNA vesting. */
export interface RewardsTokens {
  stakedToken: Snip20
  rewardToken: Snip20
}

/** A non-SIENNA vesting. */
export interface PFRDeployment extends RewardsTokens {
  mgmt:    MGMT_Vested
  rpt:     RPT_Vested
  rewards: Rewards_v3_1
}

export interface AuthProviderDeployment {
  authOracle:   Instance
  authProvider: AuthProvider
}

export interface GovernanceDeployment {
  governancePolls: Poll
  governancePool:  Rewards
  governanceToken: Snip20
}

export interface LaunchpadDeployment {
  /** The deployed launchpad contract. */
  launchpad: Launchpad
}
