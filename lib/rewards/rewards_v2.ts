import { Address, Uint128, Fee, ContractInfo, ViewingKey } from '../core'
import { SmartContract, Querier } from '../contract'
import { ViewingKeyExecutor } from '../executors/viewing_key_executor'

import { ExecuteResult } from 'secretjs'


export class RewardsV2Contract extends SmartContract<RewardsV2Executor, RewardsV2Querier> {
    exec(fee?: Fee, memo?: string): RewardsV2Executor {
        return new RewardsV2Executor(this.address, this.execute_client, fee, memo)
    }

    query(): RewardsV2Querier {
        return new RewardsV2Querier(this.address, this.query_client)
    }
}

class RewardsV2Executor extends ViewingKeyExecutor {
    async claim(): Promise<ExecuteResult> {
        const msg = {
            claim: { }
        }

        return this.run(msg, '80000')
    }

    async lock_tokens(amount: Uint128): Promise<ExecuteResult> {
        const msg = {
            lock: {
                amount
            }
        }

        return this.run(msg, '75000')
    }

    async retrieve_tokens(amount: Uint128,): Promise<ExecuteResult> {
        const msg = {
            retrieve: {
                amount
            }
        }

        return this.run(msg, '75000')
    }
}

class RewardsV2Querier extends Querier {
    async get_pool(at: number): Promise<RewardPool> {
        const msg = {
            pool_info: {
                at
            }
        }

        const result = await this.run(msg) as GetPoolResponse;
        return result.pool_info;
    }

    async get_account(
        address: Address,
        key: ViewingKey,
        at: number
    ): Promise<RewardsAccount> {
        const msg = {
            user_info: {
                address,
                key,
                at
            }
        }

        const result = await this.run(msg) as GetAccountResponse;
        return result.user_info;
    }
}

interface GetAccountResponse {
    user_info: RewardsAccount;
}

interface GetPoolResponse {
    pool_info: RewardPool;
}
