import {
    Address,
    Client,
    Coin,
    Duration,
    Fee,
    ContractLink,
    Moment,
    Uint128,
} from '@fadroma/client';
import { ViewingKey, ViewingKeyClient } from '@fadroma/client-scrt';
import {
    CustomToken,
    Snip20,
    Token,
    TokenKind,
    getTokenKind,
} from '@fadroma/tokens';

export class Launchpad extends Client {
    fees = {
        lock_snip20: new Fee('350000', 'uscrt'),
        lock_native: new Fee('280000', 'uscrt'),
        unlock_native: new Fee('280000', 'uscrt'),
        unlock_snip20: new Fee('350000', 'uscrt'),
    };

    vk = new ViewingKeyClient(this.agent, this);

    admin = new LaunchpadAdmin(this.agent, this);

    tokens: Token[] = [];
}

export class LaunchpadAdmin extends Client {
    fees = {
        admin_add_token: new Fee('3000000', 'uscrt'),
        admin_remove_token: new Fee('3000000', 'uscrt'),
    };
}

export class IDO extends Client {
    /** This method will perform the native token pre_lock.
     *
     *  IMPORTANT: if custom buy token is set, you have to use the SNIP20
     *  receiver callback interface to initiate pre_lock. */
    preLock<R>(amount: Uint128): Promise<R> {
        const msg = { amount };
        const opt = { send: [{ amount: `${amount}`, denom: 'uscrt' }] };
        return this.execute(msg, opt);
    }

    /** This method will perform the native token swap.
     *
     * IMPORTANT: if custom buy token is set, you have to use the SNIP20
     * receiver callback interface to initiate swap. */
    async swap<R>(amount: Uint128, recipient?: Address): Promise<R> {
        const info = await this.getSaleInfo();
        if (getTokenKind(info.input_token) == TokenKind.Native) {
            const msg = { swap: { amount, recipient } };
            const opt = {
                fee: new Fee('280000', 'uscrt'),
                send: [new Coin(amount, 'uscrt')],
            };
            return this.execute(msg, opt);
        }
        return this.agent
            .getClient(
                Snip20,
                (info.input_token as CustomToken).custom_token.contract_addr
            )
            .withFee(new Fee('350000', 'uscrt'))
            .send(amount, this.address, { swap: { recipient } });
    }

    async activate(
        sale_amount: Uint128,
        end_time: Moment,
        start_time?: Moment
    ) {
        const info = await this.getSaleInfo();
        return this.agent
            .getClient(Snip20, info.sold_token.address)
            .withFee(new Fee('300000', 'uscrt'))
            .send(sale_amount, this.address, {
                activate: { end_time, start_time },
            });
    }

    /** Check the amount user has pre locked and the amount user has swapped */
    async getBalance(
        key: ViewingKey,
        address: Address | undefined = this.agent.address
    ) {
        if (!address) {
            throw new Error('IDO#getBalance: specify address');
        }
        const { balance }: { balance: IDOBalance } = await this.query({
            balance: { address, key },
        });
        return balance;
    }

    /** Check the sale info of the IDO project */
    async getSaleInfo() {
        const { sale_info }: { sale_info: IDOSaleInfo } = await this.query(
            'sale_info'
        );
        return sale_info;
    }

    /** Check the sale status of the IDO project */
    async getStatus() {
        const { status }: { status: IDOSaleStatus } = await this.query(
            'sale_status'
        );
        return status;
    }

    /** Check if the address can participate in an IDO */
    async getEligibility(address: Address | undefined = this.agent.address) {
        if (!address) {
            throw new Error('IDO#getEligibility: specify address');
        }
        const { eligibility }: { eligibility: IDOEligibility } =
            await this.query({ eligibility_info: { address } });
        return eligibility;
    }

    admin = new IDOAdmin(this.agent, this);
}

export class IDOAdmin extends Client {
    fees = {
        admin_refund: new Fee('300000', 'uscrt'),
        admin_claim: new Fee('300000', 'uscrt'),
        admin_add_addresses: new Fee('300000', 'uscrt'),
    };

    /** After the sale ends, admin can use this method to
     * refund all tokens that weren't sold in the IDO sale */
    async refund<R>(recipient?: Address): Promise<R> {
        return await this.execute({ admin_refund: { address: recipient } });
    }

    /** After the sale ends, admin will use this method to
     * claim all the profits accumulated during the sale */
    async claim<R>(recipient?: Address): Promise<R> {
        return await this.execute({ admin_claim: { address: recipient } });
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
