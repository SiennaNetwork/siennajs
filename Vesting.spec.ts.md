# Sienna Vestings

## Preparation

Test instance of Fadroma:

```typescript
import { Fadroma } from '@hackbg/fadroma'
const context = await new Fadroma({ chain: 'Mocknet_CW0' }).ready
```

Minimal vesting schedule:

```typescript
import { emptySchedule } from './VestingConfig'
const schedule = emptySchedule()
schedule.total = "2"
schedule.pools[0].total = "2"
schedule.pools[0].accounts[0].amount  = schedule.pools[0].accounts[1].amount  = "1"
schedule.pools[0].accounts[0].address = schedule.pools[0].accounts[1].address = context.agent.address
```

## Token Generation Event

The SIENNA Token Generation Event creates the SIENNA SNIP20 token
and the MGMT and RPT contracts.

```typescript
import { TGE } from './Vesting'

const tge = new TGE(context, {
  version: 'v1',
  symbol: 'SIENNA',
  schedule
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

const pfr = new PFR(context, {
  version: 'v1',
  vestings: {
    ALTER: {
      staked: 'LP-SIENNA-ALTER',
      reward: 'ALTER',
      schedule
    },
    SHADE: {
      staked: 'LP-SIENNA-SHD',
      reward: 'SHADE',
      schedule
    }
  }
})

await pfr.deploy()
```
