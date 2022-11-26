import { Client, randomBase64, Snip20 } from '../Core'
import type { Address, Token, TokenPair, ContractInfo } from '../Core'
import type { Version, PairName } from './AMMConfig'
import { Exchange } from './AMMExchange'

export abstract class Factory extends Client {

  abstract readonly version: Version

  static "v1": typeof Factory_v1

  static "v2": typeof Factory_v2

  constructor (...args: ConstructorParameters<typeof Client>) {
    super(...args)
    setImmediate(()=>this.log.label = `AMM Factory ${this.version}`)
  }

  /** Pause or terminate the factory. */
  async setStatus(level: FactoryStatus, new_address?: Address, reason = "") {
    const set_status = { level, new_address, reason };
    return await this.execute({ set_status });
  }

  /** Create a liquidity pool, i.e. an instance of the Exchange contract */
  async createExchange(token_0: Token, token_1: Token) {
    const pair = { token_0, token_1 };
    const entropy = randomBase64();
    const message = { create_exchange: { pair, entropy } };
    const result = await this.execute(message);
    return result;
  }

  /** Create multiple exchanges with one transaction. */
  async createExchanges({ pairs }: CreateExchangesRequest): Promise<CreateExchangesResults> {
    // TODO: check for existing pairs and remove them from input
    // warn if passed zero pairs
    if (pairs.length === 0) {
      this.log.warn("Creating 0 exchanges.");
      return [];
    }
    // conform pairs
    const tokenPairs: [Token, Token][] = pairs.map(
      ({ pair: { token_0, token_1 } }) => {
        if (token_0 instanceof Snip20) token_0 = token_0.asDescriptor;
        if (token_1 instanceof Snip20) token_1 = token_1.asDescriptor;
        return [token_0, token_1];
      }
    );
    const newPairs: CreateExchangesResults = [];
    await this.agent!.bundle().wrap(async (bundle) => {
      for (const [token_0, token_1] of tokenPairs) {
        const exchange = await this.as(bundle).createExchange(token_0, token_1);
        newPairs.push({ token_0, token_1 });
      }
    });
    return newPairs;
  }

  async getAllExchanges (): Promise<Record<PairName, Exchange>> {
    const exchanges = await this.listExchangesFull()
    const result: Record<PairName, Exchange> = {}
    const pairNames = await Promise.all(exchanges.map(exchange=>exchange.pairName))
    //this.log.info('All exchanges:', pairNames.map(x=>bold(x)).join(', '))
    await Promise.all(exchanges.map(async exchange=>result[await exchange.pairName] = exchange))
    return result
  }

  /** Get multiple Exchange instances corresponding to
   * the passed token pairs. */
  async getExchanges(pairs: [Token, Token][]): Promise<Exchange[]> {
    return await Promise.all(
      pairs.map(([token_0, token_1]) => this.getExchange(token_0, token_1))
    );
  }

  /** Get an Exchange instance corresponding to
   * the exchange contract between two tokens. */
  async getExchange(token_0: Token, token_1: Token): Promise<Exchange> {
    const msg = { get_exchange_address: { pair: { token_0, token_1 } } };
    const result = await this.query(msg);
    const {
      get_exchange_address: { address },
    } = <{ get_exchange_address: { address: Address } }>result;
    return await Exchange.fromAddressAndTokens(
      this.agent!,
      address,
      token_0,
      token_1
    );
  }

  async getExchangeForPair(pair: TokenPair): Promise<Exchange|null> {
    const msg = { get_exchange_address: { pair } };
    const result: any = await this.query(msg);
    if (!result?.get_exchange_address?.address) return null
    return await Exchange.fromAddressAndTokens(
      this.agent!,
      result.get_exchange_address.address,
      pair.token_0,
      pair.token_1
    );
  }

  /** Get the full list of raw exchange info from the factory. */
  async listExchanges(limit = 30): Promise<FactoryExchangeInfo[]> {
    const result = [];
    let start = 0;
    while (true) {
      const msg = { list_exchanges: { pagination: { start, limit } } };
      const response: {
        list_exchanges: { exchanges: FactoryExchangeInfo[] };
      } = await this.query(msg);
      const {
        list_exchanges: { exchanges: list },
      } = response;
      if (list.length > 0) {
        result.push(...list);
        start += limit;
      } else {
        break;
      }
    }
    return result;
  }

  async listExchangesFull(): Promise<Exchange[]> {
    const exchanges = await this.listExchanges();
    return Promise.all(
      exchanges.map((info) => {
        const {
          pair: { token_0, token_1 },
        } = info;
        // @ts-ignore
        const address = info.address || info.contract.address;
        return Exchange.fromAddressAndTokens(
          this.agent!,
          address,
          token_0,
          token_1
        );
      })
    );
  }

  /** Return the collection of contract templates
   * (`{ id, code_hash }` structs) that the factory
   * uses to instantiate contracts. */
  async getTemplates(): Promise<FactoryInventory> {
    const { config } = await this.query({ get_config: {} }) as { config: FactoryInventory };
    return {
      snip20_contract: config.snip20_contract,
      pair_contract: config.pair_contract,
      lp_token_contract: config.lp_token_contract,
      ido_contract: config.ido_contract,
      launchpad_contract: config.launchpad_contract,
    };
  }

}

export class Factory_v1 extends Factory {
  readonly version: Version = "v1";
}

export class Factory_v2 extends Factory {
  readonly version: Version = "v2" as Version;
}

Factory.v1 = Factory_v1;

Factory.v2 = Factory_v2;

export type FactoryStatus = "Operational" | "Paused" | "Migrating";

/** The templates from which the factory instantiates contracts. */
export interface FactoryInventory {
  pair_contract:       ContractInfo
  lp_token_contract:   ContractInfo
  // unused, required by v1:
  snip20_contract?:    ContractInfo
  ido_contract?:       ContractInfo
  launchpad_contract?: ContractInfo
  // maybe needed?
  router_contract?:    ContractInfo
}

export interface FactoryExchangeInfo {
  address: string,
  pair: {
    token_0: Token,
    token_1: Token
  }
}

export interface CreateExchangeRequest {
  name?: string, pair: { token_0: Snip20|Token, token_1: Snip20|Token }
}
export interface CreateExchangesRequest {
  pairs: Array<CreateExchangeRequest>;
}
export interface CreateExchangesResult  {
  name?: string, token_0: Snip20|Token, token_1: Snip20|Token
}
export type CreateExchangesResults = Array<CreateExchangesResult>
