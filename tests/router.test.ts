import { AMMRouter, AMMRouterPair } from "../index"

function create_pairs(
  fn: (
    pair: (token_1: string, token_2: string) => void,
    native_pair: (token: string) => void
  ) => void
): AMMRouterPair[] {
  const result: AMMRouterPair[] = []
  let pair_index = 0

  function pair(token_1: string, token_2: string) {
    const pair = new AMMRouterPair(
      {
        custom_token: {
          contract_addr: token_1,
          token_code_hash: "code_hash",
        },
      },
      {
        custom_token: {
          contract_addr: token_2,
          token_code_hash: "code_hash",
        },
      },
      `pair_${pair_index}`,
      `pair_code_hash_${pair_index}`
    )
  
    pair_index++
    result.push(pair)
  }
  
  function pair_native(token: string) {
    const pair = new AMMRouterPair(
      {
        custom_token: {
          contract_addr: token,
          token_code_hash: "code_hash",
        },
      },
      {
        native_token: { denom: "uscrt" },
      },
      `pair_${pair_index}`,
      `pair_code_hash_${pair_index}`
    )
  
    pair_index++
    result.push(pair)
  }

  fn(pair, pair_native)

  return result
}

describe("Router hops test", () => {
  test("should find the shortest route", () => {
    const pairs = create_pairs((pair) => {
      pair("SSCRT", "SIENNA")
      pair("SIENNA", "SHD")
      pair("SHD", "ETH")
      pair("ETH", "BTC")
      pair("SHD", "BTC")
    })

    const router = new AMMRouter()
    let result = router.assemble(
      pairs,
      pairs[0].from_token,
      pairs[4].into_token
    )

    expect(result).toHaveLength(3)
    expect(result[0]).toHaveProperty("pair_address", "pair_0")
    expect(result[1]).toHaveProperty("pair_address", "pair_1")
    expect(result[2]).toHaveProperty("pair_address", "pair_4")

    result = router.assemble(pairs, pairs[4].into_token, pairs[0].from_token)

    expect(result).toHaveLength(3)
    expect(result[0]).toHaveProperty("pair_address", "pair_4")
    expect(result[1]).toHaveProperty("pair_address", "pair_1")
    expect(result[2]).toHaveProperty("pair_address", "pair_0")

    result = router.assemble(pairs, pairs[0].from_token, pairs[1].into_token)
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveProperty("pair_address", "pair_0")
    expect(result[1]).toHaveProperty("pair_address", "pair_1")

    expect(() => router.assemble(
      pairs,
      pairs[0].from_token,
      pairs[0].into_token
    )).toThrowError(AMMRouter.E03())
  })

  test("should find the best route among multiple roots", () => {
    const pairs = create_pairs((pair) => {
      pair("SSCRT", "SIENNA")
      pair("SIENNA", "SHD")
      pair("SHD", "ETH")
      pair("SSCRT", "JKWON")
      pair("ETH", "BTC")
      pair("SHD", "BTC")
      pair("BTC", "JKWON")
    })

    const router = new AMMRouter()
    const result = router.assemble(
      pairs,
      pairs[0].from_token,
      pairs[6].from_token
    )

    expect(result).toHaveLength(2)
    expect(result[0]).toHaveProperty("pair_address", "pair_3")
    expect(result[1]).toHaveProperty("pair_address", "pair_6")
  })

  test("should choose the shortest route with native pairs", () => {
    const pairs = create_pairs((pair, pair_native) => {
      pair("SSCRT", "SIENNA")
      pair("SIENNA", "SHD")
      pair("SHD", "ETH")
      pair("SSCRT", "JKWON")
      pair_native("SSCRT")
      pair("ETH", "BTC")
      pair_native("BTC")
    })

    const router = new AMMRouter()
    const result = router.assemble(
      pairs,
      pairs[0].from_token,
      pairs[5].into_token
    )
    
    expect(result).toHaveLength(2)
    expect(result[0]).toHaveProperty("pair_address", "pair_4")
    expect(result[1]).toHaveProperty("pair_address", "pair_6")
  })

  test("should not include routes with native denoms in the middle", () => {
    const pairs = create_pairs((pair, pair_native) => {
      pair("SSCRT", "SIENNA")
      pair("SIENNA", "SHD")
      pair("SHD", "ETH")
      pair("SSCRT", "JKWON")
      pair_native("JKWON")
      pair("ETH", "BTC")
      pair_native("BTC")
    })

    const router = new AMMRouter()
    const result = router.assemble(
      pairs,
      pairs[0].from_token,
      pairs[5].into_token
    )

    expect(result).toHaveLength(4)
    expect(result[0]).toHaveProperty("pair_address", "pair_0")
    expect(result[1]).toHaveProperty("pair_address", "pair_1")
    expect(result[2]).toHaveProperty("pair_address", "pair_2")
    expect(result[3]).toHaveProperty("pair_address", "pair_5")
  })
})
