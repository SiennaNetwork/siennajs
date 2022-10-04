import {
  Client,
  ClientConsole,
  CustomConsole,
  Names,
  VersionedSubsystem,
  ViewingKeyClient,
  bold,
  colors,
  linkStruct,
  randomBase64,
} from './Core';
import type {
  Address,
  ClientClass,
  Contract,
  ContractLink,
  Emigration,
  Immigration,
  IntoLink,
  Message,
  Snip20,
  Uint128,
} from './Core';
import { AuthClient, AuthMethod } from './Auth';
import { LPToken } from './AMM';
import type * as AMM from './AMM'
import type * as Auth from './Auth'
import type { RewardPool_v2 } from './Rewards_v2'
import type { RewardPool_v3, RewardPool_v3_1 } from './Rewards_v3'
import type { RewardPool_v4_1 } from './Rewards_v4'
import type { SiennaDeployment } from "./index"
import { SiennaConsole } from "./index"

/** Supported versions of the Rewards subsystem. */
export type Version = 'v2' | 'v3' | 'v3.1' | 'v4.1'

/** Which version of AMM corresponds to which version of rewards. */
export const AMMVersions: Record<Version, AMM.Version> = {
  'v2':   'v1',
  'v3':   'v2',
  'v3.1': 'v2',
  'v4.1': 'v2',
};

/** Which version of Auth Provider corresponds to which version of rewards. */
export const AuthVersions: Partial<Record<Version, Auth.Version>> = {
  'v4.1': 'v1'
}

class RewardsDeployment extends VersionedSubsystem<Version> {
  log = new SiennaConsole(`Rewards ${this.version}`)
  /** Which version of Auth Provider should these rewards use. */
  authVersion? = AuthVersions[this.version]
  /** The name of the auth provider, if used. */
  authProviderName = this.authVersion
    ? `Rewards[${this.version}]`
    : undefined
  /** The auth provider, if used. */
  auth = this.authVersion
    ? this.context.auth[this.authVersion].provider(this.authProviderName!)
    : null
  /** Which version of the AMM are these rewards for. */
  ammVersion = AMMVersions[this.version]
  /** The version of the Rewards client to use. */
  client: RewardsCtor = RewardPool[this.version] as unknown as RewardsCtor
  /** The reward pools in this deployment. */
  pools = this.contracts({ client: this.client, match: Names.isRewardPool(this.version) })

  constructor (
    context: SiennaDeployment,
    version: Version,
    /** The token distributed by the reward pools. */
    public reward: Contract<Snip20> = context.tokens.define('SIENNA')
  ) {
    super(context, version)
    context.attach(this, `rewards ${version}`, `Sienna Rewards ${version}`)
  }

  async showStatus () {
    this.log.rewardPools(this.name, this.state)
  }
}

export { RewardsDeployment as Deployment }

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

/** A reward pool. */
export abstract class RewardPool extends Client {

  log = new ClientConsole(this.constructor.name)

  /** Rewards v1/v2 with the buggy algo. Counts time in blocks. */
  static 'v2':   typeof RewardPool_v2;
  /** Rewards v3 with the fixed algo. Counts time in seconds. */
  static 'v3':   typeof RewardPool_v3;
  /** Rewards v3.1 adds depositing using SNIP20 Send instead of IncreaseAllowance+Transfer. */
  static 'v3.1': typeof RewardPool_v3_1;
  /** Rewards v4 adds admin authentication via AuthProvider. */
  static 'v4.1': typeof RewardPool_v4_1;

  /** Get a LPToken interface to the staked token. */
  abstract getStakedToken(): Promise<LPToken | null>;
  /** Deposit some amount of staked token. */
  abstract deposit(amount: Uint128): Promise<unknown>;
  /** Try to withdraw some amount of staked token. */
  abstract withdraw(amount: Uint128): Promise<unknown>;
  /** Try to claim a reward. */
  abstract claim(): Promise<unknown>;

  get vk (): ViewingKeyClient {
    const { address, codeHash } = this
    return new ViewingKeyClient(this.agent, address, codeHash)
  }
  get emigration (): Emigration {
    throw new Error('Migration is only available in Rewards >=3');
  }
  get immigration (): Immigration {
    throw new Error('Migration is only available in Rewards >=3');
  }
  get auth (): AuthClient {
    throw new Error('Auth provider is only used by Rewards >=4.1');
  }
  /** Point this pool to the governance contract that will be using it for voting power. */
  async setGovernanceLink<T>(link: ContractLink): Promise<T> {
    throw new Error('Governance integration is only available in Rewards >=4.1');
  }
  getEpoch () {
    throw new Error('Not implemented');
  }
  getConfig () {
    throw new Error('Not implemented');
  }
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
