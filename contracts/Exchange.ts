import { Agent, Client, Address, Uint128, Decimal } from '@fadroma/client'
import { Snip20, TokenType, TokenTypeAmount, TokenPair } from '@fadroma/tokens'

import { LPToken } from './LPToken'

export class AMMExchange extends Client {

  static get = async function getExchange (
    agent:   Agent,
    address: string,
    token_0: Snip20|TokenType,
    token_1: Snip20|TokenType,
  ): Promise<ExchangeInfo> {
    const exchangeCodeId   = await agent.getCodeId(address)
    const exchangeCodeHash = await agent.getHash(address)
    const EXCHANGE = agent.getClient(AMMExchange, {
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
      LP_TOKEN: agent.getClient(LPToken, { // The LP token contract
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

  async swap (
    amount:           TokenTypeAmount,
    recipient?:       Address,
    expected_return?: Decimal,
    fee = create_fee('100000')
  ) {
    if (get_token_type(amount.token) == TypeOfToken.Native) {
      const msg = {
        swap: {
          offer: amount,
          to: recipient,
          expected_return
        }
      }
      const transfer = add_native_balance(amount)
      return this.run(msg, '55000', transfer)
    }
    const msg = { swap: { to: recipient, expected_return } }
    const token_addr = (amount.token as CustomToken).custom_token.contract_addr;
    const snip20 = new Snip20Contract(token_addr, this.client)
    return snip20
      .exec(fee, this.memo)
      .send(this.address, amount.amount, msg)
  }

  async simulateSwap (amount: TokenTypeAmount): Promise<SwapSimulationResponse> {
    return this.query({ swap_simulation: { offer: amount } })
  }

  async simulateSwapReverse (ask_asset: TokenTypeAmount): Promise<ReverseSwapSimulationResponse> {
    return this.query({ reverse_simulation: { ask_asset } })
  }

}

export interface SwapSimulationResponse {
  return_amount:     Uint128
  spread_amount:     Uint128
  commission_amount: Uint128
}

export interface ReverseSwapSimulationResponse {
  offer_amount:      Uint128
  spread_amount:     Uint128
  commission_amount: Uint128
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
