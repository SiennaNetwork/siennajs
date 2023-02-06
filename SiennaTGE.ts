import {
  Address,
  Client,
  ClientConsole,
  CodeHash,
  Contract,
  Deployment,
  Duration,
  IntoLink,
  Snip20,
  Uint128,
  ViewingKey,
  bold,
  validatedAddressOf,
  validatedCodeHashOf
} from './Core'

import {
  MGMT,
  RPT,
  RPTAmount,
  RPTConfig,
  RPTStatus,
  VestingSchedule,
} from './Vesting'

/** Connect to an existing TGE. */
export default class SiennaTGE extends Deployment {

  log = log as any

  names = { token: 'SIENNA', mgmt: 'SIENNA.MGMT', rpt: 'SIENNA.RPT' }

  /** The deployed SIENNA SNIP20 token contract. */
  token = this.contract({ name: this.names.token, client: Snip20 })

  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt = this.contract({ name: this.names.mgmt, client: MGMT_TGE })

  /** Show the current progress of the vesting. */
  /** The deployed RPT contract, which claims tokens from MGMT
    * and distributes them to the reward pools.  */
  rpt = this.contract({ name: this.names.rpt, client: RPT_TGE })

  /** Get the balance of an address in the vested token. */
  async getBalance (addr: Address, vk: ViewingKey) {
    this.log.info(`Querying balance of ${addr}...`)
    return await (await this.token()).getBalance(addr, vk)
  }

  /** Set the VK of the calling address in the vested token. */
  async setVK (vk: ViewingKey) {
    this.log.info('Setting VK...')
    return await (await this.token()).vk.set(vk)
  }

  /** Fetch the current schedule of MGMT. */
  getSchedule () {
    return this.mgmt().then((mgmt: MGMT)=>mgmt.schedule())
  }

  setSchedule () {
    throw new Error('TODO')
  }

  addToSchedule () {
    throw new Error('TODO')
  }

  /** Fetch the current schedule of MGMT. */
  getMgmtStatus () {
    return this.mgmt().then((mgmt: MGMT_TGE)=>mgmt.status())
  }

  /** Fetch the current progress of the vesting. */
  getMgmtProgress (addr: Address) {
    return this.mgmt().then((mgmt: MGMT_TGE)=>mgmt.progress(addr))
  }

  /** Update the RPT configuration. */
  setRptConfig (config: RPTConfig) {
    console.warn('SiennaTGE#setRptConfig: TODO')
  }

  /** Fetch the current status of RPT. */
  getRptStatus () {
    return this.rpt().then((rpt: RPT_TGE)=>rpt.status())
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
    const status = await (await this.rpt()).status() as { config: any[] }
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
    const [token, mgmt, rpt] = await Promise.all([this.token(), this.mgmt(), this.rpt()])
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

/** Contract address/hash pair as used by MGMT */
export type LinkTuple = [Address, CodeHash]

/** Convert Fadroma.Instance to address/hash pair as used by MGMT */
export const linkTuple = (instance: IntoLink) => (
  [ validatedAddressOf(instance), validatedCodeHashOf(instance) ]
)

/** The SIENNA SNIP20 token. */
export class SiennaSnip20 extends Snip20 {}

export class MGMT_TGE extends MGMT {

  /** Generate an init message for Original MGMT */
  static init = (
    admin:    Address,
    token:    IntoLink,
    schedule: VestingSchedule
  ) => ({
    admin,
    token: linkTuple(token),
    schedule
  })

  /** Query contract status */
  status(): Promise<{ status: { launched: boolean } }> {
    return this.query({ status: {} })
  }

  /** claim accumulated portions */
  claim() {
    return this.execute({ claim: {} })
  }

  /** set the admin */
  setOwner(new_admin: any) {
    return this.execute({ set_owner: { new_admin } })
  }

}

export class RPT_TGE extends RPT {

  /** Generate an init message for original RPT */
  static init = (
    admin:   Address,
    portion: RPTAmount,
    config:  RPTConfig,
    token:   IntoLink,
    mgmt:    IntoLink
  ) => ({
    admin,
    portion,
    config,
    token: linkTuple(token),
    mgmt:  linkTuple(mgmt),
  })

  /** query contract status */
  async status () {
    const { status }: { status: RPTStatus } = await this.query({ status: {} })
    return status
  }

  /** set the vesting recipients */
  configure(config = []) {
    return this.execute({ configure: { config } })
  }

  /** change the admin */
  setOwner (new_admin: Address) {
    return this.execute({ set_owner: { new_admin } })
  }

}
