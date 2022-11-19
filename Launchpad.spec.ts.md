# Sienna Launchpad

## Preparation

Test instance of Fadroma:

```typescript
import assert from 'node:assert'
import { Fadroma } from '@hackbg/fadroma'
const context = await new Fadroma({ chain: 'Mocknet_CW0' }).ready
```

## Deploying the launchpad

```typescript
import { Launchpad } from 'siennajs'

const launchpad = new Launchpad.Deployment(context)

await launchpad.deploy()
```
