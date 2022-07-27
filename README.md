# SiennaJS v1 beta

Client library to interact with smart contracts on Sienna Network.

## Installation

### Standard setup: install from NPM

The general form of the installation instruction is **`$_NPM_INSTALL $_API $_AGENT`**, where:
* **`$_NPM_INSTALL`** is your usual install command (e.g. `npm install --save`, `pnpm add` or `yarn add`)
* **`$_API`** is this package (just `siennajs` if installing from GitHub)
* **`$_AGENT`** is the package that provides a compatible Fadroma Agent class, such as `@fadroma/client-scrt-grpc`

So, for example, I'd use:

```sh
pnpm add siennajs @fadroma/client-scrt-grpc
```

### Advanced setup: install from Git submodule

You can add SiennaJS as a submodule to your repo.
This enables you to edit SiennaJS in the context
of your project for rapid local development.

0. **Before you begin**, make sure you have a working TypeScript compile environment and can use TS in your project normally.

1. **Add submodule:** run ``git submodule add $URL siennajs``` in your repo
   * **`$URL`** is the Git origin URL of this repo **in the form `https://`**,
     e.g. `https://github.com/SiennaNetwork/sienna`
     * This is important. **Always use HTTPS URLs in `.gitmodules`** for public submodules.
     * Otherwise CI and containerized builds won't be able to load the submodules unless
       you take extra steps to set them up with deploy keys.
   * Make sure to **commit .gitmodules in Git**.
   * Repos with submodules are best cloned with **`git clone --recursive`**.
     * If you forget the `--recursive`, use **`git submodule update --init --recursive`** to get latest submodules.


2. **Add package:**
   * The most compatible way is to **add `"siennajs":"link:./siennajs"`
     to the `dependencies` or `devDependencies` section of your `package.json`**
   * After modifying your project's `package.json` to add SiennaJS, **re-run `$_NPM_INSTALL` to link `siennajs` into `node_modules`.**

3. **Now you are ready to develop with a local copy of SiennaJS**.
   * Edits in `./siennajs` and your changes to SiennaJS are automatically reflected in your project's `./node_modules/siennajs`.

4. **Having made a change to the submodule:**
   * `cd /myproject/siennajs` to **enter submodule directory**.
   * `git commit`... to **commit to submodule**.
   * `git push` to **push submodule**.
     * Since you have the `https://` URL in your project's `.gitmodules`, it'll ask you for **password**. Now is a good time to hit "cancel", stop committing over HTTPS, set up your SSH-based commit workflow, and run **`cd /myproject && git submodule set-url origin git@my.git.host/myproject.git`** to enable pushing over SSH. This you'll have to do once per clone of `myproject`
   * Go back to your project directory and **`git add`** the updated submodule to your project commit.

5. **To pull others' changes to the submodule:** `cd siennajs && git pull`.

## Usage

> TODO

---

# SiennaJS v0.2 docs

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
