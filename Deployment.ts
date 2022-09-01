import * as Fadroma from '@fadroma/scrt'
import * as Tokens  from '@fadroma/tokens'

import * as Vesting    from './SiennaTGE'
import * as AMM        from './SiennaSwap'
import * as Rewards    from './SiennaRewards'
import * as Rewards2   from './SiennaRewards_v2'
import * as Rewards3   from './SiennaRewards_v3'
import * as Rewards4   from './SiennaRewards_v4'
import * as Lend       from './SiennaLend'
import * as Auth       from './Auth'
import * as Governance from './Poll'
import * as Launchpad  from './SiennaLaunch'

export interface SiennaDeployment {
  token:      Tokens.Snip20
  tge:        TGEDeployment
  amm:        Record<AMM.AMMVersion, AMMDeployment>
  rewards:    Record<Rewards.RewardsAPIVersion, RewardsDeployment>
  pfr:        Record<string, PFRDeployment>
  governance: GovernanceDeployment
  launchpad:  LaunchpadDeployment
}

export interface TGEDeployment {
  /** The deployed SIENNA SNIP20 token contract. */
  SIENNA:           Tokens.Snip20
  /** The deployed MGMT contract. */
  MGMT:             Vesting.MGMT
  /** The deployed RPT contract. */
  RPT:              Vesting.RPT

  schedule:  Vesting.VestingSchedule
  rptConfig: Vesting.RPTConfig
}

export interface AMMDeployment {
  version:          AMM.AMMVersion
  router:           AMM.AMMRouter|null
  exchanges:        AMM.AMMExchanges
  factory:          AMM.AMMFactory
}

export interface RewardsDeployment {
  rewards:          Rewards.Rewards[],
  rewardsRPTConfig: Vesting.RPTConfig
}

/** The tokens for a non-SIENNA vesting. */
export interface RewardsTokens {
  stakedToken:      Tokens.Snip20
  rewardToken:      Tokens.Snip20
}

export interface PFRDeployment extends RewardsTokens {
  /** The deployed SIENNA SNIP20 token contract. */
  vestedToken:      Tokens.Snip20
  /** The deployed MGMT contract. */
  mgmt:             Vesting.MGMT_PFR
  /** The deployed RPT contract. */
  rpt:              Vesting.RPT_PFR
  /** The deployed staking pool. */
  rewards:          Rewards3.Rewards_v3_1
}

export interface LendDeployment {
  overseer:         Lend.LendOverseer
  interestModel:    Lend.LendInterestModel
  market?:          Lend.LendMarket
  oracle?:          Lend.LendOracle
  mockOracle?:      Lend.MockOracle
  token1?:          Tokens.Snip20
}

export interface AuthProviderDeployment {
  authOracle:       Fadroma.Client
  authProvider:     Auth.AuthProvider
}

export interface GovernanceDeployment {
  governancePolls:  Governance.Poll
  governancePool:   Rewards4.Rewards_v4_1
  governanceToken:  Tokens.Snip20
}

export interface LaunchpadDeployment {
  /** The deployed launchpad contract. */
  launchpad:        Launchpad.Launchpad
  idos:             Launchpad.IDO[]
}
