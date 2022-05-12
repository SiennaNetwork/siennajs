import {
  Address,
  Uint128,
  Uint256,
  Fee,
  ContractInfo,
  ViewingKey,
} from "../core";
import { SmartContract, Querier } from "../contract";
import { ViewingKeyExecutor } from "../executors/viewing_key_executor";

import { ExecuteResult } from "secretjs";
import {
  GetGovernanceConfigResponse,
  GetPollResponse,
  GetPollsResponse,
  GetVoteStatusResponse,
  GovernanceConfig,
  Poll,
  PollInfo,
  PollMetadata,
  PollsCollection,
  SortingDirection,
  VoteStatus,
  VoteType,
} from "./governance";

export type Moment = number;
export type Duration = number;

export class RewardsV3Contract extends SmartContract<
  RewardsV3Executor,
  RewardsV3Querier
> {
  exec(fee?: Fee, memo?: string): RewardsV3Executor {
    return new RewardsV3Executor(this.address, this.execute_client, fee, memo);
  }

  query(): RewardsV3Querier {
    return new RewardsV3Querier(this.address, this.query_client);
  }
}

class RewardsV3Executor extends ViewingKeyExecutor {
  async claim(): Promise<ExecuteResult> {
    const msg = { rewards: { claim: {} } };
    return this.run(msg, "80000");
  }

  async deposit_tokens(amount: Uint128): Promise<ExecuteResult> {
    const msg = { rewards: { deposit: { amount } } };

    return this.run(msg, "75000");
  }

  async withdraw_tokens(amount: Uint128): Promise<ExecuteResult> {
    const msg = { rewards: { withdraw: { amount } } };

    return this.run(msg, "75000");
  }

  async create_poll(meta: PollMetadata) {
    const msg = { governance: { create_poll: { meta } } };

    return this.run(msg, "80000");
  }
  async vote(choice: VoteType, poll_id: number) {
    const msg = { governance: { vote: { choice, poll_id } } };

    return this.run(msg, "75000");
  }
  async unvote(poll_id: number) {
    const msg = { governance: { poll_id } };

    return this.run(msg, "75000");
  }
  async change_vote_choice(choice: VoteType, poll_id: number) {
    const msg = { governance: { change_vote_choice: { choice, poll_id } } };

    return this.run(msg, "75000");
  }
}

class RewardsV3Querier extends Querier {
  async get_pool(at: number): Promise<RewardsTotal> {
    const msg = { rewards: { pool_info: { at } } };

    const result = (await this.run(msg)) as GetPoolResponse;
    return result.rewards.pool_info;
  }

  async get_account(
    address: Address,
    key: ViewingKey,
    at: number
  ): Promise<RewardsAccount> {
    const msg = { rewards: { user_info: { address, key, at } } };

    const result = (await this.run(msg)) as GetAccountResponse;
    return result.rewards.user_info;
  }

  async get_poll(poll_id: number, now: number): Promise<PollInfo> {
    const msg = { governance: { poll: { poll_id, now } } };
    const result = (await this.run(msg)) as GetPollResponse;
    return result.poll;
  }

  async get_polls(
    now: number,
    page: number,
    take: number,
    sort: SortingDirection
  ): Promise<PollsCollection> {
    const msg = { governance: { polls: { now, page, take, asc: !!sort } } };
    return this.run(msg);
  }
  async get_vote_status(
    address: Address,
    key: string,
    poll_id: number
  ): Promise<VoteStatus> {
    const msg = { governance: { vote_status: { address, key, poll_id } } };

    const result = (await this.run(msg)) as GetVoteStatusResponse;
    return result.vote_status;
  }
  async get_governance_config(): Promise<GovernanceConfig> {
    const msg = { governance: { config: {} } };
    const result = (await this.run(msg)) as GetGovernanceConfigResponse;

    return result.config;
  }
}

interface GetAccountResponse {
  rewards: { user_info: RewardsAccount };
}

interface GetPoolResponse {
  rewards: { pool_info: RewardsTotal };
}
