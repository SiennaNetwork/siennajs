import { Address, ContractLink, Duration, Message, Uint128, linkStruct, now } from '../Core'
import { AuthClient } from '../Auth/Auth'
import type { AuthMethod } from '../Auth/Auth'
import { RewardPool, InitParams } from './Rewards'
import { RewardPool_v3_1, Rewards_v3_Account, Rewards_v3_Total } from './Rewards_v3'

export class RewardPool_v4_1 extends RewardPool_v3_1 {

  /** Create an init message for Sienna Rewards v4 */
  static init({
    authProvider,
    rewardToken,
    stakedToken,
    bonding   = 86400,
    unbonding = 86400
  }: InitParams): Message {
    if (!authProvider) {
      throw new Error('Pass authProvider')
    }
    return {
      provider:           linkStruct(authProvider),
      config: {
        reward_token:     linkStruct(rewardToken),
        lp_token:         linkStruct(stakedToken),
        bonding_period:   bonding,
        unbonding_period: unbonding,
      },
    };
  }

  get auth (): AuthClient {
    return new AuthClient(this.agent, this.address, this.codeHash)
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

  async getUserInfo(key = '', address = this.agent?.address, at = now()): Promise<Rewards_v4_Account> {
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

  async getBondingBalances(auth_method: AuthMethod<RewardsPermissions>, at: number = now()) {
    const result: {
      rewards: { all_balances: Rewards_v4_BondingBalances };
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
export interface RewardsToggle {
  bonded: boolean;
  unbonding: boolean;
}
export interface Rewards_v4_Account extends Rewards_v3_Account {
  /** How much total liquidity does this user provide. */
  balance: Uint128;
  /** The part of the user's stake that is counted for rewards. */
  staked:  Uint128;
  /** How many units of time (seconds) remain until the user can claim?
    * Replaces "bonding" in v3, bonding is now something else. */
  claim_countdown: Duration;
}
export interface Rewards_v4_BondingBalances {
  /** How much is deposited by the user */
  balance:   Uint128;
  /** How much the user has staked which is valid for rewards */
  staked:    Uint128;
  /** How much is currently bonding for the user */
  bonding:   Uint128;
  /** How much is currently bonded for the user */
  bonded:    Uint128;
  /** How much is the process of being unbonded, total */
  unbonding: Uint128;
  /** How much has been unbonded and is ready for withdrawing  */
  unbonded:  Uint128;
  /** All of the entries for bonding and unbonding */
  history:   Rewards_v4_HistoryEntry[];
}
export interface Rewards_v4_HistoryEntry {
  // the type of bonding
  bonding_type: 'bonding' | 'unbonding';
  // When it started
  timestamp: number;
  // How many tokens
  amount: Uint128;
}
enum RewardsPermissions {
  UserInfo = 'user_info',
  Balance = 'balance',
}
