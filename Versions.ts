/** Versions of Sienna TGE
  * v1: Initial release */
export type TGEVersion = 'v1'

/** Versions of Sienna Auth
  * v1: Initial release */
export type AuthVersion = 'v1'

/** Versions of Sienna Aut
  * v1: Initial release */
export type AuthProviderVersion = 'v1'

export const LatestAuthProviderVersion: AuthProviderVersion = 'v1'

/** Versions of Sienna Swap
  * v1: what was the bug?
  * v2: fixes v1 */
export type AMMVersion = 'v1' | 'v2'

/** Versions of the Rewards system.
  * Rewards v1: false start.
  * Rewards v2: buggy distribution algorithm.
  * Rewards v3: where did it go?
  * Rewards v3.1: what did it add?
  * Rewards v4.1: what did it add? */
export type RewardsVersion    = 'v2' | 'v3' | 'v3.1' | 'v4.1'

/** Which version of AMM corresponds to which version of Rewards. */
export const RewardsToAMMVersion: Record<RewardsVersion, AMMVersion> = {
  'v2':   'v1',
  'v3':   'v2',
  'v3.1': 'v2',
  'v4.1': 'v2',
};

/** Which version of Auth Provider is used by which version of Rewards. */
export const RewardsToAuthVersion: Record<RewardsVersion, AuthVersion|null> = {
  'v2':   null,
  'v3':   null,
  'v3.1': null,
  'v4.1': 'v1'
}

/** Versions of Sienna Lend
  * v1: Initial release */
export type LendVersion = 'v1'

/** Versions of Sienna PFR
  * v1: Initial release */
export type PFRVersion = 'v1'

/** Versions of Sienna Governance
  * v1: Initial release */
export type GovernanceVersion = 'v1'

/** Versions of Sienna Launch
  * v1: Initial release */
export type LaunchpadVersion  = 'v1'

export enum MulticallVersion {
  'v0.0.1',
}
