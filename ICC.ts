import * as Scrt from '@fadroma/scrt'

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

