import { AMMRouter, AMMRouterHop, AMMRouterPair, Token } from '../index';
const pairs: any = require('./pairs.json');

describe('Router hop assembly', () => {
  test('should assemble correct route with 2 hops', () => {
    const routerPairs: AMMRouterPair[] = pairs.map(
      (x: any) =>
        new AMMRouterPair(
          x.from_token,
          x.into_token,
          x.pair_address,
          x.pair_code_hash,
        ),
    );

    const routerContract = new AMMRouter();

    // Sienna
    const customFromToken = {
      custom_token: {
        contract_addr: 'secret12vy64457jysxf3x4hwr64425ztlauq98zchpgt',
        token_code_hash:
          '46e5bca7904e5247952a831cfe426586f614767ec1485bfb2d78c40ae5bf10c8',
      },
    };

    // SILK
    const customToToken = {
      custom_token: {
        contract_addr: 'secret18k8a6lytr3gxppv96qus5qazg093gks7pk4q5x',
        token_code_hash:
          '5266a630e2b8ef910fb2515e1d3b5be95d4bd48358732788d8fcd984ee966bc1',
      },
    };

    const hops: AMMRouterHop[] = routerContract.assemble(
      routerPairs,
      customFromToken,
      customToToken,
    );

    expect(hops).toHaveLength(2);
    expect(hops[0].pair_address).toEqual(
      'secret1g3xnvw0cw5a9qdvwu73k8kuu5nue3qqdawxzy4',
    );
    expect(hops[1].pair_address).toEqual(
      'secret1tgqnx0yqtdjx4k2cspggm5ur8yz9vgm0h4tlwj',
    );
  });

  test('should assemble correct route with 2 hops in reverse', () => {
    const routerPairs: AMMRouterPair[] = pairs.map(
      (x: any) =>
        new AMMRouterPair(
          x.from_token,
          x.into_token,
          x.pair_address,
          x.pair_code_hash,
        ),
    );

    const routerContract = new AMMRouter();

    // SILK
    const customFromToken = {
      custom_token: {
        contract_addr: 'secret18k8a6lytr3gxppv96qus5qazg093gks7pk4q5x',
        token_code_hash:
          '5266a630e2b8ef910fb2515e1d3b5be95d4bd48358732788d8fcd984ee966bc1',
      },
    };

    // Sienna
    const customToToken = {
      custom_token: {
        contract_addr: 'secret12vy64457jysxf3x4hwr64425ztlauq98zchpgt',
        token_code_hash:
          '46e5bca7904e5247952a831cfe426586f614767ec1485bfb2d78c40ae5bf10c8',
      },
    };

    const hops: AMMRouterHop[] = routerContract.assemble(
      routerPairs,
      customFromToken,
      customToToken,
    );

    expect(hops).toHaveLength(2);
    expect(hops[0].pair_address).toEqual(
      'secret1ktv5j6qtadq3yeurpdvzymz9ffvs5aalymxl0y',
    );
    expect(hops[1].pair_address).toEqual(
      'secret1c8pxr9d7hgul6wdun3ktt64tjn53ass3y6sn9t',
    );
  });
});
