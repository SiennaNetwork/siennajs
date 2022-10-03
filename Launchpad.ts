import {
  Address, Uint128,
  Contract, ContractLink, ContractMetadata,
  VersionedSubsystem,
  Snip20, ViewingKeyClient,
  CustomConsole, bold,
} from './Core';
import * as Auth from './Auth';
import * as TGE from './TGE';
import { Names } from './Names';
import type { SiennaDeployment } from "./index";
import { SiennaConsole } from "./index";

import CryptoJS from 'crypto-js';
import MerkleTree from 'merkletreejs';

export type Version = 'v1'

class LaunchpadDeployment extends VersionedSubsystem<Version> {
  log = new SiennaConsole(`Launchpad ${this.version}`)

  constructor (context: SiennaDeployment, version: Version) {
    super(context, version)
    context.attach(this, `lpd ${version}`, `Sienna Launch ${version}`)
  }

  /** The launchpad staking pool. */
  staking = this.context.tge['v1'].staking

  /** TODO: What does launchpad use RPT for? */
  rpts    = this.context.tge['v1'].rpts

  /** The launchpad contract. */
  lpd    = this.contract({ name: Names.Launchpad(this.version), client: Launchpad }).get()

  /** The known IDOs, matched by name */
  idos   = this.contract({ client: IDO }).getMany(Names.isIDO(this.version))

  /** The auth provider and oracle used by the deployment.
    * This allows the staking contract to see the user's balance
    * in the staking contract. */
  auth    = this.context.auth['v1'].provider('Launchpad').group('Rewards_and_Launchpad', [
    this.lpd,
    this.staking
  ])

  /** Display the status of the Launchpad/IDO system. */
  async showStatus () {
    const launchpad = await this.lpd
    this.log.authProvider(await launchpad.auth.getProvider())
    this.log.saleConstraints(await launchpad.saleConstraints())
    this.log.latestIdos(await launchpad.getIdos())
  }
}

export { LaunchpadDeployment as Deployment }

export class Launchpad extends ViewingKeyClient {

    get auth () { return new Auth.AuthClient(this.agent, this.address, this.codeHash) }

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
     */
    async addCreators(addresses: Address[]) {
        return this.execute({ add_project_owners: { addresses } });
    }

    /**
     * Get the entries for a list of users
     * @param auth Authentication method
     * @param addresses List of HumanAddr's to be checked
     * @param time Current timestamp
     * @returns Entries
     */
    async getEntries(
        auth: Auth.AuthMethod<LaunchpadPermissions>,
        addresses: Address[],
        time: number
    ): Promise<number[]> {
        return this.query({ get_entries: { auth, addresses, time } });
    }

    /**
     * Fetch the constraints to which every launched project is limited to.
     * @returns SaleConstraints
     */
    async saleConstraints(): Promise<SaleConstraints> {
        return this, this.query({ sale_constraints: {} });
    }
    /**
     * Get a paginated list of IDO's stored on the launchpad
     * @param start Starting page
     * @param limit Items per page
     * @returns IdoCollection
     */
    async getIdos(
        start: number = 0,
        limit: number = 5
    ): Promise<IdoCollection> {
        return this.query({ idos: { pagination: { start, limit } } });
    }

    async drawWinners(
        addresses: Address[],
        auth: Auth.AuthMethod<LaunchpadPermissions>,
        seatsOpen: number
    ): Promise<Address[]> {
        const entries = await this.getEntries(auth, addresses, Date.now());
        const mappedAccounts = addresses.map((addr, i) => ({
            address: addr,
            entries: entries[i],
        }));

        const winners = [];
        for (let i = 0; i < seatsOpen; i++) {
            const winner = this.weightedRandom(mappedAccounts);
            winners.push(winner);
            mappedAccounts.splice(mappedAccounts.indexOf(winner!), 1);
        }

        return winners.map((winner) => winner!.address);
    }

    private weightedRandom(accounts: { address: Address; entries: number }[]) {
        const weights: Array<number> = [];
        for (let i = 0; i < accounts.length; i++) {
            weights[i] = accounts[i].entries + (weights[i - 1] || 0);
        }

        const random = this.getRandomIntInclusive(
            0,
            weights[weights.length - 1]
        );

        for (let i = 0; i < weights.length; i++) {
            if (random < weights[i]) {
                return accounts[i];
            }
        }
    }

    private getRandomIntInclusive(min: number, max: number): number {
        var rval = 0;
        var range = max - min;

        var bits_needed = Math.ceil(Math.log2(range));
        if (bits_needed > 32) {
            throw new Error('Cannot use more than 32 bits');
        }
        var bytes_needed = Math.ceil(bits_needed / 8);
        var mask = Math.pow(2, bits_needed) - 1;
        // Create byte array and fill with N random numbers
        var byteArray = new Uint8Array(bytes_needed);
        //@ts-ignore
        window.crypto.getRandomValues(byteArray);

        var p = (bytes_needed - 1) * 8;
        for (var i = 0; i < bytes_needed; i++) {
            rval += byteArray[i] * Math.pow(2, p);
            p -= 8;
        }

        // Use & to apply the mask and reduce the number of recursive lookups
        rval = rval & mask;

        if (rval >= range) {
            // Integer out of acceptable range
            return this.getRandomIntInclusive(min, max);
        }
        // Return an integer that falls within the range
        return min + rval;
    }

    createMerkleTree(addresses: Address[]): MerkleTreeInfo {
        const leaves = addresses.map((addr) => CryptoJS.SHA256(addr));
        const tree = new MerkleTree(leaves, CryptoJS.SHA256);

        const root = tree.getRoot().toString('hex');

        return {
            leaves_count: tree.getLeafCount(),
            root,
        };
    }
}

export class IDO extends ViewingKeyClient {
    /**
     *
     * @param callback What kind of operation to perform. Swap | Launch | Prelock
     * @param amount The amount of tokens to send
     * @param token Which token to send
     * @returns
     */
    async deposit(callback: CallbackMsgType, amount: Uint128, token: Address) {
        return this.agent!
            .getClient(Snip20, token)
            .withFee(this.getFee('deposit')!)
            .send(amount, this.address!, callback);
    }

    /**
     * Swap the prelocked tokens for the project tokens.
     * @param recipient Address to send the tokens to
     *
     */
    async claimTokens(recipient?: Address) {
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
    async refundTokens(recipient?: Address) {
        return this.execute({ refund_tokens: { recipient } });
    }

    /**
     * Fetch all data about the project.
     *
     * @returns Project
     */
    async saleInfo(): Promise<Project> {
        return this.query({ sale_info: {} });
    }

    /**
     * Get detailed information about the project sale.
     *
     * @returns The current sale status
     */
    async saleStatus(): Promise<SaleStatus> {
        return this.query({ sale_status: {} });
    }
    
    /**
     * Fetch the account information for a user
     *
     * @param auth Authentication method
     * @returns Account
     */
    async account(auth: Auth.AuthMethod<IdoPermissions>): Promise<Account> {
        return this.query({ account: { auth } });
    }

    /**
     * Get the claimable amount for the given time.
     * 
     * @param auth Authentication method.
     * @param time Unix timestamp as seconds. If omitted provides the current time.
     * @returns Uint128
     */
    async claimable(auth: Auth.AuthMethod<IdoPermissions>, time?: number): Promise<Uint128> {
        return this.query({ claimable: {
            auth,
            time: time ? time : Math.floor(Date.now() / 1000)
        }});
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
    ): Promise<boolean> {
        return this.query({ eligibility: { address, auth } });
    }
}

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
