import {
  Address,
  Client
} from './Core';

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
  query: string;
}

export interface MultiQueryResult {
  error?: string;
  data?: string;
}

export type ChainResponse = MultiQueryResult[];

export enum MulticallVersion {
  'v0.0.1',
}
