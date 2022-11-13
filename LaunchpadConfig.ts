import type { Uint128, Address } from './Core'

export type Version = 'v1'

export interface SaleConfig {
    /**
     * The maximum amount of tokens a user can purchase.
     */
    max_allocation: Uint128;
    /**
     * The minimum amount of tokens a user can purchase
     */
    min_allocation: Uint128;
    sale_type: SaleType;
    vesting_config?: VestingConfig
}

export enum SaleType {
    /**
     * Only supports prelocking tokens beforehand.
     */
    PreLock = 'pre_lock',
    /**
     * No prelocking. Only swapping once sale starts.
     */
    Swap = 'swap',
    /**
     * Both prelocking and swapping supported.
     */
    PreLockAndSwap = 'pre_lock_and_swap',
}

/**
 * One-off: The total amount bought by the user is unlocked only after the set duration. Time is a Unix timestamp in seconds.
 * 
 * Periodic: The amount bought by the user is unlocked gradually - over X amount of days, divided evenly into portions.
 */
 export type VestingConfig =
    /**
     * Unlock the full amount at the end of the duration given.
     * Time is a Unix timestamp in seconds.
     */
    { one_off: number } |
    /**
     * Gradually unlock the vested amount over the number of days given.
     * Each day, unlocks a portion of the amount.
     */
    { periodic: number }

export interface TokenSetup {
    name: string;
    symbol: string;
    admin?: Address;
    label?: string;
    decimals: number;
}

export interface SwapConstants {
    /**
     * At what rate the input token is converted into the output token.
     * The number has to correspond to the decimals of the sold token.
     * 
     * E.g: If we want 1:1 rate and the sold token has 6 decimals, then rate = 1_000_000
     * 
     * E.g: If we want 2:1 rate and the sold token has 6 decimals, then rate = 5_000_00 (1_000_000 / 2)
     */
    rate: Uint128;
    /**
     * How many decimals the input token has.
     */
    input_token_decimals: number;
    /**
     * How many decimals the output token has.
     */
    sold_token_decimals: number;
}

/**
 * Helper type around creating or linking existing token for the project.
 */
export type TokenRelay = { new: TokenSetup } | { existing: ContractLink };

export interface ProjectConfig {
    /**
     * The setup or the link to the sold token.
     */
    sold: TokenRelay;
    /**
     * Link to the token that is to be used for buying.
     */
    input: ContractLink;
    /**
     * At what rate the input token is converted into the output token.
     * The number has to correspond to the decimals of the sold token.
     * 
     * E.g: If we want 1:1 rate and the sold token has 6 decimals, then rate = 1_000_000
     * 
     * E.g: If we want 2:1 rate and the sold token has 6 decimals, then rate = 5_000_00 (1_000_000 / 2)
     */
    rate: Uint128;
    sale_config: SaleConfig;
}

export interface TokenConfig {
    sold: TokenRelay;
    input: ContractLink;
    constants: SwapConstants;
}

export enum IdoPermissions {
    Balance = 'balance',
    Account = 'account'
}

export interface MerkleTreeInfo {
    /**
     * Base64 encoded.
     */
    root: string;
    leaves_count: number;
}

export interface MerkleAuth {
    /**
     * Base64 encoded.
     */
    partial_tree: string[];
    index: number;
}

export interface LaunchOptions {
    /**
     * How long the sale lasts. Unix timestamp in seconds.
     */
    sale_duration: number;
    /**
     * Start time of the sale. Unix timestamp in seconds.
     */
    sale_start?: number;
    /**
     * How long is the prelock period. Unix timestamp in seconds.
     */
    pre_lock_duration?: number;
}

export interface Account {
    owner: Address
    total_bought: Uint128
    pre_lock_amount: Uint128
    total_claimed?: Uint128
}

export type CallbackMsgType =
    | { launch: { options: LaunchOptions } }
    | {
          pre_lock: {
              auth: MerkleAuth;
          };
      }
    | {
          swap: {
              auth: MerkleAuth;
              recipient: Address;
          };
      };

// launchpad

export interface IdoSettings {
    /**
     * All the configuration for the project.
     */
    project: ProjectConfig;
    /**
     * The merkle tree which corresponds to the whitelisted users.
     */
    merkle_tree: MerkleTreeInfo;
    /**
     * Optional address which can be set as admin of the project.
     */
    admin?: Address;
}

export interface SaleConstraints {
    /**
     * The minimum amount of time a creator can set for prelock duration on his project.
     */
    min_pre_lock_duration: number
    /**
     * The minimum amount of time a sale can last.
     */
    min_sale_duration: number
}

export enum LaunchpadPermissions {
    ProjectOwner = 'project_owner'
}

export interface Tier {
    entries: number
    amount: Uint128
}

export interface IdoCollection {
    // List of IDO links
    entries: ContractLink[];
    total: number;
}

export interface Project {
    token_config: TokenConfig;
    sale_config: SaleConfig;
    schedule?: SaleSchedule;
}

export interface SaleSchedule {
    start: number;
    duration: number;
}

export interface SaleStatus {
    /**
     * How many tokens have been sold.
     */
    total_allocation: Uint128
    /**
     * How many tokens are left for sale.
     */
    available_for_sale: Uint128
    /**
     * How many were prelocked.
     */
    total_prelocked: Uint128
    total_bought: Uint128
    /**
     * The time of launch. Unix timestamp in seconds.
     */
    launched?: number
}

