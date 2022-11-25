import { bold, colors } from '@hackbg/konzola'
import type { Address, Snip20, Token, TokenInfo, TokenOptions, Contract } from './Core'
import { Deployment, TokenManager, ClientConsole } from './Core'

import * as Vesting     from './Vesting'
import * as Auth        from './Auth'
import * as AMM         from './AMM'
import * as Multicall   from './Multicall'
import * as Governance  from './Governance'
import * as Lend        from './Lend'
import * as Launchpad   from './Launchpad'
import * as Rewards     from './Rewards'
import { RewardPool_v2 }   from './Rewards_v2'
import { RewardPool_v3 }   from './Rewards_v3'
import { RewardPool_v3_1 } from './Rewards_v3'
import { RewardPool_v4_1 } from './Rewards_v4'
Rewards.RewardPool['v2']   = RewardPool_v2
Rewards.RewardPool['v3']   = RewardPool_v3
Rewards.RewardPool['v3.1'] = RewardPool_v3_1
Rewards.RewardPool['v4.1'] = RewardPool_v4_1

export interface Settings {
  amm:         AMM.Settings
  auth:        Auth.Settings
  governance:  Governance.Settings
  rewardPairs: Record<string, number>
  schedule:    Vesting.Schedule
  swapPairs:   Array<string>
  swapTokens:  Record<string, Partial<Snip20>>
  swapRoutes:  { tokens: Array<Token> }
  vesting:     Vesting.PFRConfig[]
  timekeeper:  Address
  launchpad:   Launchpad.Settings
}

export class Sienna extends Deployment {

  tokens:     TokenManager

  /** Sienna Auth: Authentication provider. */
  auth:       Record<Auth.Version,       Auth.Deployment>

  /** The SIENNA Token Generation Event. */
  tge:        Record<Vesting.TGEVersion, Vesting.TGEDeployment>

  /** The Sienna Swap AMM. */
  amm:        Record<AMM.Version,        AMM.Deployment>

  /** The Sienna Rewards staking system. */
  rewards:    Record<Rewards.Version,    Rewards.Deployment>

  /** Partner-Funded Rewards: vesting of non-SIENNA tokens. */
  pfr:        Record<Vesting.PFRVersion, Vesting.PFRDeployment>

  /** The Sienna Lend lending platform. */
  lend:       Record<Lend.Version,       Lend.Deployment>

  /** Sienna Governance system. */
  governance: Record<Governance.Version, Governance.Deployment>

  /** Sienna Launch: Launchpad/IDO system. */
  launchpad:  Record<Launchpad.Version,  Launchpad.Deployment>

  constructor (public context: Deployment, public settings: Settings) {
    super(context)
    this.tokens = new TokenManager(this as Deployment)
    this.auth = {
      'v1': new Auth.Deployment(this, 'v1')
    }
    this.tge = {
      'v1': new Vesting.TGEDeployment(this, {
        version: 'v1'
      })
    }
    this.amm = {
      'v1': new AMM.Deployment(this, {
        version: 'v1'
      }),
      'v2': new AMM.Deployment(this, {
        version: 'v2'
      })
    }
    this.rewards = {
      'v2':   new Rewards.Deployment(this, {
        version: 'v2'
      }),
      'v3':   new Rewards.Deployment(this, {
        version: 'v3'
      }),
      'v3.1': new Rewards.Deployment(this, {
        version: 'v3.1'
      }),
      'v4.1': new Rewards.Deployment(this, {
        version: 'v4.1'
      }),
    }
    this.pfr = {
      'v1': new Vesting.PFRDeployment(this, {
        version: 'v1'
      })
    }
    this.lend = {
      'v1': new Lend.Deployment(this, {
        version: 'v1'
      })
    }
    this.governance = {
      'v1': new Governance.Deployment(this, 'v1')
    }
    this.launchpad = {
      'v1': new Launchpad.Deployment(this, 'v1')
    }
  }

  /** The Sienna token. */
  get SIENNA (): Contract<Snip20> {
    return this.tge['v1'].token
  }

  async showStatus () {
    await this.tge['v1'].showStatus()
    await this.amm['v2'].showStatus()
    await this.rewards['v2'].showStatus()
    await this.rewards['v3'].showStatus()
    await this.rewards['v3.1'].showStatus()
    await this.rewards['v4.1'].showStatus()
    await this.pfr['v1'].showStatus()
    await this.lend['v1'].showStatus()
    await this.governance['v1'].showStatus()
    await this.launchpad['v1'].showStatus()
  }
}

export default Sienna

export * from './Core'

export {
  Auth,
  AMM,
  Multicall,
  Vesting,
  Rewards,
  Governance,
  Lend,
  Launchpad
}
