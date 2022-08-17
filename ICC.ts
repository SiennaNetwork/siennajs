import * as Scrt from '@fadroma/scrt'

/** Contract templates. Passed to factory contracts so that the
    templates can be instantiated by transactions, returning subcontracts.
    (Which are not deployed through the deployment system and have to be tracked separately.) */
export class ContractInstantiationInfo {
  constructor(
    readonly code_hash: string,
    readonly id: number
  ) { }
}

/** `{ id, codeHash }` -> `{ id, code_hash }`; nothing else */
export const templateStruct = (template: Scrt.Template) => ({
  id:        Number(template.codeId),
  code_hash: validatedCodeHashOf(template)
})

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

/** Contract links. Passed to contracts to that they can talk to other contracts
    by returning messages invoking subsequent contract calls to known addresses. */
export class ContractInfo {
  constructor(
    readonly code_hash: string,
    readonly address: Scrt.Address
  ) { }
}

/** Contract address/hash pair as used by MGMT */
export type LinkTuple = [Scrt.Address, Scrt.CodeHash]

/** Convert Fadroma.Instance to address/hash pair as used by MGMT */
export const linkTuple = (instance: IntoLink) => (
  [ validatedAddressOf(instance), validatedCodeHashOf(instance) ]
)

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

export function validatedAddressOf (instance?: { address?: Scrt.Address }): Scrt.Address {
  if (!instance)         throw new Error("Can't create an inter-contract link without a target")
  if (!instance.address) throw new Error("Can't create an inter-contract link without an address")
  return instance.address
}
