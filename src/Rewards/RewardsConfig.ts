import type { Address, IntoLink, Message, Snip20, ClientClass } from '../Core'
import type { Version as AMMVersion } from '../AMM/AMMConfig'
import type { Version as AuthVersion } from '../Auth/AuthConfig'
import type { RewardPool } from './Rewards'

/** Supported versions of the Rewards subsystem. */
export type Version = 'v2' | 'v3' | 'v3.1' | 'v4.1'

/** Which version of AMM corresponds to which version of rewards. */
export const AMMVersions: Record<Version, AMMVersion> = {
  'v2':   'v1',
  'v3':   'v2',
  'v3.1': 'v2',
  'v4.1': 'v2',
};

/** Which version of Auth Provider corresponds to which version of rewards. */
export const AuthVersions: Partial<Record<Version, AuthVersion>> = {
  'v4.1': 'v1'
}

/** Universal init parameters for all versions of rewards.
  * Some of these may be ignored. */
export interface InitParams {
  rewardToken:   IntoLink;
  stakedToken:   IntoLink;
  admin?:        Address;
  timekeeper?:   Address;
  authProvider?: IntoLink;
  threshold?:    number;
  cooldown?:     number;
  bonding?:      number;
  unbonding?:    number;
}



/** Constructs a reward pool of some version. */
export interface RewardsCtor extends ClientClass<RewardPool> {
  /** Generate the correct format of Rewards init message for the given version */
  init(params: InitParams): Message;
}

export interface StakingTokens {
  stakedToken: Snip20
  rewardToken: Snip20
}
