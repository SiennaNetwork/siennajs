import { Address, Client } from '@hackbg/fadroma';

export class Multicall extends Client {
    async version(): Promise<MulticallVersion> {
        return this.query({ version: {} });
    }

    async multiChain(queries: MultiQuery[]) {
        return this.query({ multi_chain: { queries } });
    }
}

export interface MultiQuery {
    contract_address: Address;
    query: String;
}

export interface MultiQueryResult {
    error?: string;
    data?: String;
}

export type ChainResponse = MultiQueryResult[];

export enum MulticallVersion {
    'v0.0.1',
}
