export * from './VestingConfig'
export * from './VestingDeployment'
export * from './VestingMGMT'
export * from './VestingRPT'

import { VestingDeployment, TGEDeployment, PFRDeployment } from './VestingDeployment'
import { BaseMGMT, TGEMGMT, PFRMGMT } from './VestingMGMT'
import { BaseRPT, TGERPT, PFRRPT } from './VestingRPT'

export const Base = Object.assign(VestingDeployment, {
  MGMT: BaseMGMT,
  RPT:  BaseRPT
})

export const TGE = Object.assign(TGEDeployment, {
  MGMT: TGEMGMT,
  RPT:  TGERPT
})

export const PFR = Object.assign(PFRDeployment, {
  MGMT: PFRMGMT,
  RPT:  PFRRPT
})
