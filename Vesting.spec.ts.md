# Sienna Vestings

## Token Generation Event

The SIENNA Token Generation Event creates the SIENNA SNIP20 token
and the MGMT and RPT contracts.

```typescript
import { TGE } from './Vesting'
new TGE()

```

If the number of accounts in the RPT is greater than a certain fixed limit,
the list of RPT-funded accounts is split into subRPTs.

## Partner-Funded Rewards

The PFR vestings use the updated MGMT and RPT and vest a certain pre-existing token.
