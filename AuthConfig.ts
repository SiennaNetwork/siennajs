import {
  Address,
  Client,
  Contract,
  CodeHash,
  ContractLink,
  IntoArray,
  IntoLink,
  Names,
  Pagination,
  Permit,
  Signer,
  VersionedSubsystem,
  ViewingKey,
  intoArray,
  linkStruct,
} from "./Core";
import type { SiennaDeployment } from "./index";
import { SiennaConsole } from "./index";

export type Version = 'v1'


export { AuthDeployment as Deployment, AuthProviderDeployment as ProviderDeployment }

export type AuthStrategy =
  | { type: "permit"; signer: Signer }
  | { type: "vk"; viewing_key: { address: Address; key: ViewingKey } };

export type AuthMethod<T> =
  | { permit: Permit<T> }
  | { viewing_key: { address: Address; key: ViewingKey } };

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
