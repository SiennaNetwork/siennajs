import * as Fadroma from '@fadroma/scrt'
import { randomBase64 } from '@hackbg/formati';
import { linkStruct } from './ICC'
import { now, Rewards, RewardsInitParams } from './SiennaRewards'
import { LPToken } from './SiennaSwap'
import { Emigration, Immigration } from './Migration'

import { Console } from '@hackbg/konzola';
const console = Console('Sienna Rewards v3+');

export class Rewards_v3 extends Rewards {

  /** Create an init message for Sienna Rewards v3 */
  static init = ({
    rewardToken,
    stakedToken,
    admin,
    timekeeper,
    bonding = 86400,
  }: RewardsInitParams): Fadroma.Message => ({
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
    return new Emigration(this.agent, { address: this.address, codeHash: this.codeHash });
  }
  get immigration (): Immigration {
    return new Immigration(this.agent, { address: this.address, codeHash: this.codeHash });
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
      const opts = {
        address: lp_token.address,
        codeHash: lp_token.code_hash,
      };
      return this.agent!.getClient(LPToken, opts);
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
  lock(amount: string) {
    console.warn(
      '[@sienna/rewards] Deprecation warning: v2 Lock has been renamed to Deposit in v3. ' +
        'It will be gone in 3.1 - plan accordingly.'
    );
    return this.deposit(amount);
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
  drain(snip20: Fadroma.ContractLink, recipient: string, key?: string) {
    return this.execute({ drain: { snip20, recipient, key } });
  }
  set_viewing_key(key: string) {
    return this.execute({ set_viewing_key: { key } });
  }
}

// for now use this for testing only
export class Rewards_v3_1 extends Rewards_v3 {
  async depositToken(
    token: LPToken,
    amount: Fadroma.Uint128,
    from: Fadroma.Address | undefined = this.agent?.address
  ) {
    const callback = { deposit_receiver: { from, amount } };
    return await token.send(amount, this.address, callback);
  }
}

/** Reward pool configuration */
export interface Rewards_v3_Config {
  lp_token?: Fadroma.ContractLink;
  reward_token?: Fadroma.ContractLink;
  reward_vk?: string;
  bonding?: number;
  timekeeper?: Fadroma.Address;
}

export interface Rewards_v3_Clock {
  /** "For what point in time do the reported values hold true?" */
  now: Fadroma.Moment;
  /** "What is the current reward epoch?" */
  number: number;
  /** "When did the epoch last increment?" */
  started: Fadroma.Moment;
  /** "What was the total pool liquidity at the epoch start?" */
  volume: Fadroma.Uint256;
}

export interface Rewards_v3_Total {
  /** What is the current time and epoch? */
  clock: Rewards_v3_Clock;
  /** When was the last time someone staked or unstaked tokens?" */
  updated: Fadroma.Moment;
  /** What liquidity is there in the whole pool right now? */
  staked: Fadroma.Uint128;
  /** What liquidity has this pool contained up to this point? */
  volume: Fadroma.Uint256;
  /** What amount of rewards is currently available for users? */
  budget: Fadroma.Uint128;
  /** What rewards has everyone received so far? */
  distributed: Fadroma.Uint128;
  /** What rewards were unlocked for this pool so far? */
  unlocked: Fadroma.Uint128;
  /** How long must the user wait between claims? */
  bonding: Fadroma.Duration;
  /** Is this pool closed, and if so, when and why? */
  closed?: [Fadroma.Moment, string];
}

/** Account status */
export interface Rewards_v3_Account {
  /** What is the overall state of the pool? */
  total: Rewards_v3_Total;
  /** "When did this user's liquidity amount last change?" Set to current time on update. */
  updated: Fadroma.Moment;
  /** How much time has passed since the user updated their stake? */
  elapsed: Fadroma.Duration;
  /** How much liquidity does this user currently provide? */
  staked: Fadroma.Uint128;
  /** What portion of the pool is currently owned by this user? */
  pool_share: [Fadroma.Uint128, Fadroma.Uint128];
  /** How much liquidity has this user provided since they first appeared? */
  volume: Fadroma.Uint256;
  /** What was the volume of the pool when the user entered? */
  starting_pool_volume: Fadroma.Uint256;
  /** How much liquidity has accumulated in the pool since this user entered? */
  accumulated_pool_volume: Fadroma.Uint256;
  /** What portion of all liquidity accumulated since this user's entry is from this user?  */
  reward_share: [Fadroma.Uint256, Fadroma.Uint256];
  /** How much rewards were already unlocked when the user entered? */
  starting_pool_rewards: Fadroma.Uint128;
  /** How much rewards have been unlocked since this user entered? */
  accumulated_pool_rewards: Fadroma.Uint128;
  /** How much rewards has this user earned? */
  earned: Fadroma.Uint128;
  /** How many units of time (seconds) remain until the user can claim? */
  bonding?: Fadroma.Duration;
}
