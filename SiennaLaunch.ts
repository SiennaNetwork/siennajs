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
    async sale_constraints(): Promise<SaleConstraints> {
        return this, this.query({ sale_constraints: {} });
    }
    async get_idos(
        start: number = 0,
        limit: number = 5
    ): Promise<IdoCollection> {
        return this.query({ idos: { pagination: { start, limit } } });
    }
}

export class IDO extends Client {
    async deposit(callback: CallbackMsgType, amount: Uint128, token: Address) {
        return this.agent
            .getClient(Snip20, token)
            .withFee(this.getFee('deposit'))
            .send(amount, this.address, callback);
    }
    async claim_tokens(recipient?: Address) {
        return this.execute({ claim_tokens: { recipient } });
    }
    async refund_tokens(return_type: ReturnTokenType, address?: Address) {
        return this.execute({ refund_tokens: { address, return_type } });
    }
    async sale_info(): Promise<Project> {
        return this.query({ sale_info: {} });
    }
    async sale_status(): Promise<SaleStatus> {
        return this.query({ sale_status: {} });
    }
    async account(auth: AuthMethod<IdoPermissions>): Promise<Account> {
        return this.query({ account: { auth } });
    }
    async eligibility(
        address: Address,
        auth: MerkleAuth
    ): Promise<Eligibility> {
        return this.query({ eligibility: { address, auth } });
    }
}

interface SaleConfig {
    max_allocation: Uint128;
    min_allocation: Uint128;
    sale_type: SaleType;
}

enum SaleType {
    PreLock = 'pre_lock',
    Swap = 'swap',
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
    rate: Uint128;
    input_token_decimals: number;
    sold_token_decimals: number;
}

type TokenRelay = { new: TokenSetup } | { existing: ContractLink };

interface ProjectConfig {
    sold: TokenRelay;
    input: ContractLink;
    rate: Uint128;
    sale_config: SaleConfig;
}

interface TokenConfig {
    sold: TokenRelay;
    input: ContractLink;
    constants: SwapConstants;
}
enum ReturnTokenType {
    Claim = 'claim',
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
    sale_duration: number;
    sale_start?: number;
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
    project: ProjectConfig;
    merkle_tree: MerkleTreeInfo;
    admin?: Address;
}
interface SaleConstraints {
    min_pre_lock_duration: number;
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
    total_allocation: Uint128;
    available_for_sale: Uint128;
    prelocked: Uint128;
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
