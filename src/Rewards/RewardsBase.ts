import { Client, ClientConsole, ViewingKeyClient } from '../Core'
import type { Uint128, ContractLink } from '../Core'
import type { Emigration, Immigration } from '../Migration'
import type { RewardPool_v2 } from './Rewards_v2'
import type { RewardPool_v3, RewardPool_v3_1 } from './Rewards_v3'
import type { RewardPool_v4_1 } from './Rewards_v4'
import type { AuthClient } from '../Auth/AuthClient'
import type { LPToken } from '../AMM/AMMLPToken'

/** A reward pool. */
export abstract class RewardPool extends Client {

  log = new ClientConsole(this.constructor.name)

  /** Rewards v1/v2 with the buggy algo. Counts time in blocks. */
  static 'v2':   typeof RewardPool_v2;
  /** Rewards v3 with the fixed algo. Counts time in seconds. */
  static 'v3':   typeof RewardPool_v3;
  /** Rewards v3.1 adds depositing using SNIP20 Send instead of IncreaseAllowance+Transfer. */
  static 'v3.1': typeof RewardPool_v3_1;
  /** Rewards v4 adds admin authentication via AuthProvider. */
  static 'v4.1': typeof RewardPool_v4_1;

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
    throw new Error('Auth provider is only used by Rewards >=4.1');
  }
  /** Point this pool to the governance contract that will be using it for voting power. */
  async setGovernanceLink<T>(link: ContractLink): Promise<T> {
    throw new Error('Governance integration is only available in Rewards >=4.1');
  }
  getEpoch () {
    throw new Error('Not implemented');
  }
  getConfig () {
    throw new Error('Not implemented');
  }
}
