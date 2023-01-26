# SiennaJS Spec

```typescript
import Sienna from '.'
import { Scrt } from '@fadroma/scrt'
import TESTNET from './deployments/pulsar-2.json'
const app = new Sienna({
  state: TESTNET,
  agent: await Scrt.Testnet().getAgent({
    mnemonic: 'genius supply lecture echo follow that silly meadow used gym nerve together'
  })
})
```

## The TGE (Sienna Token Generation Event)

The TGE consists of the SIENNA token, the MGMT (vesting) contract and the RPT (funding) contract.

### MGMT operations

```typescript
await app.tge.getSchedule()
await app.tge.getMgmtStatus()
// TODO test claiming
```

### RPT operations

```typescript
await app.tge.getRptStatus()
// TODO test vesting
```

## The AMM (Sienna Swap Automatic Market-Maker)

The AMM consists of the factory and multiple exchanges (liquidity pools), each of which has a
LP token attached.

### Factory operations

```typescript
await app.amm.v2.showStatus()
// TODO test creating an exchange
// TODO test finding an exchange
```

### Exchange/LP token operations

```typescript
// TODO test querying liquidity
// TODO test providing liquidity
```
