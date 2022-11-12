const log = new class SiennaVestingConsole extends ClientConsole {

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
