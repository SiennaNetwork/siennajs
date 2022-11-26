import { addZeros } from '@fadroma/core'

/** Number of digits after the decimal point in SIENNA token. */
export const SIENNA_DECIMALS = 18

/** 1 SIENNA = 1 * 10^18 uSIENNA */
export const ONE_SIENNA = BigInt(addZeros(1, SIENNA_DECIMALS))

/** Get the current time in seconds since the Unix epoch. */
export const now = () => Math.floor(+new Date() / 1000);

export { randomBase64, SecureRandom } from '@hackbg/formati'
export { CustomConsole, bold, colors } from '@hackbg/konzola'
export * from '@fadroma/scrt'
export * from '@fadroma/tokens'
