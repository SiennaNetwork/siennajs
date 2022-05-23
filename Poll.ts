import { Client, Address, Moment, Uint128, Fee, Decimal } from "@fadroma/client";

import { Auth } from './Auth'
import { ContractInfo } from './Core'

export type PollId = number;

/** Supports any number of additions, saved as a string in the contract.
 *  Limits:
 *     min length: 5
 *     max length: 20 */
export enum PollType {
  SiennaRewards        = 'sienna_rewards',
  SiennaSwapParameters = 'sienna_swap_parameters',
  Other                = 'other',
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
  No  = 'no',
}

/** Describes the conditions under which a poll expires. */
export interface Expiration {
  at_time: Moment
}

export interface PollConfig {
  /** Minimum amount of staked tokens needed to create a poll */
  threshold:        Uint128;
  /** The amount of time a poll lasts in seconds */
  deadline:         Moment;
  /** Minimum percentage (0-1) which is needed for a poll to be valid */
  quorum:           Decimal;
  /** Link to the rewards contract */
  rewards:          ContractInfo;
  /** Minimum number of tokens staked to be able to vote */
  voting_threshold: Uint128;
}

export interface PollMetadata {
  /** The title of the poll. Has a default min and max */
  title:       string;
  /** The description of the poll. Has a default min and max */
  description: string;
  /** Generic type of the poll, underlying type can be any string. */
  poll_type:   PollType;
}

export interface Poll {
  id:             PollId;
  /** Saved as the user who send the create poll transaction */
  creator:        Address;

  metadata:       PollMetadata;

  expiration:     Expiration;

  status:         PollStatus;
  /** Snapshot of the quorum taken from the configuration at the time of creation.
    * Used in calculating results until poll has expired */
  current_quorum: Decimal;
}

export interface PollResult {
  poll_id:   PollId;
  /** The total number of yes votes, equals the number of tokens staked.
    * As vote = stake power */
  yes_votes: Uint128;
  no_votes:  Uint128;
}

/** All poll information. */
export interface PollInfo {
  /** The poll. */
  instance: Poll;
  /** The up-to-date results of the poll. */
  result:   PollResult;
}

export interface VoteStatus {
  power:  Uint128;
  choice: PollVote;
}

export interface GetPollResponse {
  poll: PollInfo;
}

export interface PaginatedPollList {
  polls:       Array<Poll>
  total:       number
  total_pages: number
}

export interface GetPollConfigResponse {
  config: PollConfig;
}

export enum SortingDirection {
  Ascending  = 1,
  Descending = 0,
}

export interface PollUser {
  created_polls: Array<PollId>
  active_polls:  Array<PollId>
}

export class Polls extends Client {

  txFees = {
    createPoll: new Fee('80000', 'uscrt'),
    vote:       new Fee('75000', 'uscrt'),
    unvote:     new Fee('75000', 'uscrt'),
    changeVote: new Fee('75000', 'uscrt')
  }

  async createPoll (meta: PollMetadata) {
    const msg = { create_poll: { meta } }
    const opt = { fee: this.txFees.createPoll }
    return this.execute(msg, opt)
  }

  async vote (poll_id: PollId, choice: PollVote) {
    const msg = { vote: { choice, poll_id } }
    const opt = { fee: this.txFees.vote }
    return this.execute(msg, opt)
  }

  async unvote (poll_id: PollId) {
    const msg = { unvote: { poll_id } }
    const opt = { fee: this.txFees.unvote }
    return this.execute(msg, opt)
  }

  async changeVote (poll_id: PollId, choice: PollVote) {
    const msg = { change_vote: { poll_id, choice } }
    const opt = { fee: this.txFees.changeVote }
    return this.execute(msg, opt)
  }

  async getPoll (poll_id: PollId, now: Moment): Promise<PollInfo> {
    const msg = { poll: { poll_id, now } }
    const result: { poll: PollInfo } = await this.query(msg)
    return result.poll;
  }

  async getPolls (
    now: Moment,
    page: number,
    take: number,
    sort: SortingDirection
  ): Promise<PaginatedPollList> {
    const msg = { polls: { now, page, take, asc: !!sort } };
    return await this.query(msg)
  }

  async getVoteStatus (
    address: Address,
    poll_id: PollId,
    auth:    Auth
  ): Promise<VoteStatus> {
    const msg = { vote_status: { address, auth, poll_id } };
    const result: { vote_status: VoteStatus } = await this.query(msg)
    return result.vote_status
  }

  async getUser (auth: Auth): Promise<PollUser> {
    const msg = { user: { at: Date.now() } }
    const result: { user: PollUser } = await this.query(msg)
    return result.user;
  }

  async getPollConfig (): Promise<PollConfig> {
    const msg = { config: {} }
    const result: { config: PollConfig } = await this.query(msg)
    return result.config;
  }

}