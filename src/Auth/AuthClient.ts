import { Client } from '../Core'
import type { AuthProvider } from './AuthProvider'

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

export class MockAuthClient extends Client {
  async update(second_contract: any) {
    return this.execute({ update: { second_contract } });
  }
}
