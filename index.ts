import { bold, colors } from '@hackbg/konzola'
import type { Address, Snip20, TokenInfo, TokenOptions } from './Core'
import { Deployment, TokenManager, ClientConsole } from './Core'
import * as Vesting     from './Vesting'
import * as TGE         from './TGE'
import * as PFR         from './PFR'
import * as Auth        from './Auth'
import * as AMM         from './AMM'
import * as Multicall   from './Multicall'
import * as Governance  from './Poll'
import * as Lending     from './Lending'
import * as Launchpad   from './Launchpad'
import * as Rewards     from './Rewards'
import { RewardPool_v2 }   from './Rewards_v2'
import { RewardPool_v3 }   from './Rewards_v3'
import { RewardPool_v3_1 } from './Rewards_v3'
import { RewardPool_v4_1 } from './Rewards_v4'
Rewards.RewardPool['v2']   = RewardPool_v2
Rewards.RewardPool['v3']   = RewardPool_v3
Rewards.RewardPool['v3.1'] = RewardPool_v3_1
Rewards.RewardPool['v4.1'] = RewardPool_v4_1

export class SiennaDeployment extends Deployment {

  constructor (public context: Deployment) {
    super(context)
  }

  tokens: TokenManager = new TokenManager(this as Deployment)

  /** Sienna Auth: Authentication provider. */
  auth = {
    'v1':   new Auth.Deployment(this, 'v1')
  }

  /** The SIENNA Token Generation Event. */
  tge: Record<TGE.Version, TGE.Deployment> = {
    'v1':   new TGE.Deployment(this, 'v1')
  }

  /** The Sienna Swap AMM. */
  amm: Record<AMM.Version, AMM.Deployment> = {
    'v1':   new AMM.Deployment(this, 'v1'),
    'v2':   new AMM.Deployment(this, 'v2')
  }

  /** The Sienna Rewards staking system. */
  rewards = {
    'v2':   new Rewards.Deployment(this, 'v2'),
    'v3':   new Rewards.Deployment(this, 'v3'),
    'v3.1': new Rewards.Deployment(this, 'v3.1'),
    'v4.1': new Rewards.Deployment(this, 'v4.1'),
  }

  /** Partner-Funded Rewards: vesting of non-SIENNA tokens. */
  pfr = {
    'v1':   new PFR.Deployment(this, 'v1')
  }

  /** The Sienna Lend lending platform. */
  lend = {
    'v1':   new Lending.Deployment(this, 'v1')
  }

  /** Sienna Governance system. */
  governance = {
    'v1':   new Governance.Deployment(this, 'v1')
  }

  /** Sienna Launch: Launchpad/IDO system. */
  launchpad = {
    'v1':   new Launchpad.Deployment(this, 'v1')
  }

  async showStatus () {
    await this.tge['v1'].showStatus()
    await this.amm['v2'].showStatus()
    await this.rewards['v2'].showStatus()
    await this.rewards['v3'].showStatus()
    await this.rewards['v3.1'].showStatus()
    await this.rewards['v4.1'].showStatus()
    await this.pfr['v1'].showStatus()
    await this.lend['v1'].showStatus()
    await this.governance['v1'].showStatus()
    await this.launchpad['v1'].showStatus()
  }
}

export default SiennaDeployment

export * from './Core'

export {
  Auth,
  AMM,
  Multicall,
  Vesting,
  TGE,
  PFR,
  Rewards,
  Governance,
  Lending,
  Launchpad
}

export class SiennaConsole extends ClientConsole {
  balance (addr: any, balance: any) {
    this.info(`Balance of ${bold(addr)}: ${balance}`)
  }
  mgmtStatus (status: any) {
    this.debug(bold(`MGMT status`), status)
  }
  mgmtProgress (user: any, address: any, progress: any) {
    this.info(bold(`MGMT progress`), 'of', bold(user), 'in', bold(address!))
    for (const [k,v] of Object.entries(progress)) this.info(' ', bold(k), v)
  }
  rptStatus (rpt: any, status: any) {
    this.info(`RPT contract:`)
    this.info(` `, JSON.stringify(rpt.asLink))
    this.info(`RPT contract config:`)
    this.info(JSON.stringify(status))
  }
  rptRecipients (instances: any) {
    this.info(`RPT contract recipients:`)
    const max = instances.reduce((x: any,y: any)=>Math.max(x, y.label?.length??0), 0)
    instances.forEach(({ label, address, codeHash }: any)=>{
      this.info(` `, (label??'').padEnd(max), JSON.stringify({ address, codeHash }))
    })
  }
  creatingExchange (name: string) {}
  createdExchange (name: string) {}
  creatingExchanges (names: string[]) {}
  createdExchanges (names: number) {}
  factoryStatus (address: Address) {
    this.info(`Status of AMMv2 Factory at`, bold(address??''))
    this.info()
  }
  exchangeHeader (exchange: AMM.Exchange, column1: number) {
    this.info()
    this.info(bold(exchange.name?.padEnd(column1)||''), bold(exchange.address||''))
  }
  exchangeDetail (
    exchange:    AMM.Exchange,
    column1:     number,
    token0Info:  any,
    token1Info:  any,
    lpTokenInfo: any
  ) {
    const fmtDecimal = (s: any, d: any, n: any) => {
      return bold(String(BigInt(Math.floor(n/(10**d)))).padStart(18) + '.' +
        String(n%(10**d)).padEnd(18)) + ' ' +
        bold(s)
    }
    for (const [name, {address}, {symbol, decimals, total_supply}, balance] of [
      ["Token 0",  exchange.token_0, token0Info,  exchange.pairInfo?.amount_0],
      ["Token 1",  exchange.token_1, token1Info,  exchange.pairInfo?.amount_1],
      ["LP token", exchange.lpToken, lpTokenInfo, null],
    ] as [string, Snip20, TokenInfo, any][] ) {
      this.info()
      this.info(name?.padStart(column1), bold(address||''))
      if (balance) {
        this.info("".padStart(column1), `In pool:     `, fmtDecimal(symbol, decimals, balance))
      }
      if (total_supply) {
        this.info("".padStart(column1), `Total supply:`, fmtDecimal(symbol, decimals, total_supply))
      } else {
        this.info("".padStart(column1), `Total supply:`, bold('unlimited'.padStart(23)))
      }
    }
  }
  noExchanges () {
    this.info('Factory returned no exchanges.')
  }
  exchanges (exchanges: any[]) {
    if (!exchanges) {
      this.info('No exchanges found.')
      return
    }
    for (const exchange of exchanges) {
      const { name, address, codeHash, token_0, token_1, lpToken } = exchange as AMM.Exchange
      const codeId = '??'
      this.info(
        ' ', bold(colors.inverse(name!)).padEnd(30), // wat
        `(code id ${bold(String(codeId))})`.padEnd(34), bold(address!)
      )
      //await print.token(token_0)
      //await print.token(token_1)
      //await print.token(lpToken)
    }
  }
  rewardPools (name: string, state: Record<string, any>) {
    const isRewardPool     = (x: string) => x.startsWith('SiennaRewards_')
    const rewardPools = Object.keys(state).filter(isRewardPool)
    if (rewardPools.length > 0) {
      this.info(`\nRewards contracts in ${bold(name)}:`)
      for (const name of rewardPools) {
        this.info(`  ${colors.green('✓')}  ${name}`)
      }
    } else {
      this.info(`\nNo rewards contracts.`)
    }
    return rewardPools
  }
  pool (pool: any) {
    this.info('Governance-enabled staking pool:')
    this.info(' ', JSON.stringify(pool.asLink))
  }
  async stakedToken (stakedToken: any, label: any) {
    const link = JSON.stringify(stakedToken?.asLink)
    this.info('Staked token:')
    this.info(`  ${label} ${link}`)
  }
  epoch (epoch: any) {
    this.info('Epoch:')
    this.info(' ', epoch)
  }
  config (config: any) {
    this.info('Pool config:')
    this.info(JSON.stringify(config))
  }
  pollsContract (contract: any) {
    this.info('Governance contract:')
    this.info(' ', JSON.stringify(contract.asLink))
  }
  pollsAuthProvider (provider: any) {
    this.info('Auth provider:')
    this.info(' ', JSON.stringify(provider))
  }
  pollsConfig (config: any) {
    this.info('Poll config:')
    this.info(' ', config)
  }
  activePolls (polls: any) {
    this.info('Active polls:')
    this.info(' ', polls)
    this.info('')
  }
  authProvider (x: any) {
    this.info('Auth provider:')
    this.info(' ', JSON.stringify(x))
  }
  saleConstraints (x: any) {
    this.info('Sale constraints:')
    this.info(' ', x)
  }
  latestIdos (x: any) {
    this.info('Latest IDOs:')
    for (const ido of x.entries) {
      this.info(' -', JSON.stringify(ido))
    }
  }
}
