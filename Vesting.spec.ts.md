# Sienna Vestings

```typescript
import { Fadroma } from '@hackbg/fadroma'
const context = await new Fadroma({ chain: 'Mocknet_CW0' }).ready
```

## Token Generation Event

The SIENNA Token Generation Event creates the SIENNA SNIP20 token
and the MGMT and RPT contracts.

```typescript
import { TGE } from './Vesting'

const tge = new TGE(context, {
  version:  'v1',
  symbol:   'SIENNA',
  schedule: TGE.emptySchedule(context.agent.address),
})

await tge.deploy()
```

If the number of accounts in the RPT is greater than a certain fixed limit,
the list of RPT-funded accounts is split into subRPTs.

## Partner-Funded Rewards

The PFR vestings use the updated MGMT and RPT, and vest a certain pre-existing token.
In test mode, they use the Fadroma Token Manager to provide a mock token.

```typescript
import { PFR } from './Vesting'

const pfr = new PFR(context, { version: 'v1' })

await pfr.deploy()
```