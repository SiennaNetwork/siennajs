import * as Scrt   from '@fadroma/scrt'
import * as Tokens from '@fadroma/tokens'
import { Deployment } from './Core'
import SiennaTGE, { MGMT, RPT } from './SiennaTGE'
import type { VestingSchedule, VestingAccount } from './SiennaTGE'
import { Rewards } from './SiennaRewards'
import type { RewardsAPIVersion, StakingTokens } from './SiennaRewards'

export default class SiennaPFR<R extends RewardsAPIVersion> extends Deployment {

  constructor (
    options: object = {},
    public rewardsVersion: R|undefined = (options as any)?.rewardsVersion
  ) {
    super(options)
    if (!this.rewardsVersion) throw new Error(`${this.constructor.name}: specify rewardsVersion`)
  }

  vestings: PFRVesting[] = []

  rewardTokens = this.vestings.map(async ({ rewards, lp }: PFRVesting)=>({
    stakedToken: new Tokens.Snip20(this.agent, lp.address, lp.codeHash).populate(),
    rewardToken: new Tokens.Snip20(this.agent, rewards.address, rewards.codeHash).populate()
  }))

  names = {
    tokens:  ({ name }: { name: string }) => `${name}.MockToken`,
    mgmts:   ({ name }: { name: string }) => `${name}.MGMT[v3]`,
    rewards: ({ name }: { name: string }) => `${name}.Rewards[${this.rewardsVersion}]`,
    rpts:    ({ name }: { name: string }) => `${name}.RPT[v2]`
  }

  mgmts = this.vestings.map(this.names.mgmts)
    .map(name=>this.contract({ name, client: MGMT_PFR }))

  rewardPools = this.vestings.map(this.names.rewards)
    .map(name=>this.contract({ name, client: Rewards[this.rewardsVersion!] as any }))

  rpts = this.vestings.map(this.names.rpts)
    .map(name=>this.contract({ name, client: RPT_PFR }))

}

export class SiennaPFRInstance extends SiennaTGE {
  constructor (token: string) {
    super()
    this.names = { token, mgmt: `${token}.MGMT`, rpt: `${token}.RPT` }
  }
}

export interface PFRVesting {
  name:         string
  rewards: {
    name:       string
    address:    Scrt.Address
    codeHash:   Scrt.Address
    decimals:   number
    timekeeper: Scrt.Address
  }
  lp: {
    name:       string
    address:    Scrt.Address
    codeHash:   Scrt.CodeHash
  }
  schedule:     VestingSchedule
  account:      VestingAccount
}

export class MGMT_PFR extends MGMT {
  /** Change the admin of the contract, requires the other user to accept */
  change_admin(new_admin: any) {
    return this.execute({ auth: { change_admin: { address: new_admin } } })
  }
  /** accept becoming an admin */
  accept_admin() {
    return this.execute({ auth: { accept_admin: {} } })
  }
  history(start: number, limit: number) {
    return this.query({ history: { start, limit } })
  }
  config() {
    return this.query({ config: {} })
  }
}

export class RPT_PFR extends RPT {
  configuration() {
    return this.query({ configuration: {} });
  }
  configure(distribution: any, portion: any) {
    return this.execute({ configure: { distribution, portion } });
  }
  vest() {
    return this.execute({ vest: {} });
  }
}
