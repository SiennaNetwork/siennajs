import { Client, Address } from "@fadroma/client"
import { Permit, Signer, ViewingKey } from '@fadroma/client-scrt'

export type AuthStrategy =
  | { type: 'permit', signer: Signer }
  | { type: 'vk', viewing_key: { address: Address, key: ViewingKey } }

export type AuthMethod <T> =
  | { permit: Permit<T> }
  | { viewing_key: { address: Address, key: ViewingKey } }

export class MockAuthClient extends Client {

  async update (second_contract: any) {
    return this.execute({ update: { second_contract } })
  }

}

export class AuthProvider extends Client {

  async createGroup (name: any, members: any) {
    return this.execute({ create_group: { name, members } })
  }

  async getGroup (name: string) {
    return this.query({ group: { name } })
  }

  async getOracle () {
    return this.query({ oracle: {} })
  }

  async getAdmin () {
    return this.query({ admin: { admin: {} } })
  }

}

export class Auth {

  static viewing_key (address: Address, key: ViewingKey): Auth {
    return new this({ type: 'vk', viewing_key: { address, key } })
  }

  static permit (signer: Signer): Auth {
    return new this({ type: 'permit', signer })
  }

  constructor (
    readonly strategy: AuthStrategy
  ) {}

  async createMethod <T> (address: Address, permission: T): Promise<AuthMethod<T>> {
    if (this.strategy.type === 'permit') {
      const permit = await this.strategy.signer.sign({
        permit_name: `SiennaJS permit for ${address}`,
        allowed_tokens: [address],
        permissions: [permission],
      })
      return { permit }
    } else {
      return { viewing_key: this.strategy.viewing_key }
    }
  }
}
