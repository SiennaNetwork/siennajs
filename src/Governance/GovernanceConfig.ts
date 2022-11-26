import type { Uint128, Decimal, Moment, Duration, ContractLink, Address } from '../Core'

export type Version = 'v1';

export interface Settings {
  config: {
    threshold:        Uint128
    voting_threshold: Uint128
    quorum:           Uint128
    deadline:         Duration
    rewards:          ContractLink
  }
  rewards: {
    unbonding_period: Duration
    lp_token:         ContractLink
    rewards_token:    ContractLink
  }
  provider:           ContractLink
}

export type PollId = number;

/** Supports any number of additions, saved as a string in the contract.
 *  Limits:
 *     min length: 5
 *     max length: 20 */
export enum PollType {
  SiennaRewards = 'sienna_rewards',
  SiennaSwapParameters = 'sienna_swap_parameters',
  Other = 'other',
}

export enum PollStatus {
  /** The poll is not expired, voting is still possible */
  Active = 'active',
  /** The poll has expired, quorum has passed and the poll has passed */
  Passed = 'passed',
  /** Quorum has not been reached or poll has failed. */
  Failed = 'failed',
}

/** Possible vote options */
export enum PollVote {
  Yes = 'yes',
  No = 'no',
  Abstain = 'abstain',
}

/** Describes the conditions under which a poll expires. */
export interface Expiration {
  at_time: Moment;
}

export interface PollConfig {
  /** Minimum amount of staked tokens needed to create a poll */
  threshold: Uint128;
  /** The amount of time a poll lasts in seconds */
  deadline: Moment;
  /** Minimum percentage (0-1) which is needed for a poll to be valid */
  quorum: Decimal;
  /** Link to the rewards contract */
  rewards: ContractLink;
  /** Minimum number of tokens staked to be able to vote */
  voting_threshold: Uint128;
}

export interface PollMetadata {
  /** The title of the poll. Has a default min and max */
  title: string;
  /** The description of the poll. Has a default min and max */
  description: string;
  /** Generic type of the poll, underlying type can be any string. */
  poll_type: PollType;
}

export interface Poll {
  id: PollId;
  /** Saved as the user who send the create poll transaction */
  creator: Address;

  metadata: PollMetadata;

  expiration: Expiration;

  status: PollStatus;
  /** Snapshot of the quorum taken from the configuration at the time of creation.
   * Used in calculating results until poll has expired */
  current_quorum: Decimal;
}

export interface PollResult {
  poll_id: PollId;
  /** The total number of yes votes, equals the number of tokens staked.
   * As vote = stake power */
  yes_votes: Uint128;
  no_votes: Uint128;
  abstain_votes: Uint128;
}

/** All poll information. */
export interface PollInfo {
  /** The poll. */
  instance: Poll;
  /** The up-to-date results of the poll. */
  result: PollResult;
}

export interface VoteStatus {
  power: Uint128;
  choice: PollVote;
}

export interface GetPollResponse {
  poll: PollInfo;
}

export interface PaginatedPollList {
  polls: Array<Poll>;
  total: number;
  total_pages: number;
}

export interface GetPollConfigResponse {
  config: PollConfig;
}

export enum SortingDirection {
  Ascending = 1,
  Descending = 0,
}

export interface PollUser {
  created_polls: Array<PollId>;
  active_polls: Array<PollId>;
}
