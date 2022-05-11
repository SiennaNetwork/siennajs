import { Console, bold } from '@hackbg/konzola'
import { Client } from '@fadroma/client'
import { Snip20 } from '@fadroma/tokens'
import { LPToken } from './LPToken'

export type RewardsAPIVersion = 'v2'|'v3'

type Link = { address: string, code_hash: string }

const console = Console('@sienna/rewards/Api')
const now = () => Math.floor(+ new Date() / 1000)

export abstract class Rewards extends Client {

  abstract getStakedToken (): Promise<LPToken|Snip20>

  static "v2" = class Rewards_v2 extends Rewards {

    async getPoolInfo (at = now()) {
      const result = await this.query({ pool_info: { at } })
      return result.pool_info
    }

    async getUserInfo (key = "", address = this.agent.address, at = now()) {
      at = at || (await this.agent.block).header.height
      const result = await this.query({user_info: { address, key, at } })
      return result.user_info
    }

    async getStakedToken () {
      const at = Math.floor(+new Date()/1000)
      const {pool_info} = await this.query({pool_info:{at}})
      const {address, code_hash} = pool_info.lp_token
      return new LPToken({ address, codeHash: code_hash, agent: this.agent })
    }

    async getRewardToken () {
      throw new Error('not implemented')
    }

    lock (amount: string) {
      return this.execute({ lock: { amount } })
    }

    claim () {
      return this.execute({ claim: {} })
    }

    set_viewing_key(key: string) {
      return this.execute({ set_viewing_key: { key } })
    }

  }

  static "v3" = class Rewards_v3 extends Rewards {

    async getConfig () {
      const result = await this.query({ rewards: "config" })
      return result.rewards.config
    }

    async getStakedToken () {
      const { lp_token: { address, code_hash } } = await this.getConfig()
      return new LPToken({ address, codeHash: code_hash, agent: this.agent })
    }

    setStakedToken (address: string, code_hash: string) {
      return this.execute({
        rewards: { configure: { lp_token: { address, code_hash } } }
      })
    }

    async getRewardToken () {
      throw new Error('not implemented')
    }

    async getPoolInfo (
      at = Math.floor(+ new Date() / 1000)
    ) {
      const result = await this.query({ rewards: { pool_info: { at } } })
      return result.rewards.pool_info
    }

    async getEpoch (): Promise<number> {
      const { clock: { number } } = await this.getPoolInfo()
      return number
    }

    async beginNextEpoch () {
      const { clock: { number } } = await this.getPoolInfo()
      return this.execute({ rewards: { begin_epoch: number + 1 } })
    }

    async getUserInfo (
      key     = "",
      address = this.agent.address,
      at      = Math.floor(+ new Date() / 1000)
    ) {
      const result = await this.query({ rewards: { user_info: { address, key, at } } })
      return result.rewards.user_info
    }

    lock (amount: string) {
      console.warn(
        '[@sienna/rewards] Deprecation warning: v2 Lock has been renamed to Deposit in v3. ' +
        'It will be gone in 3.1 - plan accordingly.'
      )
      return this.deposit(amount)
    }

    deposit (amount: string) {
      return this.execute({
        rewards: { deposit: { amount } }
      })
    }

    claim () {
      return this.execute({
        rewards: { claim: {} }
      })
    }

    close (message: string) {
      return this.execute({
        rewards: { close: { message } }
      })
    }

    withdraw (amount: string) {
      return this.execute({
        rewards: { withdraw: { amount } }
      })
    }

    drain (snip20: Link, recipient: string, key?: string) {
      return this.execute({ drain: { snip20, recipient, key } })
    }

    set_viewing_key (key: string) {
      return this.execute({ set_viewing_key: { key } })
    }

    emigration  = new Emigration({
      agent:    this.agent,
      address:  this.address,
      codeHash: this.codeHash
    })

  }

  // for now use this for testing only
  static "v3.1" = class Rewards_v3_1 extends Rewards {

    emigration  = new Emigration({
      agent:    this.agent,
      address:  this.address,
      codeHash: this.codeHash
    })

    emigration  = new Immigration({
      agent:    this.agent,
      address:  this.address,
      codeHash: this.codeHash
    })

  }

}

export class Emigration extends Client {

  enableTo (link: Link) {
    return this.execute({
      emigration: { enable_migration_to: link }
    })
  }

  disableTo (link: Link) {
    return this.execute({
      emigration: { disable_migration_to: link }
    })
  }

}

export class Immigration extends Client {

  enableFrom (link: Link) {
    return this.execute({
      immigration: { enable_migration_from:  link }
    })
  }

  disableFrom (link: Link) {
    return this.execute({
      immigration: { disable_migration_from: link }
    })
  }

  migrateFrom (link: Link) {
    return this.execute({
      immigration: { request_migration: link }
    })
  }

}
