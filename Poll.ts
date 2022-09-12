import {
  Contract, Client, Address, Moment, Uint128, Fee, Decimal, ContractLink,
  VersionedDeployment
} from '@fadroma/scrt';
import { CustomConsole, bold, colors } from '@hackbg/konzola'
import AuthProviderDeployment, { Auth, AuthClient } from './Auth';
import TGEDeployment, { RPT_TGE } from './SiennaTGE';
import { Rewards_v4_1 } from './SiennaRewards_v4'
import { Snip20 } from '@fadroma/tokens'
import * as YAML from 'js-yaml'

export default class GovernanceDeployment extends VersionedDeployment<'v1'> {
  names = {
    /** The name of the auth group that gives the voting contract
      * access to the balances in the staking contract, which it
      * uses to compute voting power. */
    authGroup: 'Rewards_and_Governance',
    /** The name of the governance staking pool where voting power is accumulated. */
    pool:      `SIENNA.Rewards[v4]`,
    /** The name of the governance contract where users vote on proposals. */
    polls:     `SIENNA.Rewards[v4].Polls[${this.version}]`
  }
  Clients = {
    /** The client class used to talk to the governance staking pool. */
    Pool:  Rewards_v4_1,
    /** The client class used to talk to the governance voting polls. */
    Polls: Polls
  }
  /** The TGE containing the token and RPT used by the deployment. */
  tge = new TGEDeployment(this)
  /** The token staked in the governance pool. */
  get token () { return this.tge.token }
  /** The RPT contract which needs to be reconfigured when we upgrade
    * the staking pool, so that the new pool gets rewards budget. */
  get rpt () { return this.tge.rpt }
  /** The auth provider and oracle used by the deployment. */
  auth = new AuthProviderDeployment(this, 'v1', this.names.authGroup)
  /** The up-to-date Rewards v4 staking pool with governance support. */
  pool = this.contract({ name: this.names.pool, client: this.Clients.Pool }).get()
  /** The governance voting contract. */
  polls = this.contract({ name: this.names.polls, client: this.Clients.Polls }).get()
  /** Print the status of the governance system. */
  status = async () => {
    const [pool, polls] = await Promise.all([this.pool, this.polls])
    log.pool(pool)
    const stakedToken = await pool.getStakedToken()
    const label = '(todo)'
    log.stakedToken(stakedToken, label)
    log.epoch(await pool.getEpoch())
    log.config(await pool.getConfig())
    log.pollsContract(polls)
    log.pollsAuthProvider(await polls.auth.getProvider())
    log.pollsConfig(await polls.getPollConfig())
    log.activePolls(await polls.getPolls(+ new Date() / 1000, 0, 10, 0))
  }
}

const log = new class SiennaGovernanceConsole extends CustomConsole {
  pool (pool: any) {
    this.info('Governance-enabled staking pool:')
    this.info(' ', JSON.stringify(pool.asLink))
  }
  async stakedToken (stakedToken: any, label: any) {
    const link = JSON.stringify(stakedToken?.asLink)
    this.info('Staked token:')
    this.info(`  ${label} ${link}`)
  }
  epoch (epoch: any) {
    this.info('Epoch:')
    this.info(' ', epoch)
  }
  config (config: any) {
    this.info('Pool config:')
    YAML.dump(config).trim().split('\n').forEach(line=>this.info(' ', line))
  }
  pollsContract (contract: any) {
    this.info('Governance contract:')
    this.info(' ', JSON.stringify(contract.asLink))
  }
  pollsAuthProvider (provider: any) {
    this.info('Auth provider:')
    this.info(' ', JSON.stringify(provider))
  }
  pollsConfig (config: any) {
    this.info('Poll config:')
    this.info(' ', config)
  }
  activePolls (polls: any) {
    this.info('Active polls:')
    this.info(' ', polls)
    this.info('')
  }
}(console, 'Sienna Launch')

const getNow = () => Math.floor(+new Date() / 1000);

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

export class Polls extends Client {
  fees = {
    create_poll: new Fee('80000', 'uscrt'),
    vote: new Fee('100000', 'uscrt'),
    unvote: new Fee('100000', 'uscrt'),
    change_vote_choice: new Fee('100000', 'uscrt'),
  };

  get auth () { return new AuthClient(this.agent, this.address, this.codeHash) }

  async createPoll(meta: PollMetadata) {
    return this.execute({ create_poll: { meta } });
  }

  async vote(poll_id: PollId, choice: PollVote) {
    return this.execute({ vote: { choice, poll_id } });
  }

  async unvote(poll_id: PollId) {
    return this.execute({ unvote: { poll_id } });
  }

  async changeVote(poll_id: PollId, choice: PollVote) {
    return this.execute({ change_vote_choice: { poll_id, choice } });
  }

  async getPoll(poll_id: PollId, now: Moment = getNow()): Promise<PollInfo> {
    const msg = { poll: { poll_id, now } };
    const result: PollInfo = await this.query(msg);
    return result;
  }

  async getPolls(
    now: Moment,
    page: number,
    take: number,
    sort: SortingDirection
  ): Promise<PaginatedPollList> {
    const msg = { polls: { now, page, take, asc: !!sort } };
    return await this.query(msg);
  }

  async getVoteStatus(address: Address, poll_id: PollId, auth: Auth): Promise<VoteStatus | null> {
    const msg = { vote_status: { address, auth, poll_id } };
    const result: VoteStatus = await this.query(msg);
    if (!result.choice || !result.power) {
      return null;
    }
    return result;
  }

  async getUser(auth: Auth): Promise<PollUser> {
    const msg = { user: { at: Date.now() } };
    const result: { user: PollUser } = await this.query(msg);
    return result.user;
  }

  async getPollConfig(): Promise<PollConfig> {
    const msg = { config: {} };
    const result: { config: PollConfig } = await this.query(msg);
    return result.config;
  }
}
