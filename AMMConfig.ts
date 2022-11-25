import type {
  Class, Agent, Address, CodeHash, Contract, Token, Snip20, Uint128, ContractLink, TokenPair
} from './Core'
import type { Exchange } from './AMMExchange'
import type { LPToken } from './AMMLPToken'

/** Supported versions of the AMM subsystem. */
export type Version = 'v1'|'v2'

export interface Options {
  version:    Version
  swapPairs?: PairName[],
  swapFee?:   [number, number],
  siennaFee?: [number, number],
  burner?:    Address,
}

export interface Settings {
  admin: Address|null
  exchange_settings: {
    swap_fee:      { nom: number, denom: number }
    sienna_fee:    { nom: number, denom: number }
    sienna_burner: Address|null
  }
}

/** Format: SYMBOL0-SYMBOL1 */
export type PairName = string;

export interface ExchangeClass extends Class<Exchange, [
  Agent?, Address?, CodeHash?, Contract<Exchange>?, Partial<ExchangeOpts>?
]> {}

export interface ExchangeOpts {
  token_0:  Token,
  token_1:  Token,
  lpToken:  LPToken,
  pairInfo: PairInfo
}

/** An exchange is an interaction between 4 contracts. */
export interface ExchangeInfo {
  /** Shorthand to refer to the whole group. */
  name?: string;
  /** One token of the pair. */
  token_0: Snip20 | string;
  /** The other token of the pair. */
  token_1: Snip20 | string;
  /** The automated market maker/liquidity pool for the token pair. */
  exchange: Exchange;
  /** The liquidity provision token, which is minted to stakers of the 2 tokens. */
  lpToken: LPToken;
  /** The bare-bones data needed to retrieve the above. */
  raw: any;
  /** Response from PairInfo query */
  pairInfo?: PairInfo;
}

export interface PairInfo {
  amount_0: Uint128;
  amount_1: Uint128;
  factory: ContractLink;
  liquidity_token: ContractLink;
  pair: TokenPair;
  total_liquidity: Uint128;
  contract_version: number;
}

export type Exchanges = Record<PairName, Exchange>
