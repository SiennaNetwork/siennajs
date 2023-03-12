import {
  Address,
  CodeHash,
  Contract,
  Deployment,
  Snip20
} from './core'

import SiennaTGE from './SiennaTGE'

import {
  VestingSchedule,
  VestingAccount,
  MGMT,
  RPT
} from './Vesting'

import {
  Rewards,
  StakingTokens
} from './SiennaRewards'

import {
  RewardsVersion
} from './Versions'

export default class SiennaPFR extends Deployment {

  constructor (
    options: object = {},
    public rewardsVersion: RewardsVersion|undefined = (options as any)?.rewardsVersion
  ) {
    super(options)
    if (!this.rewardsVersion) throw new Error(`${this.constructor.name}: specify rewardsVersion`)
  }

  vestings: PFRVesting[] = []

  tokenPairs: Promise<StakingTokens[]> = Promise.all(
    this.vestings.map(async ({ rewards, lp }: PFRVesting)=>({
      stakedToken: await new Snip20(this.agent, lp.address, lp.codeHash).populate(),
      rewardToken: await new Snip20(this.agent, rewards.address, rewards.codeHash).populate()
    })))

  names = {
    tokens:  ({ name }: { name: string }) => `${name}.MockToken`,
    mgmts:   ({ name }: { name: string }) => `${name}.MGMT[v3]`,
    rewards: ({ name }: { name: string }) => `${name}.Rewards[${this.rewardsVersion}]`,
    rpts:    ({ name }: { name: string }) => `${name}.RPT[v2]`
  }

  mgmts: Contract<MGMT_PFR>[] = this.vestings.map(this.names.mgmts)
    .map(name=>this.contract({ name, client: MGMT_PFR }))

  rpts: Contract<RPT_PFR>[] = this.vestings.map(this.names.rpts)
    .map(name=>this.contract({ name, client: RPT_PFR }))

  rewardPools: Contract<Rewards>[] = this.vestings.map(this.names.rewards)
    .map(name=>this.contract({ name, client: Rewards[this.rewardsVersion!] as any }))

  showStatus = this.command('status', 'display the status of PFR vestings', async () => {})

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
    address:    Address
    codeHash:   Address
    decimals:   number
    timekeeper: Address
  }
  lp: {
    name:       string
    address:    Address
    codeHash:   CodeHash
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
