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
    expect(hops[0].from_token).toEqual(customFromToken);

    // [
    //   {
    //     from_token: {
    //       custom_token: {
    //         contract_addr: 'secret12vy64457jysxf3x4hwr64425ztlauq98zchpgt',
    //         token_code_hash:
    //           '46e5bca7904e5247952a831cfe426586f614767ec1485bfb2d78c40ae5bf10c8',
    //       },
    //     },
    //     pair_address: 'secret1g3xnvw0cw5a9qdvwu73k8kuu5nue3qqdawxzy4',
    //     pair_code_hash:
    //       'ea6bfaf124b2540765b81d12f3efcd6efe3aeaa4ab498a2331f2e40ad9ea0209',
    //   },
    //   {
    //     from_token: {
    //       custom_token: {
    //         contract_addr: 'secret18vd8fpwxzck93qlwghaj6arh4p7c5n8978vsyg',
    //         token_code_hash:
    //           '9587d60b8e6b078ace12014ceeee089530b9fabcd76535d93666a6c127ad8813',
    //       },
    //     },
    //     pair_address: 'secret1tgqnx0yqtdjx4k2cspggm5ur8yz9vgm0h4tlwj',
    //     pair_code_hash:
    //       '33eac42c44ee69acfe1f56ce7b14fe009a7b611e86f275d7af2d32dd0d33d5a9',
    //   },
    // ];
  });
});
