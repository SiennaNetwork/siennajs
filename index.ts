import { Rewards }                  from './SiennaRewards'
import { Rewards_v2 }               from './SiennaRewards_v2'
import { Rewards_v3, Rewards_v3_1 } from './SiennaRewards_v3'
import { Rewards_v4_1 }             from './SiennaRewards_v4'
Rewards['v2']   = Rewards_v2
Rewards['v3']   = Rewards_v3
Rewards['v3.1'] = Rewards_v4_1
Rewards['v4.1'] = Rewards_v4_1

import { PatchedSigningCosmWasmClient_1_2 } from '@fadroma/scrt-amino'
import { Deployment, Client, Address, ViewingKey } from '@fadroma/scrt'
import * as Tokens      from '@fadroma/tokens'
import * as Vesting     from './SiennaTGE'
import * as AMM         from './SiennaSwap'
import * as RewardsBase from './SiennaRewards'
import * as Rewards2    from './SiennaRewards_v2'
import * as Rewards3    from './SiennaRewards_v3'
import * as Rewards4    from './SiennaRewards_v4'
import * as Lend        from './SiennaLend'
import * as Auth        from './Auth'
import * as Governance  from './Poll'

import { AuthProvider } from './Auth'
import { Launchpad, IDO } from './SiennaLaunch'
import { RPT_TGE } from './SiennaTGE'
import { Snip20 } from '@fadroma/tokens'

export class SiennaDeployment extends Deployment {
  /** The SIENNA token. */
  get token () { return this.tge.token }
  /** The SIENNA token generation event. */
  tge = new TGEDeployment(this.name, this.state)
  /** The SIENNA Swap AMM. */
  amm: Record<AMM.AMMVersion, AMMDeployment> = {
    v1: new AMMDeployment('v1', this.name, this.state),
    v2: new AMMDeployment('v2', this.name, this.state)
  }
  /** The SIENNA Rewards staking system. */
  rewards: Record<RewardsBase.RewardsAPIVersion, RewardsDeployment> = {
    'v2':   new RewardsDeployment('v2',   this.name, this.state),
    'v3':   new RewardsDeployment('v3',   this.name, this.state),
    'v3.1': new RewardsDeployment('v3.1', this.name, this.state),
    'v4.1': new RewardsDeployment('v4.1', this.name, this.state),
  }
  /** Partner-Funded Rewards: vesting of non-SIENNA tokens. */
  pfr: Record<string, PFRDeployment> = {}
  /** Governance system. */
  governance: GovernanceDeployment = new GovernanceDeployment(this.name, this.state)
  /** Launchpad/IDO system. */
  launchpad:  LaunchpadDeployment  = new LaunchpadDeployment('v1', this.name, this.state)
}

export class TGEDeployment extends Deployment {
  /** The deployed SIENNA SNIP20 token contract. */
  token = this.get('SIENNA').client(Vesting.SiennaSnip20)
  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt  = this.get('SIENNA.MGMT').client(Vesting.MGMT_TGE)
  /** The deployed RPT contract, which claims tokens from MGMT
    * and distributes them to the reward pools.  */
  rpt   = this.get('SIENNA.RPT').client(Vesting.RPT_TGE)
  /** Fetch the current schedule of MGMT. */
  getMgmtSchedule = () =>
    this.mgmt?.then(mgmt=>mgmt.schedule())
  /** Fetch the current schedule of MGMT. */
  getMgmtProgress = (address: Address, key: ViewingKey) =>
    this.mgmt?.then(mgmt=>mgmt.progress(address, key))
  /** Fetch the current status of RPT. */
  getRptStatus = this.subtask(()=>this.rpt?.then(rpt=>rpt.status()))
  /** Update the RPT configuration. */
  setRptConfig (config: Vesting.RPTConfig) { throw 'TODO' }
}

export class AMMDeployment extends Deployment {
  constructor (
    public readonly version: AMM.AMMVersion,
    ...args: ConstructorParameters<typeof Deployment>
  ) {
    super(...args)
  }

  factory    = this.get(`AMM[${this.version}].Factory`).client(AMM.AMMFactory[this.version])
  router     = this.get(`AMM[${this.version}].Router`).client(AMM.AMMRouter)
  exchanges  = this.getAll(this.isExchange).clients(AMM.AMMExchange)
  lpTokens   = this.getAll(this.isLpToken).clients(AMM.LPToken)

  isExchange = (key: string, val: { name: string }) =>
    val.name.startsWith(`AMM[${this.version}]`) && !val.name.endsWith(`.LP`)
  isLpToken  = (key: string, val: { name: string }) =>
    val.name.startsWith(`AMM[${this.version}]`) && val.name.endsWith(`.LP`)
}

export class RewardsDeployment extends Deployment {
  constructor (
    public readonly version: RewardsBase.RewardsAPIVersion,
    ...args: ConstructorParameters<typeof Deployment>
  ) {
    super(...args)
  }

  rewardPools: RewardsBase.Rewards[] = []
}

export class PFRDeployment extends Deployment {
  stakedToken: Tokens.Snip20
  rewardToken: Tokens.Snip20
  /** The deployed SIENNA SNIP20 token contract. */
  vestedToken: Tokens.Snip20
  /** The deployed MGMT contract. */
  mgmt:        Vesting.MGMT_PFR
  /** The deployed RPT contract. */
  rpt:         Vesting.RPT_PFR
  /** The deployed staking pool. */
  rewards:     Rewards3.Rewards_v3_1
}

export class LendDeployment extends Deployment {
  overseer:      Lend.LendOverseer
  interestModel: Lend.LendInterestModel
  market?:       Lend.LendMarket
  oracle?:       Lend.LendOracle
  mockOracle?:   Lend.MockOracle
  token1?:       Tokens.Snip20
}

export class AuthProviderDeployment extends Deployment {
  constructor (
    name:  string,
    state: Receipts,
    public readonly version: 'v1'
    public readonly name
  ) { super(name, state) }

  oracle:   Client
  provider: AuthProvider
}

export class GovernanceDeployment extends Deployment {
  constructor (
    public readonly version: 'v1' = 'v1',
    ...args: ConstructorParameters<typeof Deployment>
  ) {
    super(...args)
  }
  /** The TGE containing the token and RPT used by the deployment. */
  tge       = new TGEDeployment(this.name, this.state)
  /** The token staked in the governance pool. */
  get token (): Promise<Snip20>  { return this.tge.token }
  /** The RPT contract which needs to be reconfigured when we upgrade
    * the staking pool, so that the new pool gets rewards budget. */
  get rpt   (): Promise<RPT_TGE> { return this.tge.rpt   }
  /** The auth provider and oracle used by the deployment. */
  auth      = new AuthProviderDeployment(this.name, this.state, 'v1', 'Launchpad')
  /** The name of the auth group that gives the voting contract
    * access to the balances in the staking contract, which it
    * uses to compute voting power. */
  authGroup = 'Rewards_and_Governance'
  /** The name of the governance staking pool where voting power is accumulated. */
  poolName  = `SIENNA.Rewards[v4]${this.suffix}`
  /** The up-to-date Rewards v4 staking pool with governance support. */
  pool      = this.get(this.poolName).client(Rewards4.Rewards_v4_1)
  /** The name of the governance contract where users vote on proposals. */
  pollsName = `${this.poolName}.Polls[v1]`
  /** The governance voting contract. */
  polls     = this.get(this.pollsName).client(
}

export class LaunchpadDeployment extends Deployment {
  constructor (
    public readonly version: 'v1' = 'v1',
    ...args: ConstructorParameters<typeof Deployment>
  ) {
    super(...args)
  }
  /** The TGE containing the token and RPT used by the deployment. */
  tge = new TGEDeployment(this.name, this.state)
  /** The token staked in the launchpad pool. */
  get token (): Promise<Snip20>  { return this.tge.token }
  /** TODO: What does launchpad use RPT for? */
  get rpt   (): Promise<RPT_TGE> { return this.tge.rpt   }
  /** The auth provider and oracle used by the deployment. */
  auth          = new AuthProviderDeployment(this.name, this.state, 'v1', 'Launchpad')
  /** The name of the launchpad contract. */
  launchpadName = `Launchpad[${this.version}]`
  /** The launchpad contract. */
  launchpad     = this.get(this.launchpadName).client(Launchpad)
  /** Match IDOs by name. */
  isIdo         = (name: string) => name.startsWith(`${this.launchpadName}.IDO[`)
  /** The IDOs. */
  idos          = this.getAll(isIdo).client(IDO)
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
export { PatchedSigningCosmWasmClient_1_2 as PatchedSigningCosmWasmClient }
