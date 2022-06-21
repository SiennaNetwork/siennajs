import { Instance, Template } from '@fadroma/client'
import { b64encode, b64decode, b64fromBuffer } from "@waiting/base64"
import SecureRandom from 'secure-random'

export type Uint128 = string;
export type Uint256 = string;
export type Address = string;
export type Decimal = string;
export type Decimal256 = string;

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

export const linkTuple = (instance: Instance) => [
  instance.address,
  instance.codeHash
]

export const linkStruct = (instance: Instance) => ({
  address:   instance?.address,
  code_hash: instance?.codeHash?.toUpperCase()
})

export const templateStruct = (template: Template) => ({
  id:        Number(template.codeId),
  code_hash: template.codeHash?.toUpperCase()
})
