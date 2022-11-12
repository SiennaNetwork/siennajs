export interface MarketState {
  /** Block height that the interest was last accrued at */
  accrual_block: number,
  /** Accumulator of the total earned interest rate since the opening of the market */
  borrow_index: Decimal256,
  /** Total amount of outstanding borrows of the underlying in this market */
  total_borrows: Uint256,
  /** Total amount of reserves of the underlying held in this market */
  total_reserves: Uint256,
  /** Total number of tokens in circulation */
  total_supply: Uint256,
  /** The amount of the underlying token that the market has. */
  underlying_balance: Uint128,
  /** Values in the contract that rarely change. */
  config: MarketConfig
}

export interface MarketConfig {
  /** Initial exchange rate used when minting the first slTokens (used when totalSupply = 0) */
  initial_exchange_rate: Decimal256,
  /** Fraction of interest currently set aside for reserves */
  reserve_factor: Decimal256,
  /** Share of seized collateral that is added to reserves */
  seize_factor: Decimal256
}

export interface MarketAccount {
  /** Amount of slToken that this account has. */
  sl_token_balance: Uint256,
  /** How much the account has borrowed. */
  borrow_balance: Uint256,
  /** The current exchange rate in the market. */
  exchange_rate: Decimal256
}

export interface MarketBorrower {
  id: string,
  /** Borrow balance at the last interaction of the borrower. */
  principal_balance: Uint256,
  /** Current borrow balance. */
  actual_balance: Uint256,
  liquidity: AccountLiquidity,
  markets: OverseerMarket[]
}

export interface SimulatedLiquidation {
  /** The amount that would be seized by that liquidation minus protocol fees. */
  seize_amount: Uint256,
  /** If the liquidation would be unsuccessful this will contain amount by which the seize amount falls flat. Otherwise, it's 0. */
  shortfall: Uint256
}

export interface OverseerMarket {
  contract:  ContractLink,
  /** The symbol of the underlying asset. Note that this is the same as the symbol
    * that the oracle expects, not what the actual token has in its storage. */
  symbol:    string,
  /** The decimals that the market has. Corresponds to the decimals of the underlying token. */
  decimals:  number,
  /** The percentage rate at which tokens can be borrowed given the size of the collateral. */
  ltv_ratio: Decimal256
}

/** One of the fields will always be 0, depending on the state of the account.*/
export interface AccountLiquidity {
  /** The USD value borrowable by the user, before it reaches liquidation. */
  liquidity: Uint256,
  /** If > 0 the account is currently below the collateral requirement and is subject to liquidation. */
  shortfall: Uint256
}

export interface OverseerConfig {
  /** The discount on collateral that a liquidator receives. */
  premium:      Decimal256,
  /** The percentage of a liquidatable account's borrow that can be repaid in a single liquidate transaction.
    * If a user has multiple borrowed assets, the close factor applies to any single borrowed asset,
    * not the aggregated value of a user’s outstanding borrowing. */
  close_factor: Decimal256
}

export type MarketPermissions = 'account_info' | 'balance' | 'id'

export type OverseerPermissions = 'account_info'

