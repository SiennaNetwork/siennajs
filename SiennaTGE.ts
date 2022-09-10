import * as Scrt   from '@fadroma/scrt'
import * as Tokens from '@fadroma/tokens'
import * as ICC    from './ICC'
import * as YAML   from 'js-yaml'
import { CustomConsole, bold, colors } from '@hackbg/konzola'

/** Connect to an existing TGE. */
export default class SiennaTGE extends Scrt.Deployment {
  names = { token: 'SIENNA', mgmt: 'SIENNA.MGMT', rpt: 'SIENNA.RPT' }
  /** The deployed SIENNA SNIP20 token contract. */
  token = this.contract({ name: this.names.token, client: Tokens.Snip20 })
  /** Get the balance of an address in the vested token. */
  getBalance = async (addr: Scrt.Address, vk: Scrt.ViewingKey) => {
    this.log.info(`Querying balance of ${addr}...`)
    return await (await this.token).getBalance(addr, vk)
  }
  /** Set the VK of the calling address in the vested token. */
  setVK = async (vk: Scrt.ViewingKey) => {
    this.log.info('Setting VK...')
    return await (await this.token).vk.set(vk)
  }
  /** Print the result of getBalance. */
  showBalance = async (addr: Scrt.Address, vk: Scrt.ViewingKey) => {
    try {
      log.balance(addr, await this.getBalance(addr, vk))
    } catch (e) {
      if (this.isMainnet) {
        this.log.error('Mainnet: no VK?')
        return
      }
      const VK = await this.setVK(vk)
      log.balance(addr, await this.getBalance(addr, vk))
    }
  }
  /** The deployed MGMT contract, which unlocks tokens
    * for claiming according to a pre-defined schedule.  */
  mgmt = this.contract({ name: this.names.mgmt, client: MGMT_TGE })
  /** Fetch the current schedule of MGMT. */
  getMgmtSchedule = () =>
    this.mgmt.then(mgmt=>mgmt.schedule())
  /** Fetch the current schedule of MGMT. */
  getMgmtStatus = () =>
    this.mgmt.then(mgmt=>mgmt.status())
  /** Show the current status of the MGMT */
  showMgmtStatus = async () => {
    try {
      const {address} = await this.mgmt
      const status    = await this.getMgmtStatus()
      log.mgmtStatus(status)
    } catch (e) {
      log.error((e as Error).message)
    }
  }
  /** Fetch the current progress of the vesting. */
  getMgmtProgress = (addr: Scrt.Address) =>
    this.mgmt.then(mgmt=>mgmt.progress(addr))
  /** Show the current progress of the vesting. */
  showMgmtProgress = async (user: Scrt.Address) => {
    try {
      const {address} = await this.mgmt
      log.mgmtProgress(user, address, await this.getMgmtProgress(user))
    } catch (e) {
      log.error((e as Error).message)
    }
  }
  /** The deployed RPT contract, which claims tokens from MGMT
    * and distributes them to the reward pools.  */
  rpt = this.contract({ name: this.names.rpt, client: RPT_TGE })
  /** Update the RPT configuration. */
  setRptConfig (config: RPTConfig) {
    throw 'TODO'
  }
  /** Fetch the current status of RPT. */
  getRptStatus = () =>
    this.rpt.then(rpt=>rpt.status())
  /** Show the current status of the RPT. */
  showRptStatus = async () => {
    const status = await (await this.rpt).status() as { config: any[] }
    log.rptStatus(this.rpt, status)
    log.rptRecipients((await Promise.all(status.config.map(
      async ([address])=>({
        address,
        label:    await this.agent?.getLabel(address),
        codeHash: await this.agent?.getHash(address)
      })
    ))))
  }
}

const log = new class SiennaVestingConsole extends CustomConsole {

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

}(console, 'Sienna Vesting')

/** Contract address/hash pair as used by MGMT */
export type LinkTuple = [Scrt.Address, Scrt.CodeHash]

/** Convert Fadroma.Instance to address/hash pair as used by MGMT */
export const linkTuple = (instance: ICC.IntoLink) => (
  [ ICC.validatedAddressOf(instance), ICC.validatedCodeHashOf(instance) ]
)

/** The SIENNA SNIP20 token. */
export class SiennaSnip20 extends Tokens.Snip20 {}

/** A MGMT vesting contract of either version. */
export abstract class MGMT extends Scrt.Client {

  static MINTING_POOL = "MintingPool"

  static LPF = "LPF"

  static RPT = "RPT"

  static emptySchedule = (address: Scrt.Address) => ({
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
  async acquire (token: Tokens.Snip20) {
    const tx1 = await token.setMinters([this.address!])
    const tx2 = await token.changeAdmin(this.address!)
    return [tx1, tx2]
  }
  /** Check how much is claimable by someone at a certain time */
  async progress (address: Scrt.Address, time = +new Date()): Promise<VestingProgress> {
    time = Math.floor(time / 1000) // JS msec -> CosmWasm seconds
    const { progress } = await this.query({ progress: { address, time } })
    return progress
  }
}

/** A MGMT schedule. */
export interface VestingSchedule {
  total: Scrt.Uint128
  pools: Array<VestingPool>
}

export interface VestingPool {
  name:     string
  total:    Scrt.Uint128
  partial:  boolean
  accounts: Array<VestingAccount>
}

export interface VestingAccount {
  name:         string
  amount:       Scrt.Uint128
  address:      Scrt.Address
  start_at:     Scrt.Duration
  interval:     Scrt.Duration
  duration:     Scrt.Duration
  cliff:        Scrt.Uint128
  portion_size: Scrt.Uint128
  remainder:    Scrt.Uint128
}

export interface VestingProgress {
  time:     number
  launcher: number
  elapsed:  number
  unlocked: string
  claimed:  string
}

/** A RPT (redistribution) contract of each version. */
export abstract class RPT extends Scrt.Client {
  /** Claim from mgmt and distribute to recipients. Anyone can call this method as:
    * - the recipients can only be changed by the admin
    * - the amount is determined by MGMT */
  vest() {
    return this.execute({ vest: {} })
  }
}

export type RPTRecipient = string

export type RPTAmount    = string

export type RPTConfig    = [RPTRecipient, RPTAmount][]

export type RPTStatus    = unknown

export class MGMT_TGE extends MGMT {

  /** Generate an init message for Origina MGMT */
  static init = (
    admin:    Scrt.Address,
    token:    Scrt.IntoLink,
    schedule: VestingSchedule
  ) => ({
    admin,
    token: linkTuple(token),
    schedule
  })

  /** Query contract status */
  status() {
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
    admin:    Scrt.Address,
    portion:  RPTAmount,
    config:   RPTConfig,
    token:    Scrt.IntoLink,
    mgmt:     Scrt.IntoLink
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
  setOwner (new_admin: Scrt.Address) {
    return this.execute({ set_owner: { new_admin } })
  }

}
