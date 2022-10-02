import { VersionedSubsystem, Client, ClientConsole, YAML, bold } from './Core'
import type { Address, ViewingKey, Snip20, Uint128, Duration, Name } from './Core'
import { SiennaConsole } from "./index"

/** A vesting consists of a MGMT and one or more RPTs. */
export abstract class Deployment<V> extends VersionedSubsystem<V> {
  log = new SiennaConsole(`Vesting ${this.version}`)

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
    return await rpt0.status()
  }

  /** Update the RPT configuration. */
  setRptConfig (config: RPTConfig) {
    console.warn('TGEDeployment#setRptConfig: TODO')
  }

  showStatus = this.command('status', 'show the status of this TGE', async (
    address = this.agent?.address!
  ) => {
    await this.showMgmtStatus()
      .catch(({message})=>this.log.error("Can't show MGMT status:  ", message))
    await this.showMgmtProgress(address)
      .catch(({message})=>this.log.error("Can't show MGMT progress:", message))
    await this.showRptStatus()
      .catch(({message})=>this.log.error("Can't show RPT status:   ", message))
  })

  /** Show the current status of the MGMT */
  async showMgmtStatus () {
    const {address} = await this.mgmt
    const status = await this.getMgmtStatus()
    this.log.mgmtStatus(status)
    return status
  }

  async showMgmtProgress (user: Address) {
    const {address} = await this.mgmt
    const progress = await this.getMgmtProgress(user)
    this.log.mgmtProgress(user, address, progress)
    return progress
  }

  /** Show the current status of the RPT. */
  async showRptStatus () {
    const rpt = (await this.rpts)[0]
    const status = await rpt.status() as { config: any[] }
    this.log.rptStatus(rpt, status)
    this.log.rptRecipients((await Promise.all(status.config.map(
      async ([address])=>({
        address,
        label:    await this.agent?.getLabel(address),
        codeHash: await this.agent?.getHash(address)
      })
    ))))
    return status
  }

}

/** A MGMT vesting contract of either version. */
export abstract class MGMT extends Client {
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
  async progress (address: Address, time = +new Date()): Promise<Progress> {
    time = Math.floor(time / 1000) // JS msec -> CosmWasm seconds
    const { progress }: { progress: Progress } =
      await this.query({ progress: { address, time } }) 
    return progress
  }
  abstract status (): Promise<unknown>
}

export function findInSchedule (
  schedule: Schedule|undefined,
  pool:     string,
  account:  string
): Account|undefined {
  if (!schedule) throw new Error('No schedule.')
  return schedule.pools
    .filter((x: Pool)=>x.name===pool)[0]?.accounts
    .filter((x: Account)=>x.name===account)[0]
}

/** A MGMT schedule. */
export interface Schedule {
  total: Uint128
  pools: Array<Pool>
}

/** A pool of a Schedule. */
export interface Pool {
  name:     string
  total:    Uint128
  partial:  boolean
  accounts: Array<Account>
}

/** An account in a Pool. */
export interface Account {
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

/** The overall progress of a vesting. */
export interface Progress {
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

export type RPTConfig    = [Address, Uint128][]

export type RPTStatus    = unknown