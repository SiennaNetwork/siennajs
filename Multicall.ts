import { Address, Client } from './Core';

export class Multicall extends Client {
  async version(): Promise<MulticallVersion> {
    return this.query({ version: {} });
  }

  async multiChain(queries: MultiQuery[]): Promise<MultiQueryResult[]> {
    return this.query({ batch_query: { queries } });
  }
}

export interface MultiQuery {
  contract_address: Address;
  code_hash: string;
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
