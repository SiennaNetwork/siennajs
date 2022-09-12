import {
  ContractLink,
  Message,
  Uint128,
  linkStruct,
  randomBase64,
  now
} from './Core'
import {
  Rewards,
  RewardsInitParams
} from './SiennaRewards'
import {
  LPToken
} from './SiennaSwap'

export class Rewards_v2 extends Rewards {
  /** Create an init message for Sienna Rewards v2 */
  static init = ({
    admin,
    rewardToken,
    stakedToken,
    threshold = 15940,
    cooldown = 15940,
  }: RewardsInitParams): Message => ({
    admin,
    lp_token:     linkStruct(stakedToken),
    reward_token: linkStruct(rewardToken),
    viewing_key:  randomBase64(64),
    ratio:        ['1', '1'],
    threshold,
    cooldown,
  });
  async getPoolInfo(at = now()) {
    const msg = { pool_info: { at } };
    const result: { pool_info: Rewards_v2_Pool } = await this.query(msg);
    return result.pool_info;
  }
  async getUserInfo(key = '', address = this.agent?.address, at = now()) {
    at = at ?? (await this.agent?.height);
    const msg = { user_info: { address, key, at } };
    const result: { user_info: Rewards_v2_Account } = await this.query(msg);
    return result.user_info;
  }
  async getStakedToken(): Promise<LPToken> {
    const at = Math.floor(+new Date() / 1000);
    const { pool_info } = await this.query({ pool_info: { at } });
    const { address, code_hash } = pool_info.lp_token;
    return new LPToken(this.agent, address, code_hash);
  }
  async getRewardToken() {
    throw new Error('not implemented');
  }
  deposit(amount: string) {
    return this.lock(amount);
  }
  withdraw(amount: string) {
    return this.retrieve(amount);
  }
  lock(amount: string) {
    return this.execute({ lock: { amount } });
  }
  retrieve(amount: string) {
    return this.execute({ retrieve: { amount } });
  }
  set_viewing_key(key: string) {
    return this.execute({ set_viewing_key: { key } });
  }
  claim() {
    return this.execute({ claim: {} });
  }
}

export interface Rewards_v2_Pool {
  lp_token: ContractLink;
  reward_token: ContractLink;
  /** The current reward token balance that this pool has. */
  pool_balance: Uint128;
  /** Amount of rewards already claimed. */
  pool_claimed: Uint128;
  /** How many blocks does the user have to wait
   * before being able to claim again. */
  pool_cooldown: number;
  /** When liquidity was last updated. */
  pool_last_update: number;
  /** The total liquidity ever contained in this pool. */
  pool_lifetime: Uint128;
  /** How much liquidity is there in the entire pool right now. */
  pool_locked: Uint128;
  /** How many blocks does the user need to have provided liquidity for
   * in order to be eligible for rewards. */
  pool_threshold: number;
  /** The time for which the pool was not empty. */
  pool_liquid: Uint128;
}

export interface Rewards_v2_Account {
  /** When liquidity was last updated. */
  pool_last_update: number;
  /** The total liquidity ever contained in this pool. */
  pool_lifetime: Uint128;
  /** How much liquidity is there in the entire pool right now. */
  pool_locked: Uint128;
  /** The time period for which the user has provided liquidity. */
  user_age: number;
  /** How much rewards can the user claim right now. */
  user_claimable: Uint128;
  /** How much rewards has the user ever claimed in total. */
  user_claimed: Uint128;
  /** How many blocks does the user needs to wait before being able to claim again. */
  user_cooldown: number;
  /** How much rewards has the user actually earned in total as of right now. */
  user_earned: Uint128;
  /** When the user's share was last updated. */
  user_last_update?: number | null;
  /** The accumulator for every block since the last update. */
  user_lifetime: Uint128;
  /** The LP token amount that has been locked by this user. */
  user_locked: Uint128;
  /** The user's current share of the pool as a percentage
   * with 6 decimals of precision. */
  user_share: Uint128;
}

Rewards['v2'] = Rewards_v2
