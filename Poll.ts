import {
  Address,
  Client,
  Contract,
  ContractLink,
  CustomConsole,
  Decimal,
  VersionedSubsystem,
  Fee,
  Moment,
  Snip20,
  TokenSymbol,
  Uint128,
  YAML,
  bold,
  now as getNow
} from './Core';
import * as Auth from './Auth';
import * as TGE from './TGE';
import * as Rewards from './Rewards';
import { Names } from './Names'
import type { SiennaDeployment } from "./index";
import { SiennaConsole } from "./index";

export type Version = 'v1'

class GovernanceDeployment extends VersionedSubsystem<Version> {
  log = new SiennaConsole(`Governance ${this.version}`)

  constructor (context: SiennaDeployment, version: Version,) {
    super(context, version)
    context.attach(this, `gov ${version}`, `Sienna Governance ${version}`)
  }

  /** The token staked in the governance pool for voting power. */
  token = this.context.tge['v1'].token

  /** The RPT contract which needs to be reconfigured when we upgrade
    * the staking pool, so that the new pool gets rewards budget. */
  rpts = this.context.tge['v1'].rpts

  /** The auth provider and oracle used to give
    * the voting contract access to the balances in the
    * staking contract, which it uses to compute voting power. */
  auth = this.context.auth['v1']
    .provider('Governance')
    .group('Rewards_and_Governance')

  /** The up-to-date Rewards v4 staking pool with governance support. */
  staking = this.context.tge['v1'].staking

  /** The governance voting contract. */
  voting = this.contract({
    name: `SIENNA.Rewards[v4].Polls[${this.version}]`,
    client: Polls
  }).get()

  /** Display the status of the governance system. */
  async showStatus () {
    const [staking, voting] = await Promise.all([this.staking, this.voting])
    this.log.pool(staking)
    const stakedToken = await staking.getStakedToken()
    const label = '(todo)'
    this.log.stakedToken(stakedToken, label)
    this.log.epoch(await staking.getEpoch())
    this.log.config(await staking.getConfig())
    this.log.pollsContract(voting)
    this.log.pollsAuthProvider(await voting.auth.getProvider())
    this.log.pollsConfig(await voting.getPollConfig())
    this.log.activePolls(await voting.getPolls(+ new Date() / 1000, 0, 10, 0))
  }
}

export { GovernanceDeployment as Deployment }

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

  get auth () { return new Auth.AuthClient(this.agent, this.address, this.codeHash) }

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

  async getVoteStatus(address: Address, poll_id: PollId, auth: Auth.Auth): Promise<VoteStatus | null> {
    const msg = { vote_status: { address, auth, poll_id } };
    const result: VoteStatus = await this.query(msg);
    if (!result.choice || !result.power) {
      return null;
    }
    return result;
  }

  async getUser(auth: Auth.Auth): Promise<PollUser> {
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
