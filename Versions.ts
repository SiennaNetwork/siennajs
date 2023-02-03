export type TGEVersion        = 'v1'

export type AuthVersion       = 'v1'

export type AMMVersion        = 'v1' | 'v2'

export type RewardsVersion    = 'v2' | 'v3' | 'v3.1' | 'v4.1'

/** Which version of AMM corresponds to which version of rewards. */
export const RewardsToAMMVersion: Record<RewardsVersion, AMMVersion> = {
  'v2':   'v1',
  'v3':   'v2',
  'v3.1': 'v2',
  'v4.1': 'v2',
};

export type LendVersion       = 'v1'

export type PFRVersion        = 'v1'

export type GovernanceVersion = 'v1'

export type LaunchpadVersion  = 'v1'

export type AuthProviderVersion = 'v1'

export const LatestAuthProviderVersion: AuthProviderVersion = 'v1'

export enum MulticallVersion {
  'v0.0.1',
}
