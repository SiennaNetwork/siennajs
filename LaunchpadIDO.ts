import { Snip20, ViewingKeyClient } from './Core'
import type {
  CallbackMsgType, Project, IdoPermissions, MerkleAuth, SaleStatus, Account
} from './LaunchpadConfig'
import type { Uint128, Address } from './Core'
import type * as Auth from './Auth'

export class IDO extends ViewingKeyClient {
    /**
     *
     * @param callback What kind of operation to perform. Swap | Launch | Prelock
     * @param amount The amount of tokens to send
     * @param token Which token to send
     * @returns
     */
    async deposit(callback: CallbackMsgType, amount: Uint128, token: Address) {
        return this.agent!
            .getClient(Snip20, token)
            .withFee(this.getFee('deposit')!)
            .send(amount, this.address!, callback);
    }

    /**
     * Swap the prelocked tokens for the project tokens.
     * @param recipient Address to send the tokens to
     *
     */
    async claimTokens(recipient?: Address) {
        return this.execute({ claim_tokens: { recipient } });
    }

    /**
     * Refund tokens to the creator or someone else.
     * Viable when sale ends. Creator only transaction.
     *
     * @param return_type Wheter to swap the tokens or just refund them
     * @param address Whom to send the adress to
     * @returns
     */
    async refundTokens(recipient?: Address) {
        return this.execute({ refund_tokens: { recipient } });
    }

    /**
     * Fetch all data about the project.
     *
     * @returns Project
     */
    async saleInfo(): Promise<Project> {
        return this.query({ sale_info: {} });
    }

    /**
     * Get detailed information about the project sale.
     *
     * @returns The current sale status
     */
    async saleStatus(): Promise<SaleStatus> {
        return this.query({ sale_status: {} });
    }
    
    /**
     * Fetch the account information for a user
     *
     * @param auth Authentication method
     * @returns Account
     */
    async account(auth: Auth.AuthMethod<IdoPermissions>): Promise<Account> {
        return this.query({ account: { auth } });
    }

    /**
     * Get the claimable amount for the given time.
     * 
     * @param auth Authentication method.
     * @param time Unix timestamp as seconds. If omitted provides the current time.
     * @returns Uint128
     */
    async claimable(auth: Auth.AuthMethod<IdoPermissions>, time?: number): Promise<Uint128> {
        return this.query({ claimable: {
            auth,
            time: time ? time : Math.floor(Date.now() / 1000)
        }});
    }

    /**
     * For a given user, check if he is whitelisted
     *
     * @param address Address to be checked
     * @param auth Partial merkle tree which is used for verification
     * @returns Eligibility of the address
     */
    async eligibility(
        address: Address,
        auth: MerkleAuth
    ): Promise<boolean> {
        return this.query({ eligibility: { address, auth } });
    }
}
