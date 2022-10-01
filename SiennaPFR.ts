import {
  Address,
  CodeHash,
  Contract,
  Deployment,
  Snip20
} from './Core'
import SiennaTGE from './SiennaTGE'
import {
  Vesting,
  MGMT,
  RPT
} from './Vesting'
import type {
  VestingSchedule,
  VestingAccount
} from './Vesting'
import {
  Rewards
} from './SiennaRewards'
import type {
  RewardsAPIVersion,
  StakingTokens
} from './SiennaRewards'
import {
  Rewards_v4_1
} from './SiennaRewards_v4'
import type SiennaSwap from './SiennaSwap'

export class SiennaPFRInstance extends Vesting {
  /** The incentivized token. */
  token:   Promise<Snip20>
  /** The staked token. */
  staked:  Promise<Snip20>
  /** The incentive token. */
  reward:  Promise<Snip20>
  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt:    Promise<MGMT_PFR>
  /** The deployed RPT contracts, which claim tokens from MGMT
    * and distributes them to the reward pools.  */
  rpts:    Promise<RPT_PFR[]>
  /** The staking pool for this PFR instance.
    * Stake `this.staked` to get rewarded in `this.reward`,
    * either of which may or may not be `this.token` */
  staking: Promise<Rewards_v4_1>

  constructor (
    context:       { amm: { v2: SiennaSwap } },
    public symbol: string     = 'ALTER',
    public amm:    SiennaSwap = context.amm.v2
  ) {
    super(context)

    this.token  = this.tokens.deploy(symbol)

    this.reward = this.token

    let name

    name = `AMM[${amm.version}].SIENNA-${symbol}.LP`
    this.staked  = this.contract({ client: Snip20, name }).get()

    name = `AMM[${amm.version}].SIENNA-${symbol}.LP.Rewards[v4].${symbol}`
    this.staking = this.contract({ client: Rewards_v4_1, name }).get()

    name = `${symbol}.MGMT`
    this.mgmt = this.contract({ client: MGMT_PFR, name }).get()

    this.rpts = this.contract({ client: RPT_PFR })
      .getMany(({name})=>name.startWith(`${symbol}.RPT`))
  }

}

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
  status () {
    return this.config()
  }
}

export class RPT_PFR extends RPT {
  status () {
    return this.configuration()
  }
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
