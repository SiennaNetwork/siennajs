# Sienna specification

## [Vestings](./Vesting.spec.ts.md)

A **vesting** involves distributing a predefined amount of a token
to specified addresses over time. It involves a Snip20 token contract,
a MGMT (main vesting contract with immutable configuration), and
one or more RPTs (configurable distributor contracts).

```typescript
import './Vesting.spec.ts.md'
```

## [Sienna Swap (AMM)](./AMM.spec.ts.md)

The **automatic market maker** enables anyone to create swap contracts
that hold user-provided liquidity in a pair of tokens, and perform exchanges.

```typescript
import './AMM.spec.ts.md'
```

## [Sienna Rewards](./Rewards.spec.ts.md)

```typescript
import './Rewards.spec.ts.md'
```

## [Sienna Lend](./Lend.spec.ts.md)

```typescript
import './Lend.spec.ts.md'
```

## [Sienna Launchpad](./Launchpad.spec.ts.md)

```typescript
import './Launchpad.spec.ts.md'
```
