import { ClientConsole } from './Core'

export class GovernanceConsole extends ClientConsole {
  name = 'Sienna Governance'
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
    this.info(' ', JSON.stringify(config))
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
}
