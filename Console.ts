import type { Address, Snip20, TokenInfo } from './Core'
import { ClientConsole, bold, colors } from './Core'
import * as AMM from './AMM'

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
