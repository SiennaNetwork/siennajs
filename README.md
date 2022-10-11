# SiennaJS [![](https://img.shields.io/github/package-json/v/SiennaNetwork/siennajs?label=siennajs&style=flat-square)](./CONTRIBUTING.md)

Official API client for [Sienna Network](https://sienna.network/).

## Install

See the [SiennaJS releases page](https://github.com/SiennaNetwork/siennajs/releases).

## Usage

> TODO

### Updating the SecretJS dependency

> TODO

---

# SiennaJS v0.2 docs

## Legacy setup: install from NPM

**Latest version:** [![](https://img.shields.io/npm/v/siennajs?label=siennajs&style=flat-square)](https://www.npmjs.com/package/siennajs)

```shell
npm i --save siennajs
```

## Usage
All smart contract interfaces are created with the following parameters.

 - The address of the contract.
 - An instance of `SigningCosmWasmClient` from `secretjs` (Optional).
 - An instance of `CosmWasmClient` from `secretjs` (Optional).

 At least one type of client is required. Depending on the type of client provided you will get access to different functionalities:

  - `SigningCosmWasmClient` - both executing transactions and queries
  - `CosmWasmClient` - queries only

If both instances are passed it will use `SigningCosmWasmClient` for executing and `CosmWasmClient` for queries.

## Example - Query SIENNA token info:

```typescript
const query_client = new CosmWasmClient('API_URL_HERE')
const sienna_token = new Snip20Contract(
    'secret1rgm2m5t530tdzyd99775n6vzumxa5luxcllml4',
    undefined, // We don't pass a SigningCosmWasmClient as we don't need it for queries
    query_client
)

const token_info = await sienna_token.query().get_token_info()
```

## Querying with permits
SiennaJS exposes the `Signer` interface which must implement an offline signing method. See the [SNIP-24 spec](https://github.com/SecretFoundation/SNIPs/blob/master/SNIP-24.md#data-structures) for more info.

An implementation for the [Keplr](https://www.keplr.app) wallet is provided by the library - `KeplrSigner`
