import { CustomConsole, bold, colors } from '@hackbg/konzola'
import { ViewingKeyClient, Address, ContractLink, Uint128 } from '@fadroma/scrt';
import { Snip20 } from '@fadroma/tokens';
import { VersionedDeployment } from './Core';
import AuthProviderDeployment, { AuthClient, AuthMethod } from './Auth';
import TGEDeployment, { RPT_TGE } from './SiennaTGE';
import sha256 from 'crypto-js/sha256';
import MerkleTree from 'merkletreejs';

export default class LaunchpadDeployment extends VersionedDeployment<'v1'> {
  names = {
    /** The name of the launchpad contract. */
    launchpad: `Launchpad[${this.version}]`,
    /** Name of group in auth provider that authorizes the rewards and launchpad contracts. */
    authGroup: 'Rewards_and_Launchpad',
    /** Matches IDOs */
    ido: (name: string) => name.startsWith(`${this.names.launchpad}.IDO[`)
  }
  /** The TGE containing the token and RPT used by the deployment. */
  tge = new TGEDeployment(this)
  /** The token staked in the launchpad pool. */
  get token () { return this.tge.token }
  /** TODO: What does launchpad use RPT for? */
  get rpt   () { return this.tge.rpt }
  /** The auth provider and oracle used by the deployment. */
  auth = new AuthProviderDeployment(this, 'v1', this.names.authGroup)
  /** The launchpad contract. */
  launchpad = this.contract({ name: this.names.launchpad, client: Launchpad })
  /** The known IDOs, matched by name */
  idos = this.filter(this.names.ido).map(receipt=>this.contract({ ...receipt, client: IDO }))
  /** Print the status of the Launchpad/IDO system. */
  status = async () => {
    const launchpad = await this.launchpad
    log.authProvider(await launchpad.auth.getProvider())
    log.saleConstraints(await launchpad.saleConstraints())
    log.latestIdos(await launchpad.getIdos())
    console.info('Auth provider:')
    console.info(' ', JSON.stringify(await launchpad.auth.getProvider()))
    console.info('Latest IDOs:')
  }
}

const log = new class SiennaLaunchConsole extends CustomConsole {
  authProvider (x: any) {
    this.info('Auth provider:')
    this.info(' ', JSON.stringify(x))
  }
  saleConstraints (x: any) {
    console.info('Sale constraints:')
    console.info(' ', x)
  }
  latestIdos (x: any) {
    for (const ido of x.entries) {
      console.info(' -', JSON.stringify(ido))
    }
  }
}(console, 'Sienna Launch')

export class Launchpad extends ViewingKeyClient {

    get auth () { return new AuthClient(this.agent, this.address, this.codeHash) }

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
        auth: AuthMethod<LaunchpadPermissions>,
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
        auth: AuthMethod<LaunchpadPermissions>,
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
        const leaves = addresses.map((addr) => sha256(addr));
        const tree = new MerkleTree(leaves, sha256);

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
            .withFee(this.getFee('deposit'))
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
    async account(auth: AuthMethod<IdoPermissions>): Promise<Account> {
        return this.query({ account: { auth } });
    }

    /**
     * Get the claimable amount for the given time.
     * 
     * @param auth Authentication method.
     * @param time Unix timestamp as seconds. If omitted provides the current time.
     * @returns Uint128
     */
    async claimable(auth: AuthMethod<IdoPermissions>, time?: number): Promise<Uint128> {
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
    token_coonfig: TokenConfig;
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
