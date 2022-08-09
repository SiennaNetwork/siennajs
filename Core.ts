import * as Scrt from '@fadroma/scrt'
import { SecureRandom, Base64 } from '@hackbg/formati'

export const { b64encode, b64decode, b64fromBuffer } = Base64
export * from '@fadroma/scrt'
export * from '@fadroma/tokens'

/**
 * Base64 encoded
 */
export type ViewingKey = string

// These two are not exported in secretjs...
export interface Coin {
  readonly denom:  string;
  readonly amount: string;
}

export interface Fee {
  readonly amount: ReadonlyArray<Coin>
  readonly gas:    Scrt.Uint128
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

export function create_fee(amount: Scrt.Uint128, gas?: Scrt.Uint128): Fee {
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

export class ContractInfo {
  constructor(
    readonly code_hash: string,
    readonly address: Scrt.Address
  ) { }
}

export class ContractInstantiationInfo {
  constructor(
    readonly code_hash: string,
    readonly id: number
  ) { }
}

/** Support either casing of the codeHash parameter. */
interface IntoLink {
  address:    Scrt.Address,
  codeHash?:  Scrt.CodeHash,
  code_hash?: Scrt.CodeHash
}

/** Need both address and codeHash to create a linkTuple or linkStruct */
function validateLink (instance: IntoLink) {
  if (!instance) {
    throw new Error("Can't create an inter-contract link without a target")
  }
  if (!instance.address) {
    throw new Error("Can't create an inter-contract link without an address")
  }
  if (!instance.codeHash && !instance.code_hash) {
    throw new Error("Can't create an inter-contract link without a code hash")
  }
  if (instance.codeHash && instance.code_hash && (instance.codeHash!==instance.code_hash)) {
    throw new Error("Both code_hash and codeHash are present, and are different.")
  }
  return instance
}

/** Contract address/hash pair as used by MGMT */
export type LinkTuple = [Scrt.Address, Scrt.CodeHash]

/** Convert Fadroma.Instance to address/hash pair as used by MGMT */
export const linkTuple = (instance: IntoLink) => {
  validateLink(instance)
  return [ instance.address, instance.codeHash ?? instance.code_hash ]
}

/** Contract address/hash pair (ContractLink) */
export type LinkStruct = { address: Scrt.Address, code_hash: Scrt.CodeHash }

/** Convert Fadroma.Instance to address/hash struct (ContractLink) */
export const linkStruct = (instance: IntoLink) => {
  validateLink(instance)
  return {
    address: instance.address,
    code_hash: (instance.codeHash??instance.code_hash)!.toLowerCase()
  }
}

export const templateStruct = (template: Scrt.Template) => ({
  id:        Number(template.codeId),
  code_hash: template.codeHash?.toLowerCase()
})
