import { Permit, Signer, ViewingKey, Client, Address, ContractLink } from "@fadroma/scrt";
import { Pagination } from "./Pagination";

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
    return this.execute({ create_group: { name, members } });
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
