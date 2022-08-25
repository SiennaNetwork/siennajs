import { AMMRouter, AMMRouterPair } from "../index";

let pair_index = 0;

function pair(token_1: string, token_2: string): AMMRouterPair {
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
  );

  pair_index++;

  return pair;
}

function pair_native(token: string): AMMRouterPair {
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
  );

  pair_index++;

  return pair;
}

describe("Router hops test", () => {
  test("should find the shortest route", () => {
    const pairs = [
      pair("SSCRT", "SIENNA"),
      pair("SIENNA", "SHD"),
      pair("SHD", "ETH"),
      pair("ETH", "BTC"),
      pair("SHD", "BTC"),
    ];

    const router = new AMMRouter();
    let result = router.assemble(
      pairs,
      pairs[0].from_token,
      pairs[4].into_token
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toHaveProperty("pair_address", "pair_0");
    expect(result[1]).toHaveProperty("pair_address", "pair_1");
    expect(result[2]).toHaveProperty("pair_address", "pair_4");

    result = router.assemble(pairs, pairs[4].into_token, pairs[0].from_token);

    expect(result).toHaveLength(3);
    expect(result[0]).toHaveProperty("pair_address", "pair_4");
    expect(result[1]).toHaveProperty("pair_address", "pair_1");
    expect(result[2]).toHaveProperty("pair_address", "pair_0");

    result = router.assemble(pairs, pairs[0].from_token, pairs[1].into_token);
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("pair_address", "pair_0");
    expect(result[1]).toHaveProperty("pair_address", "pair_1");

    result = router.assemble(pairs, pairs[0].from_token, pairs[0].into_token);
    expect(result).toHaveLength(1);
  });
});