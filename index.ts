export * from './Core'
export * from './Auth'
export * from './SiennaTGE'
export * from './SiennaSwap'

export * from './SiennaRewards'
export * from './SiennaRewards_v2'
export * from './SiennaRewards_v3'
export * from './SiennaRewards_v4'
import { Rewards }                  from './SiennaRewards'
import { Rewards_v2 }               from './SiennaRewards_v2'
import { Rewards_v3, Rewards_v3_1 } from './SiennaRewards_v3'
import { Rewards_v4_1 }             from './SiennaRewards_v4'
Rewards['v2']   = Rewards_v2
Rewards['v3']   = Rewards_v3
Rewards['v3.1'] = Rewards_v4_1
Rewards['v4.1'] = Rewards_v4_1

export * from './SiennaLend'
export * from './SiennaLaunch'
export * from './Poll'
export * from './Pagination'
export * from './Multicall'

import { PatchedSigningCosmWasmClient_1_2 } from '@fadroma/scrt-amino'
export { PatchedSigningCosmWasmClient_1_2 as PatchedSigningCosmWasmClient }

export * from './Deployment'
