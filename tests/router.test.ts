import { AMMRouter, AMMRouterPair, AMMRouterHop } from "../index"

const pairs: any = require('./pairs.json')
const routerPairs: AMMRouterPair[] = pairs.map(
  (x: any) =>
    new AMMRouterPair(
      x.from_token,
      x.into_token,
      x.pair_address,
      x.pair_code_hash,
    ),
)

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

describe("Router hops assembly", () => {
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

  test("should throw an error when no routes exist", () => {
    const pairs = create_pairs((pair, pair_native) => {
      pair("SSCRT", "SIENNA")
      pair("SIENNA", "SHD")
      pair_native("SHD")
      pair_native("ETH")
      pair("ETH", "BTC")
      pair("SSCRT", "SHD")
      pair("SHD", "OSMO")
    })

    expect(() => {
      const router = new AMMRouter()

      router.assemble(
        pairs,
        pairs[0].from_token,
        pairs[4].into_token
      )
    }).toThrowError(AMMRouter.E02())
  })

  test('should assemble correct route with 2 hops', () => {
    const routerContract = new AMMRouter()

    // Sienna
    const customFromToken = {
      custom_token: {
        contract_addr: 'secret12vy64457jysxf3x4hwr64425ztlauq98zchpgt',
        token_code_hash:
          '46e5bca7904e5247952a831cfe426586f614767ec1485bfb2d78c40ae5bf10c8',
      },
    }

    // SILK
    const customToToken = {
      custom_token: {
        contract_addr: 'secret18k8a6lytr3gxppv96qus5qazg093gks7pk4q5x',
        token_code_hash:
          '5266a630e2b8ef910fb2515e1d3b5be95d4bd48358732788d8fcd984ee966bc1',
      },
    }

    const hops: AMMRouterHop[] = routerContract.assemble(
      routerPairs,
      customFromToken,
      customToToken,
    )

    expect(hops).toHaveLength(2)
    // SIENNA<>sSCRT
    expect(hops[0].pair_address).toEqual(
      'secret1g3xnvw0cw5a9qdvwu73k8kuu5nue3qqdawxzy4',
    )
    // sSCRT<>SILK
    expect(hops[1].pair_address).toEqual(
      'secret1tgqnx0yqtdjx4k2cspggm5ur8yz9vgm0h4tlwj',
    )
  })

  test('should assemble correct route with 2 hops in reverse', () => {
    const routerContract = new AMMRouter()

    // SILK
    const customFromToken = {
      custom_token: {
        contract_addr: 'secret18k8a6lytr3gxppv96qus5qazg093gks7pk4q5x',
        token_code_hash:
          '5266a630e2b8ef910fb2515e1d3b5be95d4bd48358732788d8fcd984ee966bc1',
      },
    }

    // Sienna
    const customToToken = {
      custom_token: {
        contract_addr: 'secret12vy64457jysxf3x4hwr64425ztlauq98zchpgt',
        token_code_hash:
          '46e5bca7904e5247952a831cfe426586f614767ec1485bfb2d78c40ae5bf10c8',
      },
    }

    const hops: AMMRouterHop[] = routerContract.assemble(
      routerPairs,
      customFromToken,
      customToToken,
    )

    expect(hops).toHaveLength(2)
    // SILK<>SHD
    expect(hops[0].pair_address).toEqual(
      'secret1ktv5j6qtadq3yeurpdvzymz9ffvs5aalymxl0y',
    )
    // SHD<>SIENNA
    expect(hops[1].pair_address).toEqual(
      'secret1c8pxr9d7hgul6wdun3ktt64tjn53ass3y6sn9t',
    )
  })
})
