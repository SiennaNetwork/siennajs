import { VersionedSubsystem } from './Core'
import { SiennaConsole } from './Console'
import type { Version } from './AuthConfig'

export class AuthDeployment extends VersionedSubsystem<Version> {
  log = new SiennaConsole(`Auth ${this.version}`)

  /** The auth provider's RNG oracle.
    * TODO('how to find oracle on testnet/mainnet?')
    * return Settings.default.settings(this.chain.mode).auth.oracle */
  oracle = this.contract({
    name: Names.AuthOracle(this.version),
    ...(!this.devMode) ? {} : {
      name: 'MockRNGOracle', crate: 'auth-mock-oracle', initMsg: {}
    }
  })

  constructor (context: SiennaDeployment, version: Version = 'v1',) {
    super(context, version)
    context.attach(this, `auth ${this.version}`, `Sienna Auth Provider ${this.version}`)
  }

  /** The auth provider contract. */
  provider (name: string, oracle: Contract<Client> = this.oracle): AuthProviderDeployment {
    return new AuthProviderDeployment(this, this.version, name, oracle)
  }

  async showStatus () {
    // TODO
    for (const name in this.context.state) {
      if (name.includes('Auth')) this.log.info(`* ${name}`)
    }
  }
}

/** Manager class for multiple auth provider deployments. */

export class AuthProviderDeployment extends VersionedSubsystem<Version> {

  log = new SiennaConsole(`Auth ${this.version}`)

  provider = this.contract({
    client: AuthProvider,
    crate: 'auth-provider',
    initMsg: async () => {
      const admin   = this.agent?.address
      const entropy = randomBase64()
      const oracle  = (await this.oracle.deployed).asLink
      return { admin, entropy, oracle }
    }
  })

  constructor (
    context:             AuthDeployment,
    version:             Version = 'v1',
    public providerName: string,
    public oracle:       Contract<Client>
  ) {
    super(context.context, version)
    context.attach(this, providerName, `auth provider "${providerName}"`)
    this.provider.provide({ name: Names.NamedProvider(this.version, this.providerName) })
  }

  group (name: string, members: IntoArray<ContractLink> = []): Promise<this> {
    return this.task(`get or create auth group ${name}`, async () => {
      const provider = await this.provider.deployed
      ;(await intoArray(members)).forEach((member:any)=>member.asLink?member.asLink:member) // FIXME
      await provider.createGroup(name, await intoArray(members)) // TODO
      return this
    })
  }

  async deploy () {
    await this.provider
    return this
  }

  async showStatus () {
    // TODO
  }
}
