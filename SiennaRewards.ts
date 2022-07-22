import {
    Address,
    Client,
    ContractLink,
    Duration,
    Moment,
    Uint128,
    Uint256,
} from '@fadroma/client';
import { ViewingKeyClient } from '@fadroma/client-scrt';
import { Console } from '@hackbg/konzola';
import { AuthMethod } from './Auth';
import { LPToken } from './SiennaSwap';

export type RewardsAPIVersion = 'v2' | 'v3';

type Link = { address: string; code_hash: string };

const console = Console('Sienna Rewards');

const now = () => Math.floor(+new Date() / 1000);

// The `set*Client methods` refresh the sub-client after calling populate()
// so that the subclients automatically get the correct codehash/id/label.

export abstract class Rewards extends Client {

    vk = this.setVKClient()

    setVKClient () {
        return new ViewingKeyClient(this.agent, {
            address: this.address,
            codeHash: this.codeHash,
        })
    };

    async populate () {
        await super.populate()
        this.setVKClient()
        return this
    }

    abstract getStakedToken(): Promise<LPToken | null>;

    static 'v2' = class Rewards_v2 extends Rewards {
        async getPoolInfo(at = now()) {
            const result: { pool_info: Rewards_v2_Pool } = await this.query({
                pool_info: { at },
            });
            return result.pool_info;
        }

        async getUserInfo(key = '', address = this.agent.address, at = now()) {
            at = at || (await this.agent.height);
            const result: { user_info: Rewards_v2_Account } = await this.query({
                user_info: { address, key, at },
            });
            return result.user_info;
        }

        async getStakedToken() {
            const at = Math.floor(+new Date() / 1000);
            const { pool_info } = await this.query({ pool_info: { at } });
            const { address, code_hash } = pool_info.lp_token;
            return new LPToken(this.agent, { address, codeHash: code_hash });
        }

        async getRewardToken() {
            throw new Error('not implemented');
        }

        lock(amount: string) {
            return this.execute({ lock: { amount } });
        }

        retrieve(amount: string) {
            return this.execute({ retrieve: { amount } });
        }

        claim() {
            return this.execute({ claim: {} });
        }

        set_viewing_key(key: string) {
            return this.execute({ set_viewing_key: { key } });
        }
    };

    static 'v3' = class Rewards_v3 extends Rewards {
        async getConfig() {
            const result: { rewards: { config: Rewards_v3_Config } } =
                await this.query({ rewards: 'config' });
            return result.rewards.config;
        }

        async getStakedToken() {
            const { lp_token } = await this.getConfig();
            if (lp_token) {
                const opts = {
                    address: lp_token.address,
                    codeHash: lp_token.code_hash,
                };
                return this.agent.getClient(LPToken, opts);
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
            const result: { rewards: { pool_info: Rewards_v3_Total } } =
                await this.query(msg);
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

        async getUserInfo(key = '', address = this.agent.address, at = now()) {
            const msg = { rewards: { user_info: { address, key, at } } };
            const result: { rewards: { user_info: Rewards_v3_Account } } =
                await this.query(msg);
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

        emigration = this.setEmigrationClient();

        setEmigrationClient () {
            return new Emigration(this.agent, {
                address: this.address,
                codeHash: this.codeHash,
            })
        }

        async populate () {
            await super.populate()
            this.setEmigrationClient()
            return this
        }
    };

    // for now use this for testing only
    static 'v3.1' = class Rewards_v3_1 extends Rewards['v3'] {

        immigration = this.setImmigrationClient();

        setImmigrationClient () {
            return new Immigration(this.agent, {
                address: this.address,
                codeHash: this.codeHash,
            })
        }

        async populate () {
            await super.populate()
            this.setImmigrationClient()
            return this
        }

        async depositToken (
            token: LPToken,
            amount: Uint128,
            from: Address|undefined = this.agent.address
        ) {
            const callback = { deposit_receiver: { from, amount } }
            return await token.send(amount, this.address, callback)
        }

    };

    static 'v4.1' = class Rewards_v4_1 extends Rewards['v3.1'] {
        setGovernanceLink(link: ContractLink) {
            return this.execute({
                rewards: { configure: { governance: link } },
            });
        }

        async getConfig() {
            const result: { rewards: { config: Rewards_v4_Config } } =
                await this.query({ rewards: 'config' });
            return result.rewards.config;
        }

        async getAccount(
            auth: AuthMethod<RewardsPermissions>,
            at: number = now()
        ) {
            const msg = { rewards: { user_info: { auth, at } } };
            const result: { rewards: { user_info: Rewards_v4_Account } } =
                await this.query(msg);
            return result.rewards.user_info;
        }

        async getUserInfo(key = '', address = this.agent.address, at = now()) {
            // Cant change signature to throw error when address is not provided
            const auth_method: AuthMethod<RewardsPermissions> = {
                viewing_key: { address: address ?? '', key },
            };
            const msg = { rewards: { user_info: { at, auth_method } } };
            const result: { rewards: { user_info: Rewards_v3_Account } } =
                await this.query(msg);
            return result.rewards.user_info;
        }

        async getAllBalances(
            auth: AuthMethod<RewardsPermissions>,
            at: number = now()
        ) {
            const result: {
                rewards: { all_balances: Rewards_v4_AllBalances };
            } = await this.query({
                rewards: { all_balances: { at, auth } },
            });

            return result.rewards.all_balances;
        }
    };
}

export class Emigration extends Client {
    enableTo(link: Link) {
        return this.execute({
            emigration: { enable_migration_to: link },
        });
    }

    disableTo(link: Link) {
        return this.execute({
            emigration: { disable_migration_to: link },
        });
    }
}

export class Immigration extends Client {
    enableFrom(link: Link) {
        return this.execute({
            immigration: { enable_migration_from: link },
        });
    }

    disableFrom(link: Link) {
        return this.execute({
            immigration: { disable_migration_from: link },
        });
    }

    migrateFrom(link: Link) {
        return this.execute({
            immigration: { request_migration: link },
        });
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

/** Reward pool configuration */
export interface Rewards_v3_Config {
    lp_token?: ContractLink;
    reward_token?: ContractLink;
    reward_vk?: string;
    bonding?: number;
    timekeeper?: Address;
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
    /**
     * 
     How much is currently bonded for the user
     *  */
    bonded: Uint128;
    /**
     How much is the process of being unbonded, total
     *  */
    unbonding: Uint128;
    /**
    How much has been unbonded and is ready for withdrawing
     *  */
    unbonded: Uint128;
    /**
    The total amount of tokens (including bonded and unbonding) that the user has
     *  */
    total_staked: Uint128;
    /**
    All of the entries for bonding and unbonding
     *  */
    entries: Rewards_v4_HistoryEntry[];
    /**
    How much the user has staked which is valid for rewards
     *  */
    staked: Uint128;
}

enum RewardsPermissions {
    UserInfo = 'user_info',
    Balance = 'balance',
}
