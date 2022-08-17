import * as Scrt from '@fadroma/scrt'
import { SecureRandom, Base64 } from '@hackbg/formati'

export const { b64encode, b64decode, b64fromBuffer } = Base64
export * from '@fadroma/scrt'
export * from '@fadroma/tokens'

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
