import {
  Client,
  ClientConsole,
  ClientConsole,
  VersionedDeployment,
  ViewingKeyClient,
  bold,
  colors,
  linkStruct,
  randomBase64,
} from './Core';
import type {
  Address,
  ClientClass,
  Contract,
  ContractLink,
  Emigration,
  Immigration,
  IntoLink,
  Message,
  Snip20,
  Uint128,
} from './Core';
import { AuthClient, AuthMethod } from './Auth';
import { LPToken } from './SiennaSwap';
import SiennaTGE from './SiennaTGE';
import type { AMMVersion } from './SiennaSwap';
import type { Rewards_v2 } from './SiennaRewards_v2'
import type { Rewards_v3, Rewards_v3_1 } from './SiennaRewards_v3'
import type { Rewards_v4_1 } from './SiennaRewards_v4'

/** Maybe change this to 'v2'|'v3'|'v4' and simplify the classes below? */
export type RewardsAPIVersion = 'v2' | 'v3' | 'v3.1' | 'v4.1';

/** Which version of AMM corresponds to which version of rewards. */
export const RewardsToAMMVersion: Record<RewardsAPIVersion, AMMVersion> = {
  'v2':   'v1',
  'v3':   'v2',
  'v3.1': 'v2',
  'v4.1': 'v2',
};

export default class SiennaRewards extends VersionedDeployment<RewardsAPIVersion> {

  tge = new SiennaTGE(this)

  rewardPools: Promise<Contract<Rewards>[]> = Promise.all(this
    .filter((name: string)=>name.includes('Rewards'))
    .map((receipt: object)=>this.contract(receipt)))

  showStatus = async () => log.rewardsContracts(this.name, this.state)

}

/** Universal init parameters for all versions of rewards. */
export interface RewardsInitParams {
  rewardToken:   IntoLink;
  stakedToken:   IntoLink;
  admin?:        Address;
  timekeeper?:   Address;
  authProvider?: IntoLink;
  threshold?:    number;
  cooldown?:     number;
  bonding?:      number;
  unbonding?:    number;
}

/** A reward pool. */
export abstract class Rewards extends Client {

  log = new ClientConsole(this.constructor.name)

  /** Rewards v1/v2 with the buggy algo. Counts time in blocks. */
  static 'v2':   typeof Rewards_v2;
  /** Rewards v3 with the fixed algo. Counts time in seconds. */
  static 'v3':   typeof Rewards_v3;
  /** Rewards v3.1 adds depositing using SNIP20 Send instead of IncreaseAllowance+Transfer. */
  static 'v3.1': typeof Rewards_v3_1;
  /** Rewards v4 adds admin authentication via AuthProvider. */
  static 'v4.1': typeof Rewards_v4_1;

  /** Get a LPToken interface to the staked token. */
  abstract getStakedToken(): Promise<LPToken | null>;
  /** Deposit some amount of staked token. */
  abstract deposit(amount: Uint128): Promise<unknown>;
  /** Try to withdraw some amount of staked token. */
  abstract withdraw(amount: Uint128): Promise<unknown>;
  /** Try to claim a reward. */
  abstract claim(): Promise<unknown>;

  get vk (): ViewingKeyClient {
    const { address, codeHash } = this
    return new ViewingKeyClient(this.agent, address, codeHash)
  }
  get emigration (): Emigration {
    throw new Error('Migration is only available in Rewards >=3');
  }
  get immigration (): Immigration {
    throw new Error('Migration is only available in Rewards >=3');
  }
  get auth (): AuthClient {
    throw new Error('Auth provider is only available in Rewards >=4.1');
  }
  /** Point this pool to the governance contract that will be using it for voting power. */
  async setGovernanceLink<T>(link: ContractLink): Promise<T> {
    throw new Error('Governance integration is only available in Rewards >=4.1');
  }
}

/** Constructs a reward pool of some version. */
export interface RewardsCtor extends ClientClass<Rewards> {
  /** Generate the correct format of Rewards init message for the given version */
  init(params: RewardsInitParams): Message;
}

export interface StakingTokens {
  stakedToken: Snip20
  rewardToken: Snip20
}

const log = new class SiennaRewardsConsole extends ClientConsole {

  name = 'Sienna Rewards'

  rewardsContracts = (name: string, state: Record<string, any>) => {
    const isRewardPool     = (x: string) => x.startsWith('SiennaRewards_')
    const rewardsContracts = Object.keys(state).filter(isRewardPool)
    if (rewardsContracts.length > 0) {
      this.info(`\nRewards contracts in ${bold(name)}:`)
      for (const name of rewardsContracts) {
        this.info(`  ${colors.green('✓')}  ${name}`)
      }
    } else {
      this.info(`\nNo rewards contracts.`)
    }
    return rewardsContracts
  }

}
