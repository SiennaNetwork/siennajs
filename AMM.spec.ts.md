# Sienna AMM

## Preparation

Test instance of Fadroma:

```typescript
import { Fadroma } from '@hackbg/fadroma'
const context = await new Fadroma({ chain: 'Mocknet_CW0' }).ready
```

## Deploying the AMM

Deploying the AMM involves instatiating the factory and the router.
* The factory contract must be provided with templates (code id + code hash)
  for the exchange and LP token contracts.
  * The legacy (v1) factory also requires templates for three other contracts;
    those are not used.
* The factory then takes care of instantiating an AMMExchange and LPToken for each
  supported pair of swappable tokens.

```typescript
import { AMM } from 'siennajs'

const amm = new AMM.Deployment(context, {
  version:   'v2',
  swapFee:   [ 28, 10000 ],
  siennaFee: [ 2, 10000 ],
  burner:    null
})

await amm.deploy()
```

## Configuring the router

The supported tokens must be registered with the router manually.

The routes are computed on the client side; the router contract only
takes care of executing the multi-hop swap route that is passed to it,
using SNIP20 callbacks.

## Upgrading the AMM

Upgrading the AMM involves deploying a new factory and creating a new
exchange + lp token for every supported swap pair that was in the old factory.
