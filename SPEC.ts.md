# Sienna specification

This document is the entry point of the Sienna specification.

It merges architectural documentation with a high-level test suite
using literate programming, as provided by the `@hackbg/ensuite` and
`@hackbg/ganesha` libraries.

## Running the tests

You can run the whole test suite with the command `pnpm test all`:

```typescript
import { CommandContext } from '@hackbg/komandi'
const context = new CommandContext()
context.command('all', 'run all test suites in parallel', async()=>{
  await Promise.allSettled([
    import('./Vesting.spec.ts.md')
    import('./AMM.spec.ts.md')
    import('./Rewards.spec.ts.md')
    import('./Lend.spec.ts.md')
    import('./Launchpad.spec.ts.md')
  ])
})
```

Alternatively, you can run the tests for a particular subsystem
using one of the commands defined below.

Also, to measure code coverage, use `pnpm cov` (for console reporting)
or `pnpm lcov` (for HTML reporting).

## [Vestings](./Vesting.spec.ts.md)

A **vesting** involves distributing a predefined amount of a token
to specified addresses over time. It involves a Snip20 token contract,
a MGMT (main vesting contract with immutable configuration), and
one or more RPTs (configurable distributor contracts).

```typescript
context.command('vesting', 'test the vesting subsystem', ()=>import('./Vesting.spec.ts.md'))
```

## [Sienna Swap (AMM)](./AMM.spec.ts.md)

The **automatic market maker** enables anyone to create swap contracts
that hold user-provided liquidity in a pair of tokens, and perform exchanges.

```typescript
context.command('amm', 'test the exchange subsystem', ()=>import('./AMM.spec.ts.md'))
```

## [Sienna Rewards](./Rewards.spec.ts.md)

```typescript
context.command('rewards', 'test the staking subsystem', ()=>import('./Rewards.spec.ts.md'))
```

## [Sienna Lend](./Lend.spec.ts.md)

```typescript
context.command('lend', 'test the lending subsystem', ()=>import('./Lend.spec.ts.md'))
```

## [Sienna Launchpad](./Launchpad.spec.ts.md)

```typescript
context.command('launchpad', 'test the launchpad subsystem', ()=>import('./Launchpad.spec.ts.md'))
```

## Entrypoint

```typescript
context.run(process.argv.slice(3))
```
