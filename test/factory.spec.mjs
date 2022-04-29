import debug from "debug";
import { assert } from "chai";
import { randomBytes } from "crypto";
import { Scrt, ScrtGas } from "@fadroma/scrt";

import { Exchange } from "../Exchange";
import { SwapRouter } from "../Router";
import { Factory } from "../Factory";
import { SNIP20, LPToken } from "../SNIP20";

import * as siennajs from "../siennajs/index";

const Assembler = siennajs.default.hop.Assembler;
const RouterContract = siennajs.default.router.RouterContract;
const TokenTypeAmount = siennajs.default.core.TokenTypeAmount;

const log = function () {
  debug("out")(JSON.stringify(arguments, null, 2));
};

describe("Factory", () => {
  const fees = {
    upload: new ScrtGas(10000000),
    init: new ScrtGas(100000000),
    exec: new ScrtGas(10000000),
    send: new ScrtGas(10000000),
  };

  const context = {};

  before(async function setupAll() {
    this.timeout(0);
    const T0 = +new Date();

    // connect to a localnet with a large number of predefined agents
    const agentNames = ["ALICE", "BOB", "CHARLIE", "MALLORY"];
    context.chain = await Scrt.localnet_1_0().init();
    context.node = context.chain.node;
    context.agent = await context.chain.getAgent(
      context.node.genesisAccount("ADMIN")
    );

    const agents = (context.agents = await Promise.all(
      agentNames.map((name) =>
        context.chain.getAgent(context.node.genesisAccount(name))
      )
    ));
    console.log({ agents });
    context.agent.API.fees = fees;

    const T1 = +new Date();
    console.debug(`connecting took ${T1 - T0}msec`);

    context.templates = {
      SNIP20: new SNIP20(),
      LPToken: new LPToken(),
      SwapRouter: new SwapRouter(),
      Factory: new Factory(),
      Exchange: new Exchange(),
    };

    // build the contracts
    await Promise.all(
      Object.values(context.templates).map((contract) => contract.build())
    );

    const T2 = +new Date();
    console.debug(`building took ${T2 - T1}msec`);

    // upload the contracts
    for (const contract of Object.values(context.templates)) {
      await contract.upload(context.agent);
      await context.agent.nextBlock;
    }

    const T3 = +new Date();
    console.debug(`uploading took ${T3 - T2}msec`);
    console.debug(`total preparation time: ${T3 - T0}msec`);

    await initTokens(context);
    await initFactory(context);

    context.router = new SwapRouter({
      codeId: context.templates.SwapRouter.codeId,
      label: `router-${parseInt(Math.random() * 100000)}`,
      initMsg: {
        register_tokens: []
      },
    });
    await context.router.instantiate(context.agent);
        
    context.siennaRouter = new RouterContract(context.router.address, context.agent.API);
  });

  it("Has instantiated everything successfully", async function () {
    this.timeout(0);
  });

  after(async function cleanupAll() {
    this.timeout(0);
    await context.node.terminate();
  });
});

async function initTokens(context) {
  context.tokenA = new SNIP20({
    codeId: context.templates.SNIP20.codeId,
    codeHash: context.templates.SNIP20.codeHash,
    label: `token-${parseInt(Math.random() * 100000)}`,
    initMsg: {
      prng_seed: randomBytes(36).toString("hex"),
      name: "TokenA",
      symbol: "TKNA",
      decimals: 18,
      config: {
        public_total_supply: true,
        enable_deposit: true,
        enable_redeem: true,
        enable_mint: true,
        enable_burn: true,
      },
    },
  });
  await context.tokenA.instantiate(context.agent);
  context.viewkeyA = (await context.tokenA.createViewingKey(context.agent)).key;

  context.tokenB = new SNIP20({
    codeId: context.templates.SNIP20.codeId,
    codeHash: context.templates.SNIP20.codeHash,
    label: `token-${parseInt(Math.random() * 100000)}`,
    initMsg: {
      prng_seed: randomBytes(36).toString("hex"),
      name: "TokenB",
      symbol: "TKNB",
      decimals: 18,
      config: {
        public_total_supply: true,
        enable_deposit: true,
        enable_redeem: true,
        enable_mint: true,
        enable_burn: true,
      },
    },
  });
  await context.tokenB.instantiate(context.agent);
  context.viewkeyB = (await context.tokenB.createViewingKey(context.agent)).key;
}

async function initFactory(context) {
  const tokenIntoTokenType = function (token) {
    return { custom_token: { contract_addr: token.address, token_code_hash: token.codeHash } };
  }

  const intoPairInfo = function (response) {
    let A = { Scrt: {} };
    if (response.token_0.custom_token) {
      A = { custom_token: { contract_addr: response.token_0.custom_token.contract_addr, token_code_hash: response.token_0.custom_token.token_code_hash } };
    }
    let B = { Scrt: {} };
    if (response.token_1.custom_token) {
      B = { custom_token: { contract_addr: response.token_1.custom_token.contract_addr, token_code_hash: response.token_1.custom_token.token_code_hash } };
    }

    return {
      A,
      B,
      pair_address: response.exchange.address,
      pair_code_hash: context.templates.Exchange.codeHash,
    };
  }

  context.factory = new Factory({
    codeId: context.templates.Factory.codeId,
    label: `factory-${parseInt(Math.random() * 100000)}`,
    EXCHANGE: context.templates.Exchange,
    AMMTOKEN: context.templates.SNIP20,
    LPTOKEN: context.templates.LPToken,
    ROUTER: context.templates.SwapRouter,
    IDO: context.templates.SNIP20, // Dummy
    LAUNCHPAD: context.templates.SNIP20, // Dummy
  });
  await context.factory.instantiate(context.agent);

  context.AB = intoPairInfo(await context.factory.createExchange(
    tokenIntoTokenType(context.tokenA),
    tokenIntoTokenType(context.tokenB),
  ));
  await context.tokenA.mint(100, undefined, context.AB.pair_address);
  await context.tokenB.mint(100, undefined, context.AB.pair_address);
}