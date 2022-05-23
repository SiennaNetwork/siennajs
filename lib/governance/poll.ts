import {
    Address,
    Uint128,
    Uint256,
    Fee,
    ContractInfo,
    ViewingKey,
    Decimal,
} from '../core';
import { SmartContract, Querier } from '../contract';
import { ViewingKeyExecutor } from '../executors/viewing_key_executor';
import { Auth, AuthMethod } from '../auth';

/**
 * Supports any number of additions, saved as a string in the contract.
 * Limits:
 *     min length: 5
 *     max length: 20
 */
export enum PollType {
    SiennaRewards = 'sienna_rewards',
    SiennaSwapParameters = 'sienna_swap_parameters',
    Other = 'other',
}
export enum PollStatus {
    /**
     * The poll is not expired, voting is still possible
     */
    Active = 'active',
    /**
     * The poll has expired, quorum has passed and the poll has passed
     */
    Passed = 'passed',
    /**
     * Quorum has not been reached or poll has failed.
     */
    Failed = 'failed',
}
/**
 * Possible vote options
 */
export enum VoteType {
    Yes = 'yes',
    No = 'no',
}
/**
 * Helper around poll expiration. Currently holds only @at_time
 */
export type Expiration = {
    at_time: number;
};

export interface PollConfig {
    /**
     * Minimum amount of staked tokens needed to create a poll
     */
    threshold: Uint128;
    /**
     * The amount of time a poll lasts in seconds
     */
    deadline: number;
    /**
     * Minimum percentage (0-1) which is needed for a poll to be valid
     */
    quorum: Decimal;

    /**
     * Link to the rewards contract
     */
    rewards: ContractInfo;
    /**
     * Minimum number of tokens staked to be able to vote
     */
    voting_threshold: Uint128;
}
export interface PollMetadata {
    /**
     * The title of the poll.
     * Has a default min and max
     */
    title: String;
    /**
     * The description of the poll.
     * Has a default min and max
     */
    description: String;
    /**
     * Generic type of the poll, underlying type can be any string.
     */
    poll_type: PollType;
}
export interface Poll {
    id: number;
    /**
     * Saved as the user who send the create poll transaction
     */
    creator: Address;
    metadata: PollMetadata;
    expiration: Expiration;
    status: PollStatus;
    /**
     * Snapshot of the quorum taken from the configuration at the time of creation.
     * Used in calculating results until poll has expired
     */
    current_quorum: Decimal;
}
export interface PollResult {
    poll_id: number;
    /**
     * The total number of yes votes, equals the number of tokens staked.
     * As vote = stake power
     */
    yes_votes: Uint128;
    no_votes: Uint128;
}
/**
 * Generic helper struct to wrap all poll information
 * @instance - The entire poll itself
 * @result - The up to date results of the poll.
 */
export interface PollInfo {
    instance: Poll;
    result: PollResult;
}

export interface VoteStatus {
    power: Uint128;
    choice: VoteType;
}
export interface GetPollResponse {
    poll: PollInfo;
}
export interface GetPollsResponse {
    polls: Array<Poll>;
    total: number;
    total_pages: number;
}
export type PollsCollection = GetPollsResponse;
export interface GetVoteStatusResponse {
    vote_status: {
        power: Uint128;
        choice: VoteType;
    };
}
export interface GetPollConfigResponse {
    config: PollConfig;
}

export enum SortingDirection {
    Ascending = 1,
    Descending = 0,
}
export type User = {
    created_polls: Array<number>;
    active_polls: Array<number>;
};

class PollExecutor extends ViewingKeyExecutor {
    async create_poll(meta: PollMetadata) {
        const msg = { create_poll: { meta } };

        return this.run(msg, '80000');
    }
    async vote(choice: VoteType, poll_id: number) {
        const msg = { vote: { choice, poll_id } };

        return this.run(msg, '75000');
    }
    async unvote(poll_id: number) {
        const msg = { unvote: { poll_id } };

        return this.run(msg, '75000');
    }
    async change_vote_choice(choice: VoteType, poll_id: number) {
        const msg = { change_vote_choice: { choice, poll_id } };

        return this.run(msg, '75000');
    }
}
class PollQuerier extends Querier {
    async get_poll(poll_id: number, now: number): Promise<PollInfo> {
        const msg = { poll: { poll_id, now } };
        const result = (await this.run(msg)) as GetPollResponse;
        return result.poll;
    }
    async get_polls(
        now: number,
        page: number,
        take: number,
        sort: SortingDirection
    ): Promise<PollsCollection> {
        const msg = { polls: { now, page, take, asc: !!sort } };
        return this.run(msg);
    }
    async get_vote_status(
        address: Address,
        poll_id: number,
        auth: Auth
    ): Promise<VoteStatus> {
        const msg = { vote_status: { address, auth, poll_id } };

        const result = (await this.run(msg)) as GetVoteStatusResponse;
        return result.vote_status;
    }
    async get_user(auth: Auth): Promise<User> {
        const msg = { user: { at: Date.now() } };
        const result = (await this.run(msg)) as { user: User };
        return result.user;
    }
    async get_poll_config(): Promise<PollConfig> {
        const msg = { config: {} };
        const result = (await this.run(msg)) as GetPollConfigResponse;

        return result.config;
    }
}

export class PollContract extends SmartContract<PollExecutor, PollQuerier> {
    exec(fee?: Fee, memo?: string): PollExecutor {
        return new PollExecutor(this.address, this.execute_client, fee, memo);
    }
    query(): PollQuerier {
        return new PollQuerier(this.address, this.query_client);
    }
}
