import * as Scrt from '@fadroma/scrt';
import { Snip20 } from '@fadroma/tokens'
import { randomBase64, SecureRandom } from '@hackbg/formati';
import { linkStruct, linkTuple } from './ICC';
import { AuthClient, AuthMethod } from './Auth';
import { LPToken } from './SiennaSwap';
import { RPT_TGE } from './SiennaTGE';
import type { AMMVersion } from './SiennaSwap';
import type { Rewards_v2 } from './SiennaRewards_v2'
import type { Rewards_v3, Rewards_v3_1 } from './SiennaRewards_v3'
import type { Rewards_v4_1 } from './SiennaRewards_v4'
import type { Emigration, Immigration } from './Migration'
import { Console } from '@hackbg/konzola';
const console = Console('Sienna Rewards');

/** Maybe change this to 'v2'|'v3'|'v4' and simplify the classes below? */
export type RewardsAPIVersion = 'v2' | 'v3' | 'v3.1' | 'v4.1';

export default class RewardsDeployment extends Scrt.VersionedDeployment<RewardsAPIVersion> {

  rpt = this.client(RPT_TGE)
    .called('SIENNA.RPT')
    .expect('Deploy RPT first')

  rewardToken = this.client(Snip20)
    .called('SIENNA')
    .expect('Deploy SIENNA first.')

  rewards = this.clients(Rewards[this.version] as any)
    .select((name: string)=>name.includes('Rewards'))

}


/** Which version of AMM corresponds to which version of rewards. */
export const RewardsToAMMVersion: Record<RewardsAPIVersion, AMMVersion> = {
  'v2':   'v1',
  'v3':   'v2',
  'v3.1': 'v2',
  'v4.1': 'v2',
};

export const now = () => Math.floor(+new Date() / 1000);

/** Universal init parameters for all versions of rewards. */
export interface RewardsInitParams {
  rewardToken:   Scrt.IntoLink;
  stakedToken:   Scrt.IntoLink;
  admin?:        Scrt.Address;
  timekeeper?:   Scrt.Address;
  authProvider?: Scrt.IntoLink;
  threshold?:    number;
  cooldown?:     number;
  bonding?:      number;
  unbonding?:    number;
}

/** A reward pool. */
export abstract class Rewards extends Scrt.Client {

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
  abstract deposit(amount: Scrt.Uint128): Promise<unknown>;
  /** Try to withdraw some amount of staked token. */
  abstract withdraw(amount: Scrt.Uint128): Promise<unknown>;
  /** Try to claim a reward. */
  abstract claim(): Promise<unknown>;

  get vk (): Scrt.ViewingKeyClient {
    const { address, codeHash } = this
    return new Scrt.ViewingKeyClient(this.agent, address, codeHash)
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
  async setGovernanceLink<T>(link: Scrt.ContractLink): Promise<T> {
    throw new Error('Governance integration is only available in Rewards >=4.1');
  }
}

/** Constructs a reward pool of some version. */
export interface RewardsCtor extends Scrt.NewClient<Rewards> {
  /** Generate the correct format of Rewards init message for the given version */
  init(params: RewardsInitParams): Scrt.Message;
}
