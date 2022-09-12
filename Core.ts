import * as Scrt from '@fadroma/scrt'
import { TokenRegistry } from '@fadroma/tokens'
import { SecureRandom, Base64 } from '@hackbg/formati'

export const { b64encode, b64decode, b64fromBuffer } = Base64
export { randomBase64, SecureRandom } from '@hackbg/formati'
export { CustomConsole, bold, colors } from '@hackbg/konzola'
export * from '@fadroma/scrt'
export * from '@fadroma/tokens'
export * as YAML from 'js-yaml'

/** Get the current time in seconds since the Unix epoch. */
export const now = () => Math.floor(+new Date() / 1000);

// These two are not exported in secretjs...
export interface Coin {
  readonly denom:  string;
  readonly amount: string;
}

export function decode_data<T>(result: { data: Buffer }): T {
  const b64string = b64fromBuffer(result.data)
  return JSON.parse(b64decode(b64string))
}

export function create_coin(amount: Scrt.Uint128): Coin {
  return {
    denom: 'uscrt',
    amount: `${amount}`
  }
}

export function create_fee(amount: Scrt.Uint128, gas?: Scrt.Uint128): Scrt.IFee {
  if (gas === undefined) {
    gas = amount
  }

  return {
    amount: [{ amount: `${amount}`, denom: "uscrt" }],
    gas: `${gas}`,
  }
}

export function create_base64_msg(msg: object): string {
  return b64encode(JSON.stringify(msg))
}

export function create_entropy (bytes = 32): string {
  return SecureRandom.randomBuffer(bytes).toString('base64')
}

export class Deployment extends Scrt.Deployment {
  tokens: TokenRegistry = new TokenRegistry(this)
}

export class VersionedDeployment<V> extends Scrt.VersionedDeployment<V> {
  tokens: TokenRegistry = new TokenRegistry(this)
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
