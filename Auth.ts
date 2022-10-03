import {
  Address,
  Client,
  CodeHash,
  ContractLink,
  ContractMetadata,
  IntoLink,
  Pagination,
  Permit,
  Signer,
  VersionedSubsystem,
  ViewingKey,
  linkStruct,
} from "./Core";
import { Names } from './Names';
import type { SiennaDeployment } from "./index";
import { SiennaConsole } from "./index";

export type Version = 'v1'

export class AuthDeployment extends VersionedSubsystem<Version> {
  log = new SiennaConsole(`Auth ${this.version}`)

  constructor (context: SiennaDeployment, version: Version = 'v1',) {
    super(context, version)
    context.attach(this, `auth ${this.version}`, `Sienna Auth Provider ${this.version}`)
  }

  /** The auth provider's RNG oracle. */
  oracle = this.contract({ name: Names.AuthOracle(this.version) }).get()

  /** The auth provider contract. */
  provider (name: string, oracle: Client|Promise<Client> = this.oracle): AuthProviderDeployment {
    return new AuthProviderDeployment(this, this.version, name, oracle)
  }

  async showStatus () {
    // TODO
    for (const name in this.context.state) {
      if (name.includes('Auth')) this.log.info(`* ${name}`)
    }
  }
}

export class AuthProviderDeployment extends VersionedSubsystem<Version> {
  log = new SiennaConsole(`Auth ${this.version}`)

  constructor (
    context:             AuthDeployment,
    version:             Version = 'v1',
    public providerName: string,
    public oracle:       ContractLink|Client|Promise<Client>
  ) {
    super(context.context, version)
    context.attach(this, providerName, `auth provider "${providerName}"`)
  }

  provider = this.contract({
    name:   Names.NamedProvider(this.version, this.providerName),
    client: AuthProvider
  }).get()

  group (
    name:    string,
    members: ({ address?: Address }|Promise<{ address?: Address }>)[] = []
  ): Promise<this> {
    return this.task(`get or create auth group ${name}`, async () => {
      const provider = await this.provider
      members = await Promise.all(members.map(Promise.resolve)) as { address?: Address }[]
      await (await this.provider).createGroup(name, members as any[]) // TODO
      return this
    })
  }

  async showStatus () {
    // TODO
  }
}

export { AuthDeployment as Deployment, AuthProviderDeployment as ProviderDeployment }

export type AuthStrategy =
  | { type: "permit"; signer: Signer }
  | { type: "vk"; viewing_key: { address: Address; key: ViewingKey } };

export type AuthMethod<T> =
  | { permit: Permit<T> }
  | { viewing_key: { address: Address; key: ViewingKey } };

export class MockAuthClient extends Client {
  async update(second_contract: any) {
    return this.execute({ update: { second_contract } });
  }
}

export class AuthClient extends Client {
  async setGroupKey (key: string, group_id: number) {
    return await this.execute({ auth_client: { set_group_key: { key, group_id } } })
  }
  async changeProvider (provider: IntoLink) {
    return await this.execute({ auth_client: { change_provider: { provider: linkStruct(provider) } } })
  }
  async getProvider (): Promise<AuthProvider> {
    return await this.query({ auth_client: { provider: {} } })
  }
}

export class AuthProvider extends Client {
  async getOracle() {
    return this.query({ oracle: {} });
  }

  // async getAdmin() {
  //   return this.query({ admin: { admin: {} } });
  // }

  async createGroup(name: string, members: ContractLink[], admin?: Address) {
    return this.execute({ create_group: { name, members } });
  }

  async addMembers(groupId: number, members: ContractLink[]) {
    return this.execute({ add_members: { groupId, members } });
  }

  async removeMembers(
    groupId: number,
    members: ContractLink[],
    regenerateKey: boolean
  ) {}

  async swapMembers(
    groupId: number,
    oldMember: ContractLink[],
    newMember: ContractLink[],
    regenerateKey: boolean
  ) {
    return this.execute({
      swap_members: {
        group_id: groupId,
        old_member: oldMember,
        new_member: newMember,
        regenerate_key: regenerateKey,
      },
    });
  }

  async removeGroup(groupId: number) {
    return this.execute({ remove_group: { group_id: groupId } });
  }

  async getGroups(pagination: Pagination) {
    return this.query({ groups: { pagination } });
  }

  async getGroup(id: number) {
    return this.query({ group: id });
  }

  async findInGroups(target: ContractLink, groups: number[]) {
    return this.query({ find_in_groups: { target, groups } });
  }

  async getLogs(pagination: Pagination) {
    return this.query({ logs: { pagination } });
  }
}

export class Auth {
  static viewing_key(address: Address, key: ViewingKey): Auth {
    return new this({ type: "vk", viewing_key: { address, key } });
  }

  static permit(signer: Signer): Auth {
    return new this({ type: "permit", signer });
  }

  constructor(readonly strategy: AuthStrategy) {}

  async createMethod<T>(
    address: Address,
    permission: T
  ): Promise<AuthMethod<T>> {
    if (this.strategy.type === "permit") {
      const permit = await this.strategy.signer.sign({
        permit_name: `SiennaJS permit for ${address}`,
        allowed_tokens: [address],
        permissions: [permission],
      });
      return { permit };
    } else {
      return { viewing_key: this.strategy.viewing_key };
    }
  }
}
