import type { Moment, Address, SortingDirection } from './Core'
import { Client, Fee } from './Core'
import * as Auth from './Auth'
import type {
  PollId, PollConfig, PollMetadata, PollInfo,
  PaginatedPollList, PollUser, PollVote, VoteStatus
} from './GovernanceConfig'

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
