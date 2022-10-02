import {
  Client,
  ClientConsole,
  CustomConsole,
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
  ContractMetadata,
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
import type { Rewards_v2 } from './Rewards_v2'
import type { Rewards_v3, Rewards_v3_1 } from './Rewards_v3'
import type { Rewards_v4_1 } from './Rewards_v4'
import { Names } from './Names'
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

export class Deployment extends VersionedSubsystem<Version> {

  log = new SiennaConsole(`Rewards ${this.version}`)

  constructor (
    context: SiennaDeployment,
    version: Version,
    public reward: Snip20|Promise<Snip20> = context.token('SIENNA')
  ) {
    super(context, version)
    context.attach(this, `rewards ${version}`, `Sienna Rewards ${version}`)
  }

  /** Which version of the AMM are these rewards for. */
  ammVersion:   AMM.Version  = AMMVersions[this.version]

  /** Which version of Auth Provider should these rewards use. */
  authVersion?: Auth.Version = AuthVersions[this.version]

  /** The name of the auth provider, if used. */
  authProviderName =
    this.authVersion
      ? `Rewards[${this.version}]`
      : undefined

  /** The auth provider, if used. */
  authProvider =
    this.authVersion
      ? this.context.auth[this.authVersion].provider(this.authProviderName!)
      : null

  pools = this.contract({
    client: Rewards[this.version] as unknown as RewardsCtor
  }).getMany(
    ({name}:{name?:string})=>name?.includes('Rewards')
  )

  async showStatus () {
    this.log.rewardPools(this.name, this.state)
  }

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

/** A reward pool. */
export abstract class Rewards extends Client {

  log = new ClientConsole(this.constructor.name)

  /** Rewards v1/v2 with the buggy algo. Counts time in blocks. */
  static 'v2':   typeof Rewards_v2;
  /** Rewards v3 with the fixed algo. Counts time in seconds. */
  static 'v3':   typeof Rewards_v3;
  /** Rewards v3.1 adds depositing using SNIP20 Send instead of IncreaseAllowance+Transfer. */
  static 'v3.1': typeof Rewards_v3_1;
  /** Rewards v4 adds admin authentication via AuthProvider. */
  static 'v4.1': typeof Rewards_v4_1;

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
    throw new Error('Auth provider is only available in Rewards >=4.1');
  }
  /** Point this pool to the governance contract that will be using it for voting power. */
  async setGovernanceLink<T>(link: ContractLink): Promise<T> {
    throw new Error('Governance integration is only available in Rewards >=4.1');
  }
}

/** Constructs a reward pool of some version. */
export interface RewardsCtor extends ClientClass<Rewards> {
  /** Generate the correct format of Rewards init message for the given version */
  init(params: InitParams): Message;
}

export interface StakingTokens {
  stakedToken: Snip20
  rewardToken: Snip20
}