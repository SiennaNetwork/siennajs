import {
  Instance,
  Template,
  Address,
  CodeHash,
  Uint128,
  Decimal,
  Decimal256,
} from '@fadroma/client'

import { b64encode, b64decode, b64fromBuffer } from "@waiting/base64"
export { b64encode, b64decode, b64fromBuffer }

import SecureRandom from 'secure-random'

export * from '@fadroma/client'
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
  readonly gas:    Uint128
}

export function decode_data<T>(result: { data: Buffer }): T {
  const b64string = b64fromBuffer(result.data)
  return JSON.parse(b64decode(b64string))
}

export function create_coin(amount: Uint128): Coin {
  return {
    denom: 'uscrt',
    amount: `${amount}`
  }
}

export function create_fee(amount: Uint128, gas?: Uint128): Fee {
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
    readonly address: Address
  ) { }
}

export class ContractInstantiationInfo {
  constructor(
    readonly code_hash: string,
    readonly id: number
  ) { }
}

/** Need both address and codeHash to create a linkTuple or linkStruct */
const validateLink = (instance: {address: Address, codeHash?: CodeHash}) => {
  if (!instance) throw new Error("Can't create an inter-contract link without a target")
  if (!instance.address) throw new Error("Can't create an inter-contract link without an address")
  if (!instance.codeHash) throw new Error("Can't create an inter-contract link without a code hash")
  return instance
}

/** Contract address/hash pair as used by MGMT */
export type LinkTuple = [Address, CodeHash]

/** Convert Fadroma.Instance to address/hash pair as used by MGMT */
export const linkTuple = (instance: {address: Address, codeHash?: CodeHash}) => {
  validateLink(instance)
  return [ instance.address, instance.codeHash ]
}

/** Contract address/hash pair (ContractLink) */
export type LinkStruct = { address: Address, code_hash: CodeHash }

/** Convert Fadroma.Instance to address/hash struct (ContractLink) */
export const linkStruct = (instance: {address: Address, codeHash?: CodeHash}) => {
  validateLink(instance)
  return { address: instance.address, code_hash: instance.codeHash?.toLowerCase() }
}

export const templateStruct = (template: Template) => ({
  id:        Number(template.codeId),
  code_hash: template.codeHash?.toLowerCase()
})
