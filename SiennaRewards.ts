import { Console } from '@hackbg/konzola';
import { randomBase64, SecureRandom } from '@hackbg/formati';
import * as Fadroma from '@fadroma/scrt';
import {
  Address,
  Client,
  ContractLink,
  Duration,
  Moment,
  Uint128,
  Uint256,
  Instance,
  Message,
  ViewingKeyClient
} from '@fadroma/scrt';
import { linkStruct, linkTuple } from './ICC';
import { AuthClient, AuthMethod } from './Auth';
import { LPToken } from './SiennaSwap';
import type { AMMVersion } from './SiennaSwap';
/** Maybe change this to 'v2'|'v3'|'v4' and simplify the classes below? */
export type RewardsAPIVersion = 'v2' | 'v3' | 'v3.1' | 'v4.1';
/** Which version of AMM corresponds to which version of rewards. */
export const RewardsToAMMVersion: Record<RewardsAPIVersion, AMMVersion> = {
  v2: 'v1',
  v3: 'v2',
  'v3.1': 'v2',
  'v4.1': 'v2',
};
type Link = { address: string; code_hash: string };
const console = Console('Sienna Rewards');
const now = () => Math.floor(+new Date() / 1000);
/** Constructs a reward pool of some version. */
export interface RewardsCtor extends Fadroma.ClientCtor<Rewards, Fadroma.ClientOpts> {
  /** Generate the correct format of Rewards init message for the given version */
  init(params: RewardsInitParams): Message;
}
/** Universal init parameters for all versions of rewards. */
export interface RewardsInitParams {
  rewardToken: Instance;
  stakedToken: Instance;
  admin?: Address;
  timekeeper?: Address;
  authProvider?: Instance;
  threshold?: number;
  cooldown?: number;
  bonding?: number;
}
/** A reward pool. */
export abstract class Rewards extends Client {
  /** Rewards v1/v2 with the buggy algo. Counts time in blocks. */
  static 'v2': typeof Rewards_v2;
  /** Rewards v3 with the fixed algo. Counts time in seconds. */
  static 'v3': typeof Rewards_v3;
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
    return new ViewingKeyClient(this.agent, { address: this.address, codeHash: this.codeHash })
  }
  get auth (): AuthClient {
    throw new Error('Auth provider is only available in Rewards >=4.1');
  }
  get emigration (): Emigration {
    throw new Error('Migration is only available in Rewards >=3');
  }
  get immigration (): Immigration {
    throw new Error('Migration is only available in Rewards >=3');
  }
  /** Point this pool to the governance contract that will be using it for voting power. */
  async setGovernanceLink<T>(link: ContractLink): Promise<T> {
    throw new Error('Governance integration is only available in Rewards >=4.1');
  }
}
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
    lp_token: linkStruct(stakedToken),
    reward_token: linkStruct(rewardToken),
    viewing_key: randomBase64(64),
    ratio: ['1', '1'],
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
    return new LPToken(this.agent, { address, codeHash: code_hash });
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
export class Rewards_v3 extends Rewards {
  static init = ({
    rewardToken,
    stakedToken,
    admin,
    timekeeper,
    bonding = 86400,
  }: RewardsInitParams): Message => ({
    admin,
    config: {
      rewards_vk: randomBase64(36),
      lp_token: linkStruct(stakedToken),
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
  drain(snip20: Link, recipient: string, key?: string) {
    return this.execute({ drain: { snip20, recipient, key } });
  }
  set_viewing_key(key: string) {
    return this.execute({ set_viewing_key: { key } });
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
  bonding: Duration;
}
// for now use this for testing only
export class Rewards_v3_1 extends Rewards_v3 {
  async depositToken(
    token: LPToken,
    amount: Uint128,
    from: Address | undefined = this.agent?.address
  ) {
    const callback = { deposit_receiver: { from, amount } };
    return await token.send(amount, this.address, callback);
  }
}
export class Rewards_v4_1 extends Rewards_v3_1 {
  /** Create an init message for Sienna Rewards v4 */
  static init({
    authProvider,
    rewardToken,
    stakedToken,
    bonding = 86400,
  }: RewardsInitParams): Message {
    if (!authProvider) {
      throw new Error('Pass authProvider')
    }
    return {
      provider:         linkStruct(authProvider),
      config: {
        reward_token:   linkStruct(rewardToken),
        lp_token:       linkStruct(stakedToken),
        bonding_period: bonding,
      },
    };
  }

  get auth (): AuthClient {
    return new AuthClient(this.agent, { address: this.address, codeHash: this.codeHash })
  }

  async setGovernanceLink<T>(link: ContractLink): Promise<T> {
    return (await this.execute({ rewards: { configure: { governance: link } } })) as T;
  }

  async getConfig() {
    const result: { rewards: { config: Rewards_v4_Config } } = await this.query({
      rewards: 'config',
    });
    return result.rewards.config;
  }

  async getAccount(auth: AuthMethod<RewardsPermissions>, at: number = now()) {
    const msg = { rewards: { user_info: { auth, at } } };
    const result: { rewards: { user_info: Rewards_v4_Account } } = await this.query(msg);
    return result.rewards.user_info;
  }

  async getUserInfo(key = '', address = this.agent?.address, at = now()) {
    // Cant change signature to throw error when address is not provided
    const auth_method: AuthMethod<RewardsPermissions> = {
      viewing_key: { address: address ?? '', key },
    };
    const msg = { rewards: { user_info: { at, auth_method } } };
    const result: { rewards: { user_info: Rewards_v4_Account } } = await this.query(msg);
    return result.rewards.user_info;
  }

  async getBalance(
    auth_method: AuthMethod<RewardsPermissions>,
    address = this.agent?.address,
    at      = now()
  ) {
    const result: {
      rewards: { balance: { amount: Uint128 } }
    } = await this.query({
      rewards: { balance: { address, auth_method } },
    });
    return result.rewards.balance;
  }

  async getAllBalances(auth_method: AuthMethod<RewardsPermissions>, at: number = now()) {
    const result: {
      rewards: { all_balances: Rewards_v4_AllBalances };
    } = await this.query({
      rewards: { all_balances: { at, auth_method } },
    });
    return result.rewards.all_balances;
  }

  unbond(amount: Uint128) {
    return this.execute({
      rewards: { unbond: { amount } },
    });
  }
}
/** Reward pool configuration */
export interface Rewards_v4_Config {
  lp_token?: ContractLink;
  reward_token?: ContractLink;
  reward_vk?: string;
  claim_throttle?: number;
  timekeeper?: Address;
  bonding_period?: number;
  unbonding_period?: number;
  governance?: ContractLink;
  rewards_toggle: RewardsToggle;
}
export interface Rewards_v4_Account {
  /** What is the overall state of the pool? */
  total: Rewards_v3_Total;
  /** "When did this user's liquidity amount last change?" Set to current time on update. */
  updated: Moment;
  /** How much time has passed since the user updated their stake? */
  elapsed: Duration;
  /** How much liquidity does this user currently provide which is valid for rewards? */
  staked: Uint128;
  /** How much total liquidity does this user provide.  */
  total_staked: Uint128;
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
  bonding: Duration;
}

export interface Rewards_v4_HistoryEntry {
  // the type of bonding
  bonding_type: 'bonding' | 'unbonding';
  // When it started
  timestamp: number;
  // How many tokens
  amount: Uint128;
}

export interface Rewards_v4_AllBalances {
  /** How much is currently bonded for the user */
  bonded: Uint128;
  /** How much is the process of being unbonded, total */
  unbonding: Uint128;
  /** How much has been unbonded and is ready for withdrawing  */
  unbonded: Uint128;
  /** The total amount of tokens (including bonded and unbonding) that the user has  */
  total_staked: Uint128;
  /** All of the entries for bonding and unbonding */
  entries: Rewards_v4_HistoryEntry[];
  /** How much the user has staked which is valid for rewards */
  staked: Uint128;
}
export interface RewardsToggle {
  bonded: boolean;
  unbonding: boolean;
}
enum RewardsPermissions {
  UserInfo = 'user_info',
  Balance = 'balance',
}

Rewards['v2'] = Rewards_v2;
Rewards['v3'] = Rewards_v3;
Rewards['v3.1'] = Rewards_v3_1;
Rewards['v4.1'] = Rewards_v4_1;

export class Emigration extends Client {
  enableTo(link: Link) {
    return this.execute({ emigration: { enable_migration_to: link } });
  }
  disableTo(link: Link) {
    return this.execute({ emigration: { disable_migration_to: link } });
  }
}

export class Immigration extends Client {
  enableFrom(link: Link) {
    return this.execute({ immigration: { enable_migration_from: link } });
  }
  disableFrom(link: Link) {
    return this.execute({ immigration: { disable_migration_from: link } });
  }
  migrateFrom(link: Link) {
    return this.execute({ immigration: { request_migration: link } });
  }
}
