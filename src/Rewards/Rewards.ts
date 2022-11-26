export * from './RewardsConfig'
export * from './RewardsBase'
export * from './Rewards_v2'
export * from './Rewards_v3'
export * from './Rewards_v4'

import { RewardPool } from './RewardsBase'
import { RewardPool_v2 }   from './Rewards_v2'
import { RewardPool_v3 }   from './Rewards_v3'
import { RewardPool_v3_1 } from './Rewards_v3'
import { RewardPool_v4_1 } from './Rewards_v4'
RewardPool['v2']   = RewardPool_v2
RewardPool['v3']   = RewardPool_v3
RewardPool['v3.1'] = RewardPool_v3_1
RewardPool['v4.1'] = RewardPool_v4_1

export { RewardsDeployment as Deployment } from './RewardsDeploy'
