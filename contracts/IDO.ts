import { Client, Agent } from '@fadroma/client-scrt-grpc'

export interface IDOSaleStatus {
  total_allocation:   string
  available_for_sale: string
  sold_in_pre_lock:   string
  is_active:          boolean
}

export interface IDOEligibility {
  can_participate: boolean
}

export interface IDOBalance {
  pre_lock_amount: string
  total_bought:    string
}

export interface IDOSaleInfo {
  input_token:    object, // same as init input token
  sold_token:     object, // same as init sold token
  rate:           string, // rate of exchange
  taken_seats:    number,
  max_seats:      number,
  max_allocation: string,
  min_allocation: string,
  start:          number,
  end:            number
}

export class IDO extends Client {

  /** Check if the address can participate in an IDO */
  eligibility (address: string): Promise<IDOEligibility> {
    return this.query({eligibility_info: { address }});
  }

  /** Check the sale status of the IDO project */
  saleStatus (): Promise<IDOSaleStatus> {
    return this.query({sale_status:{}})
  }

  /** Check the amount user has pre locked and the amount user has swapped */
  balance (address: string, key: string): Promise<IDOBalance> {
    return this.query({balance: { address, key }})
  }

  /** Check the sale info of the IDO project */
  saleInfo (): Promise<IDOSaleInfo> {
    return this.query({sale_info: {}})
  }

  /**
   * This method will perform the native token swap.
   *
   * IMPORTANT: if custom buy token is set, you have to use the SNIP20
   * receiver callback interface to initiate swap.
   */
  swap(amount: string|number|bigint, agent?: Agent, receiver: string|null = null) {
    return this.tx.swap(
      { amount: `${amount}`, receiver },
      agent,
      undefined,
      [{ denom: "uscrt", amount: `${amount}` }]
    );
  }

  /**
   * This method will perform the native token pre_lock.
   *
   * IMPORTANT: if custom buy token is set, you have to use the SNIP20
   * receiver callback interface to initiate pre_lock.
   */
  preLock(amount: string|number|bigint, agent: Agent) {
    return this.tx.pre_lock(
      { amount: `${amount}` },
      agent,
      undefined,
      [{ amount: `${amount}`, denom: "uscrt" }],
    );
  }

  /** Get info about the sale token */
  tokenInfo(): Promise<object> {
    return this.q.token_info()
  }

  admin = new IDOAdmin(this.agent, this)

}

export class IDOAdmin extends Client {
  /** After the sale ends, admin can use this method to refund all tokens that
    * weren't sold in the IDO sale */
  adminRefund(address: string, agent: Agent): Promise<object> {
    return this.tx.admin_refund({ address }, agent)
  }

  /** After the sale ends, admin will use this method to claim all the profits
    * accumulated during the sale */
  adminClaim (address: string, agent: Agent): Promise<object> {
    return this.tx.admin_claim({ address }, agent)
  }

  /** Add addresses on whitelist for IDO contract */
  adminAddAddresses (addresses: string[], agent: Agent): Promise<object> {
    return this.tx.admin_add_addresses({ addresses }, agent)
  }
}
