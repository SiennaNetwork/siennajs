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
}

export class IDO extends Client {}

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
