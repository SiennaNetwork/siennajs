import type { Sienna } from './index'
import { VersionedDeployment } from '@fadroma/scrt'
import { Snip20 } from '@fadroma/tokens'

/** All subsystems of the Sienna DeFi system are versioned. */
export abstract class Versioned<V> extends VersionedDeployment<V> {

  workspace = this.config?.build?.project

  /** Whether the final bundle should be broadcast or saved for multisig signing. */
  multisig = false

  constructor (public context: Sienna, public version: V) {
    super(context, version)
    this.context.tokens.template = this.context.defineContract({
      client:   Snip20,
      crate:    'amm-snip20',
      revision: 'dev'
    })
    Object.defineProperty(this, 'config', { get () { return this.context.config } })
  }

  async deploy (): Promise<this> {
    throw new Error('This method must be implemented by the subclass.')
  }
}

export const Versions = {

  TGE: {
    'v1': 'legacy/amm-v2-rewards-v3'
  },

  AMM: {
    'v1': 'legacy/amm-v1',
    'v2': 'legacy/amm-v2-rewards-v3'
  },

  Rewards: {
    'v2':   'legacy/rewards-v2',
    'v3':   'legacy/amm-v2-rewards-v3',
    'v3.1': 'legacy/rewards-3.1.0',
    'v4.1': 'legacy/rewards-4.1.2',
    'v4.2': 'legacy/rewards-4.2.0'
  }

}
