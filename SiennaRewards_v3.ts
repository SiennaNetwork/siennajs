import {
  now,
  randomBase64,
  Emigration,
  Immigration,
  linkStruct
} from './Core'
import type {
  Address,
  ContractLink,
  Duration,
  Message,
  Moment,
  Uint128,
  Uint256
} from './Core'
import { Rewards, RewardsInitParams } from './SiennaRewards'
import { LPToken } from './SiennaSwap'

export class Rewards_v3 extends Rewards {

  /** Create an init message for Sienna Rewards v3 */
  static init = ({
    rewardToken,
    stakedToken,
    admin,
    timekeeper,
    bonding = 86400,
  }: RewardsInitParams): Message => ({
    admin,
    config: {
      rewards_vk:   randomBase64(36),
      lp_token:     linkStruct(stakedToken),
      reward_token: linkStruct(rewardToken),
      timekeeper,
      bonding,
    },
  });

  get emigration (): Emigration {
    return new Emigration(this.agent, this.address, this.codeHash);
  }
  get immigration (): Immigration {
    return new Immigration(this.agent, this.address, this.codeHash);
  }
  async getConfig() {
    const result: { rewards: { config: Rewards_v3_Config } } = await this.query({
      rewards: 'config',
    });
    return result.rewards.config;
  }
  async getStakedToken() {
    const { lp_token } = await this.getConfig();
    if (lp_token) {
      return this.agent!.getClient(LPToken, lp_token.address, lp_token.code_hash);
    } else {
      return null;
    }
  }
  setStakedToken(address: string, code_hash: string) {
    return this.execute({
      rewards: { configure: { lp_token: { address, code_hash } } },
    });
  }
  async getRewardToken() {
    throw new Error('not implemented');
  }
  async getPoolInfo(at = Math.floor(+new Date() / 1000)) {
    const msg = { rewards: { pool_info: { at } } };
    const result: { rewards: { pool_info: Rewards_v3_Total } } = await this.query(msg);
    return result.rewards.pool_info;
  }
  async getEpoch(): Promise<number> {
    const {
      clock: { number },
    } = await this.getPoolInfo();
    return number;
  }
  async beginNextEpoch() {
    const {
      clock: { number },
    } = await this.getPoolInfo();
    return this.execute({ rewards: { begin_epoch: number + 1 } });
  }
  async getUserInfo(key = '', address = this.agent?.address, at = now()) {
    const msg = { rewards: { user_info: { address, key, at } } };
    const result: { rewards: { user_info: Rewards_v3_Account } } = await this.query(msg);
    return result.rewards.user_info;
  }
  deposit(amount: string) {
    return this.execute({
      rewards: { deposit: { amount } },
    });
  }
  claim() {
    return this.execute({
      rewards: { claim: {} },
    });
  }
  close(message: string) {
    return this.execute({
      rewards: { close: { message } },
    });
  }
  withdraw(amount: string) {
    return this.execute({
      rewards: { withdraw: { amount } },
    });
  }
  drain(snip20: ContractLink, recipient: string, key?: string) {
    return this.execute({ drain: { snip20, recipient, key } });
  }
  set_viewing_key(key: string) {
    return this.execute({ set_viewing_key: { key } });
  }
  lock (amount: string) {
    throw new Error('lock is deprecated, use deposit or depositToken')
  }
  retrieve (amount: string) {
    throw new Error('retrieve is deprecated, use withdraw')
  }
}

// for now use this for testing only
export class Rewards_v3_1 extends Rewards_v3 {
  async depositToken(
    token: LPToken,
    amount: Uint128,
    from: Address | undefined = this.agent?.address
  ) {
    const callback = { deposit_receiver: { from, amount } };
    return await token.send(amount, this.address!, callback);
  }
}

/** Reward pool configuration */
export interface Rewards_v3_Config {
  lp_token?: ContractLink;
  reward_token?: ContractLink;
  reward_vk?: string;
  bonding?: number;
  timekeeper?: Address;
}

export interface Rewards_v3_Clock {
  /** "For what point in time do the reported values hold true?" */
  now: Moment;
  /** "What is the current reward epoch?" */
  number: number;
  /** "When did the epoch last increment?" */
  started: Moment;
  /** "What was the total pool liquidity at the epoch start?" */
  volume: Uint256;
}

export interface Rewards_v3_Total {
  /** What is the current time and epoch? */
  clock: Rewards_v3_Clock;
  /** When was the last time someone staked or unstaked tokens?" */
  updated: Moment;
  /** What liquidity is there in the whole pool right now? */
  staked: Uint128;
  /** What liquidity has this pool contained up to this point? */
  volume: Uint256;
  /** What amount of rewards is currently available for users? */
  budget: Uint128;
  /** What rewards has everyone received so far? */
  distributed: Uint128;
  /** What rewards were unlocked for this pool so far? */
  unlocked: Uint128;
  /** How long must the user wait between claims? */
  bonding: Duration;
  /** Is this pool closed, and if so, when and why? */
  closed?: [Moment, string];
}

/** Account status */
export interface Rewards_v3_Account {
  /** What is the overall state of the pool? */
  total: Rewards_v3_Total;
  /** "When did this user's liquidity amount last change?" Set to current time on update. */
  updated: Moment;
  /** How much time has passed since the user updated their stake? */
  elapsed: Duration;
  /** How much liquidity does this user currently provide? */
  staked: Uint128;
  /** What portion of the pool is currently owned by this user? */
  pool_share: [Uint128, Uint128];
  /** How much liquidity has this user provided since they first appeared? */
  volume: Uint256;
  /** What was the volume of the pool when the user entered? */
  starting_pool_volume: Uint256;
  /** How much liquidity has accumulated in the pool since this user entered? */
  accumulated_pool_volume: Uint256;
  /** What portion of all liquidity accumulated since this user's entry is from this user?  */
  reward_share: [Uint256, Uint256];
  /** How much rewards were already unlocked when the user entered? */
  starting_pool_rewards: Uint128;
  /** How much rewards have been unlocked since this user entered? */
  accumulated_pool_rewards: Uint128;
  /** How much rewards has this user earned? */
  earned: Uint128;
  /** How many units of time (seconds) remain until the user can claim? */
  bonding?: Duration;
}

Rewards['v3']   = Rewards_v3
Rewards['v3.1'] = Rewards_v3_1
