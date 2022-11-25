# Sienna Rewards

## Preparation

Test instance of Fadroma:

```typescript
import assert from 'node:assert'
import { Fadroma } from '@hackbg/fadroma'
const context = await new Fadroma({ chain: 'Mocknet_CW0' }).ready
```

## Deploying the rewards

```typescript
import { Rewards } from 'siennajs'

const rewards = new Rewards.Deployment(context, {
  version: 'v4.2'
})

await rewards.deploy()
```
