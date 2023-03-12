import { Address, Client } from './core';

import { MulticallVersion } from './Versions';

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
