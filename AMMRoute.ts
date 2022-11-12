interface Route {
  indices: number[],
  from_tokens: Token[]
}

class RouterError {
  static E00 = () =>
    new Error("Router#assemble: no token pairs provided");
  static E01 = () =>
    new Error("Router#assemble: can't swap token with itself");
  static E02 = () =>
    new Error("Router#assemble: could not find route for given pair");
  static E03 = () =>
    new Error("Router#assemble: a pair for the provided tokens already exists");
}

export class Router extends Client {
  supportedTokens: Token[] | null = null;
  /** Register one or more supported tokens to router contract. */
  async register (...tokens: (Snip20|Token)[]) {
    tokens = tokens.map(token=>(token instanceof Snip20) ? token.asDescriptor : token)
    const result = await this.execute({ register_tokens: { tokens } })
    this.supportedTokens = await this.getSupportedTokens()
    return result
  }
  async populate () {
    await this.fetchCodeHash()
    this.supportedTokens = await this.getSupportedTokens()
    return this
  }
  async getSupportedTokens (): Promise<Token[]> {
    const tokens = await this.query({ supported_tokens: {} }) as Address[]
    return await Promise.all(tokens.map(async address=>{
      const token = this.agent!.getClient(Snip20, address)
      await token.populate()
      return token.asDescriptor
    }))
  }

  assemble(
    known_pairs: RouterPair[],
    from_token: Token,
    into_token: Token
  ): RouterHop[] {
    const map_route = (route: Route): RouterHop[] => {
      const result: RouterHop[] = []

      for (let i = 0; i < route.indices.length; i++) {
        const pair = known_pairs[route.indices[i]]

        result.push({
          from_token: route.from_tokens[i],
          pair_address: pair.pair_address,
          pair_code_hash: pair.pair_code_hash
        })
      }

      return result
    }

    let best_route: Route | null = null

    for (let i = 0; i < known_pairs.length; i++) {
      const pair = known_pairs[i]
      if (pair.contains(from_token)) {
        if (pair.contains(into_token)) {
          throw RouterError.E03()
        }

        const route = this.buildRoute(known_pairs, from_token, into_token, i)

        if (!route) {
          continue
        } else if (route.indices.length == 2) {
          return map_route(route)
        } else if (!best_route ||
          best_route.indices.length > route.indices.length
        ) {
          best_route = route
        }
      }
    }

    if (best_route) {
      return map_route(best_route)
    }

    throw RouterError.E02()
  }

  private buildRoute(
    known_pairs: RouterPair[],
    from_token: Token,
    into_token: Token,
    root: number
  ): Route | null {
    const queue: Route[] = [{
      indices: [root],
      from_tokens: [from_token]
    }]

    while (queue.length > 0) {
      const route = queue.pop() as Route
      const prev = known_pairs[route.indices[route.indices.length - 1]]

      const next_token = prev.getOtherToken(
        route.from_tokens[route.from_tokens.length - 1]
      ) as Token

      for (let i = 0; i < known_pairs.length; i++) {
        const pair = known_pairs[i]

        // The router cannot have pairs with native
        // tokens in the middle of the route.
        if (route.indices.includes(i) ||
          (!pair.contains(into_token) && pair.hasNative())) {
          continue
        }

        if (pair.contains(next_token)) {
          const next_route = {
            indices: [...route.indices, i],
            from_tokens: [...route.from_tokens, next_token]
          }

          if (pair.contains(into_token)) {
            return next_route
          } else {
            queue.unshift(next_route)
          }
        }
      }
    }

    return null
  }

  async swap(route: RouterHop[], amount: Uint128) {}
}

/** Represents a single step of the exchange */
export class RouterPair {

  constructor(
    readonly from_token:     Token,
    readonly into_token:     Token,
    readonly pair_address:   Address,
    readonly pair_code_hash: string
  ) { }

  get from_token_id (): string { return getTokenId(this.from_token) }

  get into_token_id (): string { return getTokenId(this.into_token) }

  eq (other: RouterPair): boolean {
    return this.contains(other.from_token) && this.contains(other.into_token)
  }

  hasNative(): boolean {
    return this.from_token_id === 'native' ||
      this.into_token_id === 'native'
  }

  getOtherToken(token: Token): Token | null {
    const id = getTokenId(token)

    if (this.from_token_id === id) {
      return this.into_token
    } else if (this.into_token_id === id) {
      return this.from_token
    }

    return null
  }

  contains(token: Token): boolean {
    const id = getTokenId(token)

    return this.from_token_id === id ||
      this.into_token_id === id
  }

  intersection (other: RouterPair): Token[] {
    const result: Token[] = []

    if (this.contains(other.from_token)) {
      result.push(other.from_token)
    }

    if (this.contains(other.into_token)) {
      result.push(other.into_token)
    }

    return result
  }

  asHop (): RouterHop {
    const { from_token, pair_address, pair_code_hash } = this
    return { from_token, pair_address, pair_code_hash }
  }

  /** Return a new RouterPair with the order of the two tokens swapped. */
  reverse (): RouterPair {
    const { from_token, into_token, pair_address, pair_code_hash } = this
    return new RouterPair(into_token, from_token, pair_address, pair_code_hash);
  }

}

/** The result of the routing algorithm is an array of `RouterHop` objects.
  *
  * Those represent a swap that the router should perform,
  * and are passed to the router contract's `Receive` method.
  *
  * The important constraint is that the native token, SCRT,
  * can only be in the beginning or end of the route, because
  * it is not a SNIP20 token and does not support the `Send`
  * callbacks that the router depends on for its operation. */
export interface RouterHop {
  from_token:     Token
  pair_address:   Address,
  pair_code_hash: CodeHash
}

