import * as Scrt from '@fadroma/scrt-amino'
import { TokenManager } from '@fadroma/tokens'
import { SecureRandom } from '@hackbg/formati'

export { randomBase64, SecureRandom } from '@hackbg/formati'
export { bold, colors } from '@fadroma/scrt-amino'
export * from '@fadroma/scrt-amino'
export * from '@fadroma/tokens'

/** Get the current time in seconds since the Unix epoch. */
export const now = () => Math.floor(+new Date() / 1000);

export class Deployment extends Scrt.Deployment {
  tokens: TokenManager = new TokenManager(()=>this as Scrt.Deployment)
}

export class VersionedDeployment<V> extends Scrt.VersionedDeployment<V> {
  tokens: TokenManager = new TokenManager(()=>this as Scrt.Deployment)
}

export function validatedAddressOf (instance?: { address?: Scrt.Address }): Scrt.Address {
  if (!instance)         throw new Error("Can't create an inter-contract link without a target")
  if (!instance.address) throw new Error("Can't create an inter-contract link without an address")
  return instance.address
}

/** Allow code hash to be passed with either cap convention; warn if missing or invalid. */
export function validatedCodeHashOf ({ code_hash, codeHash }: Hashed): Scrt.CodeHash|undefined {
  if (typeof code_hash === 'string') code_hash = code_hash.toLowerCase()
  if (typeof codeHash  === 'string') codeHash  = codeHash.toLowerCase()
  if (code_hash && codeHash && code_hash !== codeHash) {
    throw new Error('Passed an object with codeHash and code_hash both different')
  }
  return code_hash ?? codeHash
}

/** Objects that have a code hash in either capitalization. */
interface Hashed { code_hash?: Scrt.CodeHash, codeHash?: Scrt.CodeHash }

/** Contract address/hash pair (deserializes to `struct ContractLink` in the contract) */
export type LinkStruct = { address: Scrt.Address, code_hash: Scrt.CodeHash }

/** Convert Fadroma.Instance to address/hash struct (ContractLink) */
export const linkStruct = (instance: IntoLink) => ({
  address:   validatedAddressOf(instance),
  code_hash: validatedCodeHashOf(instance)
})

/** Objects that have an address and code hash.
  * Pass to linkTuple or linkStruct to get either format of link. */
export interface IntoLink extends Hashed {
  address: Scrt.Address
}

export interface Pagination {
  limit: number
  start: number
}

export interface PaginatedResponse <T> {
  /** The total number of entries stored by the contract. */
  total: number
  /** The entries on this page. */
  entries: T[]
}

/** Per-user contract-to-contract migrations. */
export class Emigration extends Scrt.Client {
  enableTo(link: Scrt.ContractLink) {
    return this.execute({ emigration: { enable_migration_to: link } });
  }
  disableTo(link: Scrt.ContractLink) {
    return this.execute({ emigration: { disable_migration_to: link } });
  }
}

/** Per-user contract-to-contract migrations. */
export class Immigration extends Scrt.Client {
  enableFrom(link: Scrt.ContractLink) {
    return this.execute({ immigration: { enable_migration_from: link } });
  }
  disableFrom(link: Scrt.ContractLink) {
    return this.execute({ immigration: { disable_migration_from: link } });
  }
  migrateFrom(link: Scrt.ContractLink) {
    return this.execute({ immigration: { request_migration: link } });
  }
}
