import { Address, Client, ContractLink, Uint128 } from '@fadroma/client';
import { ViewingKey, ViewingKeyClient } from '@fadroma/client-scrt';
import { Snip20 } from '@fadroma/tokens';
import { AuthMethod } from './Auth';

export class Launchpad extends Client {
    /**
     * Creates a new project
     * @param settings
     * @param entropy
     * @returns
     */
    async launch(settings: IdoSettings, entropy: String) {
        return this.execute({ launch: { settings, entropy } });
    }

    /**
     * Admin only transaction to add new creators
     * @param addresses List of users
     *
     */
    async add_creators(addresses: Address[]) {
        return this.execute({ add_project_owners: { addresses } });
    }

    /**
     *
     * Get the entries for a list of users
     * @param auth Authentication method
     * @param addresses List of HumanAddr's to be checked
     * @param time Current timestamp
     * @returns Entries
     */
    async get_entries(
        auth: AuthMethod<LaunchpadPermissions>,
        addresses: Address[],
        time: number
    ): Promise<number[]> {
        return this.query({ get_entries: { auth, addresses, time } });
    }

    /**
     * Fetch the constraints to which every launched project is limited to.
     *
     * @returns SaleConstraints
     */
    async sale_constraints(): Promise<SaleConstraints> {
        return this, this.query({ sale_constraints: {} });
    }
    /**
     * Get a paginated list of IDO's stored on the launchpad
     *
     * @param start Starting page
     * @param limit Items per page
     * @returns IdoCollection
     */
    async get_idos(
        start: number = 0,
        limit: number = 5
    ): Promise<IdoCollection> {
        return this.query({ idos: { pagination: { start, limit } } });
    }
}

export class IDO extends Client {
    /**
     *
     * @param callback What kind of operation to perform. Swap | Launch | Prelock
     * @param amount The amount of tokens to send
     * @param token Which token to send
     * @returns
     */
    async deposit(callback: CallbackMsgType, amount: Uint128, token: Address) {
        return this.agent
            .getClient(Snip20, token)
            .withFee(this.getFee('deposit'))
            .send(amount, this.address, callback);
    }

    /**
     * Swap the prelocked tokens for the project tokens.
     * @param recipient Address to send the tokens to
     *
     */
    async claim_tokens(recipient?: Address) {
        return this.execute({ claim_tokens: { recipient } });
    }
    /**
     * Refund tokens to the creator or someone else.
     * Viable when sale ends. Creator only transaction.
     *
     * @param return_type Wheter to swap the tokens or just refund them
     * @param address Whom to send the adress to
     * @returns
     */
    async refund_tokens(return_type: ReturnTokenType, address?: Address) {
        return this.execute({ refund_tokens: { address, return_type } });
    }

    /**
     * Fetch all data about the project.
     *
     * @returns Project
     */
    async sale_info(): Promise<Project> {
        return this.query({ sale_info: {} });
    }
    /**
     * Get detailed information about the project sale.
     *
     * @returns The current sale status
     */
    async sale_status(): Promise<SaleStatus> {
        return this.query({ sale_status: {} });
    }
    /**
     * Fetch the account information for a user
     *
     * @param auth Authentication method
     * @returns Account
     */
    async account(auth: AuthMethod<IdoPermissions>): Promise<Account> {
        return this.query({ account: { auth } });
    }
    /**
     * For a given user, check if he is whitelisted
     *
     * @param address Address to be checked
     * @param auth Partial merkle tree which is used for verification
     * @returns Eligibility of the address
     */
    async eligibility(
        address: Address,
        auth: MerkleAuth
    ): Promise<Eligibility> {
        return this.query({ eligibility: { address, auth } });
    }
}

interface SaleConfig {
    // The maximum amount of tokens a user can purchase
    max_allocation: Uint128;
    // The minimum amount of tokens a user can purchase
    min_allocation: Uint128;
    // What kind of sale this is.
    sale_type: SaleType;
}

enum SaleType {
    // Only supports prelocking tokens beforehand
    PreLock = 'pre_lock',
    // No prelocking. Only swapping once sale starts
    Swap = 'swap',
    // Both prelocking and swapping supported
    PreLockAndSwap = 'pre_lock_and_swap',
}

interface TokenSetup {
    name: string;
    symbol: string;
    admin?: Address;
    label?: string;
    decimals: number;
}

interface SwapConstants {
    // At which rate the input token is converted into the output token
    rate: Uint128;
    // How many decimals the input token has
    input_token_decimals: number;
    // How many decimals the output token has
    sold_token_decimals: number;
}

/**
 * Helper type around creating or linking existing token for the project
 */
type TokenRelay = { new: TokenSetup } | { existing: ContractLink };

interface ProjectConfig {
    // The setup or the link to the sold token
    sold: TokenRelay;
    // Link to the token that is to be used for buying
    input: ContractLink;
    // At which rate the input will be swapped into the output token
    rate: Uint128;
    // More configuration for the sale
    sale_config: SaleConfig;
}

interface TokenConfig {
    sold: TokenRelay;
    input: ContractLink;
    constants: SwapConstants;
}
enum ReturnTokenType {
    // Swap the tokens into the output
    Claim = 'claim',
    // Return the original tokens to the creator
    Refund = 'refund',
}

enum IdoPermissions {
    Balance = 'balance',
}

interface MerkleTreeInfo {
    root: string;
    leaves_count: number;
}
interface MerkleAuth {
    partial_tree: String[];
    index: number;
}
interface LaunchOptions {
    // How long the sale lasts
    sale_duration: number;
    // When this sale started
    sale_start?: number;
    // For how long can users prelock their tokens after sale starts
    pre_lock_duration?: number;
}

type CallbackMsgType =
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

interface IdoSettings {
    // All the configuration for the project
    project: ProjectConfig;
    // The merkle tree which corresponds to the whitelisted users
    merkle_tree: MerkleTreeInfo;
    // Optional address which can be set as admin of the project
    admin?: Address;
}
interface SaleConstraints {
    // The minimum amount of time a creator can set for prelock duration on his project
    min_pre_lock_duration: number;
    // The minimum amount of time a sale can last
    min_sale_duration: number;
}

enum LaunchpadPermissions {
    ProjectOwner = 'project_owner',
}
interface Tier {
    entries: number;
    amount: Uint128;
}

interface IdoCollection {
    // List of IDO links
    entries: ContractLink[];
    total: number;
}
interface Project {
    token_coonfig: TokenConfig;
    sale_config: SaleConfig;
    schedule?: SaleSchedule;
}
interface SaleSchedule {
    start: number;
    duration: number;
}
interface SaleStatus {
    // How many tokens have been sold
    total_allocation: Uint128;
    // How many tokens are left for sale
    available_for_sale: Uint128;
    // How many were prelocked
    prelocked: Uint128;
    // The time of launch
    launched?: number;
}
interface Account {
    owner: Address;
    total_bought: Uint128;
    pre_lock_amount: Uint128;
}
interface Eligibility {
    eligible: boolean;
    address: Address;
}
