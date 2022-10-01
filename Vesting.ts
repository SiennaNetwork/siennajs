import { Deployment, Client, ClientConsole, YAML, bold } from './Core'
import type { Address, ViewingKey, Snip20, Uint128, Duration, Name } from './Core'

/** A vesting consists of a MGMT and one or more RPTs. */
export abstract class Vesting extends Deployment {
  log = log
  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  abstract mgmt: Promise<MGMT>
  /** The deployed RPT contract, which claims tokens from MGMT
    * and distributes them to the reward pools.  */
  abstract rpts: Promise<RPT[]>
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
  /** Fetch the current status of RPT. */
  async getRptStatus () {
    const [rpt0, ...rpts] = await this.rpts
    return this.rpt.then(rpt=>rpt.status())
  }
  /** Update the RPT configuration. */
  setRptConfig (config: RPTConfig) {
    console.warn('SiennaTGE#setRptConfig: TODO')
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
    YAML.dump(status).trim().split('\n').forEach(line=>this.info(' ', line))
  }
  rptRecipients (instances: any) {
    this.info(`RPT contract recipients:`)
    const max = instances.reduce((x: any,y: any)=>Math.max(x, y.label?.length??0), 0)
    instances.forEach(({ label, address, codeHash }: any)=>{
      this.info(` `, (label??'').padEnd(max), JSON.stringify({ address, codeHash }))
    })
  }
}

/** A MGMT vesting contract of either version. */
export abstract class MGMT extends Client {
  static MINTING_POOL  = "MintingPool"
  static LPF           = "LPF"
  static RPT           = "RPT"
  static emptySchedule = (address: Address) => ({
    total: "0",
    pools: [ { 
      name: MGMT.MINTING_POOL, total: "0", partial: false, accounts: [
        { name: MGMT.LPF, amount: "0", address,
          start_at: 0, interval: 0, duration: 0,
          cliff: "0", portion_size: "0", remainder: "0" },
        { name: MGMT.RPT, amount: "0", address,
          start_at: 0, interval: 0, duration: 0,
          cliff: "0", portion_size: "0", remainder: "0" }
      ]
    } ]
  })
  /** See the full schedule */
  schedule  () {
    return this.query({ schedule: {} })
  }
  /** Load a schedule */
  configure (schedule: any) {
    return this.execute({ configure: { schedule } })
  }
  /** Add a new account to a pool */
  add       (pool_name: any, account: any) {
    return this.execute({ add_account: { pool_name, account } })
  }
  /** Launch the vesting */
  launch    () {
    return this.execute({ launch: {} })
  }
  /** Claim accumulated portions */
  claim     () {
    return this.execute({ claim: {} })
  }
  /** take over a SNIP20 token */
  async acquire (token: Snip20) {
    const tx1 = await token.setMinters([this.address!])
    const tx2 = await token.changeAdmin(this.address!)
    return [tx1, tx2]
  }
  /** Check how much is claimable by someone at a certain time */
  async progress (address: Address, time = +new Date()): Promise<VestingProgress> {
    time = Math.floor(time / 1000) // JS msec -> CosmWasm seconds
    const { progress }: { progress: VestingProgress } =
      await this.query({ progress: { address, time } }) 
    return progress
  }
  abstract status (): Promise<unknown>
}

/** A MGMT schedule. */
export interface VestingSchedule {
  total: Uint128
  pools: Array<VestingPool>
}

export interface VestingPool {
  name:     string
  total:    Uint128
  partial:  boolean
  accounts: Array<VestingAccount>
}

export interface VestingAccount {
  name:         string
  amount:       Uint128
  address:      Address
  start_at:     Duration
  interval:     Duration
  duration:     Duration
  cliff:        Uint128
  portion_size: Uint128
  remainder:    Uint128
}

export interface VestingProgress {
  time:     number
  launcher: number
  elapsed:  number
  unlocked: string
  claimed:  string
}

/** A RPT (redistribution) contract of each version. */
export abstract class RPT extends Client {
  /** Claim from mgmt and distribute to recipients. Anyone can call this method as:
    * - the recipients can only be changed by the admin
    * - the amount is determined by MGMT */
  vest() {
    return this.execute({ vest: {} })
  }
  abstract status (): Promise<unknown>
}

export type RPTRecipient = string

export type RPTAmount    = string

export type RPTConfig    = [RPTRecipient, RPTAmount][]

export type RPTStatus    = unknown
