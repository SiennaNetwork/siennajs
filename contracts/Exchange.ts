import { Agent, Client, Snip20 } from '@hackbg/fadroma'
import { AMMVersion } from './Factory'
import { LPToken } from './LPToken'
import { Uint128 } from '../lib/core'
import { TokenType, TokenPair } from '../lib/amm/token'

export class AMMExchange extends Client {

  static get = async function getExchange (
    agent:   Agent,
    address: string,
    token_0: Snip20|TokenType,
    token_1: Snip20|TokenType,
    version = 'v2'
  ): Promise<ExchangeInfo> {
    const exchangeCodeId   = await agent.getCodeId(address)
    const exchangeCodeHash = await agent.getHash(address)
    const EXCHANGE = new AMMExchange(agent, {
      codeId:   exchangeCodeId,
      codeHash: exchangeCodeHash,
      address,
    })
    const { TOKEN: TOKEN_0, NAME: TOKEN_0_NAME } = await Snip20.fromTokenSpec(agent, token_0)
    const { TOKEN: TOKEN_1, NAME: TOKEN_1_NAME } = await Snip20.fromTokenSpec(agent, token_1)
    const name = `${TOKEN_0_NAME}-${TOKEN_1_NAME}`
    const { liquidity_token: { address: lpTokenAddress, codeHash: lpTokenCodeHash } } = await EXCHANGE.getPairInfo()
    const lpTokenCodeId = await agent.getCodeId(lpTokenAddress)
    return {
      raw: { // no methods, just data
        exchange: { address },
        lp_token: { address: lpTokenAddress, code_hash: lpTokenCodeHash },
        token_0,
        token_1,
      },
      name,     // The human-friendly name of the exchange
      EXCHANGE, // The exchange contract
      LP_TOKEN: new LPToken(agent, { // The LP token contract
        codeId:   lpTokenCodeId,
        codeHash: lpTokenCodeHash,
        address:  lpTokenAddress,
      }),
      TOKEN_0,  // One token of the pair
      TOKEN_1,  // The other token of the pair
    }

  }

  async addLiquidity (
    pair:     TokenPair,
    amount_0: Uint128,
    amount_1: Uint128
  ) {
    const msg = { add_liquidity: { deposit: { pair, amount_0, amount_1 } } }
    const result = await this.execute(msg)
    return result
  }

  async getPairInfo () {
    const { pair_info } = await this.query("pair_info")
    return pair_info
  }

}

/** An exchange is an interaction between 4 contracts. */
export interface ExchangeInfo {
  /** Shorthand to refer to the whole group. */
  name?: string
  /** One token. */
  TOKEN_0:  Snip20|string,
  /** Another token. */
  TOKEN_1:  Snip20|string,
  /** The automated market maker/liquidity pool for the token pair. */
  EXCHANGE: AMMExchange,
  /** The liquidity provision token, which is minted to stakers of the 2 tokens. */
  LP_TOKEN: LPToken,
  /** The bare-bones data needed to retrieve the above. */
  raw:      any
}


