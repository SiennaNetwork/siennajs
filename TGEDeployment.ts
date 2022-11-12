/** Connect to an existing TGE. */
export default class SiennaTGE extends Deployment {

  log = log as any

  names = { token: 'SIENNA', mgmt: 'SIENNA.MGMT', rpt: 'SIENNA.RPT' }

  /** The deployed SIENNA SNIP20 token contract. */
  token = this.contract({ name: this.names.token, client: Snip20 }).get()

  /** Get the balance of an address in the vested token. */
  async getBalance (addr: Address, vk: ViewingKey) {
    this.log.info(`Querying balance of ${addr}...`)
    return await (await this.token).getBalance(addr, vk)
  }

  /** Set the VK of the calling address in the vested token. */
  async setVK (vk: ViewingKey) {
    this.log.info('Setting VK...')
    return await (await this.token).vk.set(vk)
  }

  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt = this.contract({ name: this.names.mgmt, client: MGMT_TGE }).get()

  /** Fetch the current schedule of MGMT. */
  getSchedule () {
    return this.mgmt.then(mgmt=>mgmt.schedule())
  }
  setSchedule () {
    throw new Error('TODO')
  }
  addToSchedule () {
    throw new Error('TODO')
  }
  /** Fetch the current schedule of MGMT. */
  getMgmtStatus () {
    return this.mgmt.then(mgmt=>mgmt.status())
  }
  /** Fetch the current progress of the vesting. */
  getMgmtProgress (addr: Address) {
    return this.mgmt.then(mgmt=>mgmt.progress(addr))
  }

  /** Show the current progress of the vesting. */
  /** The deployed RPT contract, which claims tokens from MGMT
    * and distributes them to the reward pools.  */
  rpt = this.contract({ name: this.names.rpt, client: RPT_TGE }).get()

  /** Update the RPT configuration. */
  setRptConfig (config: RPTConfig) {
    console.warn('SiennaTGE#setRptConfig: TODO')
  }

  /** Fetch the current status of RPT. */
  getRptStatus () {
    return this.rpt.then(rpt=>rpt.status())
  }

  showStatus = this.command('status', 'show the status of this TGE', async (
    address = this.agent?.address!
  ) => {
    await this.showMgmtStatus()
      .catch(({message})=>log.error("Can't show MGMT status:  ", message))
    await this.showMgmtProgress(address)
      .catch(({message})=>log.error("Can't show MGMT progress:", message))
    await this.showRptStatus()
      .catch(({message})=>log.error("Can't show RPT status:   ", message))
  })

  /** Print the result of getBalance. */
  async showBalance (addr: Address, vk: ViewingKey) {
    log.balance(addr, await this.getBalance(addr, vk))
  }
  /** Show the current status of the MGMT */
  async showMgmtStatus () {
    const {address} = await this.mgmt
    const status = await this.getMgmtStatus()
    log.mgmtStatus(status)
    return status
  }
  async showMgmtProgress (user: Address) {
    const {address} = await this.mgmt
    const progress = await this.getMgmtProgress(user)
    log.mgmtProgress(user, address, progress)
    return progress
  }
  /** Show the current status of the RPT. */
  async showRptStatus () {
    const status = await (await this.rpt).status() as { config: any[] }
    log.rptStatus(this.rpt, status)
    log.rptRecipients((await Promise.all(status.config.map(
      async ([address])=>({
        address,
        label:    await this.agent?.getLabel(address),
        codeHash: await this.agent?.getHash(address)
      })
    ))))
    return status
  }

  /** Make MGMT admin of token, load final config into MGMT, and irreversibly launch MGMT. */
  async launch (schedule: VestingSchedule) {
    const [token, mgmt, rpt] = await Promise.all([this.token, this.mgmt, this.rpt])
    await this.agent!.bundle().wrap(async bundle => {
      // Make MGMT admin and sole minter of token;
      await mgmt.as(bundle).acquire(token)
      // Set final vesting config in MGMT;
      await mgmt.as(bundle).configure(schedule)
      // Irreversibly launch MGMT.
      await mgmt.as(bundle).launch()
    })
  }
}
