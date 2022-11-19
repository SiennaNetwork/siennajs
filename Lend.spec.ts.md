# Sienna Lend

## Preparation

Test instance of Fadroma:

```typescript
import assert from 'node:assert'
import { Fadroma } from '@hackbg/fadroma'
const context = await new Fadroma({ chain: 'Mocknet_CW0' }).ready
```

## Deploying the lending system

```typescript
import { Lend } from 'siennajs'

const lend = new Lend.Deployment(context)

await lend.deploy()
```
