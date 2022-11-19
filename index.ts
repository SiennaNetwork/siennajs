import { bold, colors } from '@hackbg/konzola'
import type { Address, Snip20, TokenInfo, TokenOptions, Contract } from './Core'
import { Deployment, TokenManager, ClientConsole } from './Core'

import * as Vesting     from './Vesting'
import * as Auth        from './Auth'
import * as AMM         from './AMM'
import * as Multicall   from './Multicall'
import * as Governance  from './Governance'
import * as Lend     from './Lend'
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

export class SiennaDeployment extends Deployment {

  constructor (public context: Deployment) {
    super(context)
  }

  tokens: TokenManager = new TokenManager(this as Deployment)

  /** Sienna Auth: Authentication provider. */
  auth = {
    'v1':   new Auth.Deployment(this, 'v1')
  }

  /** The SIENNA Token Generation Event. */
  tge: Record<Vesting.TGEVersion, Vesting.TGEDeployment> = {
    'v1':   new Vesting.TGEDeployment(this, { version: 'v1' })
  }

  /** The Sienna token. */
  get SIENNA (): Contract<Snip20> {
    return this.tge['v1'].token
  }

  /** The Sienna Swap AMM. */
  amm: Record<AMM.Version, AMM.Deployment> = {
    'v1':   new AMM.Deployment(this, { version: 'v1' }),
    'v2':   new AMM.Deployment(this, { version: 'v2' })
  }

  /** The Sienna Rewards staking system. */
  rewards = {
    'v2':   new Rewards.Deployment(this, { version: 'v2'   }),
    'v3':   new Rewards.Deployment(this, { version: 'v3'   }),
    'v3.1': new Rewards.Deployment(this, { version: 'v3.1' }),
    'v4.1': new Rewards.Deployment(this, { version: 'v4.1' }),
  }

  /** Partner-Funded Rewards: vesting of non-SIENNA tokens. */
  pfr = {
    'v1':   new Vesting.PFRDeployment(this, { version: 'v1' })
  }

  /** The Sienna Lend lending platform. */
  lend = {
    'v1':   new Lend.Deployment(this, 'v1')
  }

  /** Sienna Governance system. */
  governance = {
    'v1':   new Governance.Deployment(this, 'v1')
  }

  /** Sienna Launch: Launchpad/IDO system. */
  launchpad = {
    'v1':   new Launchpad.Deployment(this, 'v1')
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

export default SiennaDeployment

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
