import { Address, CodeHash, Contract, Deployment, Snip20 } from './Core'
import SiennaTGE, { MGMT, RPT } from './SiennaTGE'
import type { VestingSchedule, VestingAccount } from './SiennaTGE'
import { Rewards } from './SiennaRewards'
import type { RewardsAPIVersion, StakingTokens } from './SiennaRewards'

export default class SiennaPFR extends Deployment {

  constructor (
    options: object = {},
    public rewardsVersion: RewardsAPIVersion|undefined = (options as any)?.rewardsVersion
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

  mgmts: Promise<MGMT_PFR[]> = Promise.all(this.vestings.map(this.names.mgmts)
    .map(name=>this.contract(name).getClient(MGMT_PFR) as Promise<MGMT_PFR>))

  rpts: Promise<RPT_PFR[]> = Promise.all(this.vestings.map(this.names.rpts)
    .map(name=>this.contract(name).getClient(RPT_PFR) as Promise<RPT_PFR>))

  rewardPools: Promise<Rewards[]> = Promise.all(this.vestings.map(this.names.rewards)
    .map(name=>this.contract(name).getClient(Rewards[this.rewardsVersion!]) as Promise<Rewards>))

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
