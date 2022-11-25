import { ClientConsole, bold } from './Core'
import type { Address } from './Core'
import type { VestingDeployment } from './VestingDeploy'

export class SiennaVestingConsole extends ClientConsole {

  name = 'Sienna Vesting'

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
    this.info(` `, JSON.stringify(status))
  }

  rptRecipients (instances: any) {
    this.info(`RPT contract recipients:`)
    const max = instances.reduce((x: any,y: any)=>Math.max(x, y.label?.length??0), 0)
    instances.forEach(({ label, address, codeHash }: any)=>{
      this.info(` `, (label??'').padEnd(max), JSON.stringify({ address, codeHash }))
    })
  }

}

export class VestingReporter {
  constructor (
    private readonly vesting: VestingDeployment<any>,
    private readonly log: SiennaVestingConsole = vesting.log
  ) {}

  async showStatus (
    address = this.vesting.agent?.address!
  ) {
    await this.showMgmtStatus()
      .catch(({message})=>this.log.error("Can't show MGMT status:  ", message))
    await this.showMgmtProgress(address)
      .catch(({message})=>this.log.error("Can't show MGMT progress:", message))
    await this.showRptStatus()
      .catch(({message})=>this.log.error("Can't show RPT status:   ", message))
  }

  /** Show the current status of the MGMT */
  async showMgmtStatus () {
    const {address} = await this.vesting.mgmt
    const status    = await this.vesting.getMgmtStatus()
    this.log.mgmtStatus(status)
    return status
  }

  async showMgmtProgress (user: Address) {
    const {address} = await this.vesting.mgmt
    const progress  = await this.vesting.getMgmtProgress(user)
    this.log.mgmtProgress(user, address, progress)
    return progress
  }

  /** Show the current status of the RPT. */
  async showRptStatus () {
    if (!this.vesting.rpt.address) {
      this.log.info('RPT contract not found.')
      return null
    }
    const rpt    = await this.vesting.rpt()
    const status = await rpt.status() as { config: any[] }
    this.log.rptStatus(rpt, status)
    this.log.rptRecipients((await Promise.all(status.config.map(
      async ([address])=>({
        address,
        label:    await this.vesting.agent?.getLabel(address),
        codeHash: await this.vesting.agent?.getHash(address)
      })
    ))))
    return status
  }
}
