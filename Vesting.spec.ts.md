# Sienna Vestings

```typescript
import { TokenManager } from '@fadroma/tokens'
import { Deployment } from './Core'
const context = new Deployment()
context.agent = {}
context.tokens = new TokenManager(context)
```

## Token Generation Event

The SIENNA Token Generation Event creates the SIENNA SNIP20 token
and the MGMT and RPT contracts.

```typescript
import { TGE } from './Vesting'
new TGE(context, 'v1')
```

If the number of accounts in the RPT is greater than a certain fixed limit,
the list of RPT-funded accounts is split into subRPTs.

## Partner-Funded Rewards

The PFR vestings use the updated MGMT and RPT and vest a certain pre-existing token.

```typescript
import { PFR } from './Vesting'
new PFR(context, 'v1')
```
