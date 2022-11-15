# Sienna Vestings

```typescript
import { Fadroma } from '@hackbg/fadroma'
const context = { chain: 'Mocknet_CW0' }
```

## Token Generation Event

The SIENNA Token Generation Event creates the SIENNA SNIP20 token
and the MGMT and RPT contracts.

```typescript
import { TGE } from './Vesting'

const tge = await Fadroma(context).setup(TGE, { version: 'v1' })

await tge.deploy()
```

If the number of accounts in the RPT is greater than a certain fixed limit,
the list of RPT-funded accounts is split into subRPTs.

## Partner-Funded Rewards

The PFR vestings use the updated MGMT and RPT, and vest a certain pre-existing token.
When testing them in isolation, they use the Fadroma Token Manager to provide a mock token.

```typescript
import { PFR } from './Vesting'

const pfr = await Fadroma(context).setup(PFR, { version: 'v1' })

await pfr.deploy()
```
