import type { AuthStrategy, AuthMethod } from '../Auth/Auth'
import type { Address, ViewingKey, Signer } from '../Core'

export class LendAuth {

  private constructor (private readonly strategy: AuthStrategy) { }

  static vk (address: Address, key: ViewingKey): LendAuth {
    return new this({ type: 'vk', viewing_key: { address, key } })
  }

  static permit (signer: Signer): LendAuth {
    return new this({ type: 'permit', signer })
  }

  async createMethod <T> (address: Address, permission: T): Promise<AuthMethod<T>> {
    if (this.strategy.type === 'permit') {
      const permit = await this.strategy.signer.sign({
        permit_name: `SiennaJS permit for ${address}`,
        allowed_tokens: [ address ],
        permissions: [ permission ]
      })
      return { permit }
    } else {
      return { viewing_key: this.strategy.viewing_key }
    }
  }

}
