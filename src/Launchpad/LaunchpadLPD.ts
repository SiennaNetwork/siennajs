import { ViewingKeyClient } from '../Core'
import type { Address } from '../Core'
import type {
  IdoCollection, IdoSettings, MerkleTreeInfo, LaunchpadPermissions, SaleConstraints
} from './LaunchpadConfig'
import { MerkleTree } from 'merkletreejs'
import * as Auth from '../Auth/Auth'

export class Launchpad extends ViewingKeyClient {

    get auth () { return new Auth.AuthClient(this.agent, this.address, this.codeHash) }

    /**
     * Creates a new project
     * @param settings
     * @param entropy
     * @returns
     */
    async launch(settings: IdoSettings, entropy: String) {
        return this.execute({ launch: { settings, entropy } });
    }

    /**
     * Admin only transaction to add new creators
     * @param addresses List of users
     */
    async addCreators(addresses: Address[]) {
        return this.execute({ add_project_owners: { addresses } });
    }

    /**
     * Get the entries for a list of users
     * @param auth Authentication method
     * @param addresses List of HumanAddr's to be checked
     * @param time Current timestamp
     * @returns Entries
     */
    async getEntries(
        auth: Auth.AuthMethod<LaunchpadPermissions>,
        addresses: Address[],
        time: number
    ): Promise<number[]> {
        return this.query({ get_entries: { auth, addresses, time } });
    }

    /**
     * Fetch the constraints to which every launched project is limited to.
     * @returns SaleConstraints
     */
    async saleConstraints(): Promise<SaleConstraints> {
        return this, this.query({ sale_constraints: {} });
    }
    /**
     * Get a paginated list of IDO's stored on the launchpad
     * @param start Starting page
     * @param limit Items per page
     * @returns IdoCollection
     */
    async getIdos(
        start: number = 0,
        limit: number = 5
    ): Promise<IdoCollection> {
        return this.query({ idos: { pagination: { start, limit } } });
    }

    async drawWinners(
        addresses: Address[],
        auth: Auth.AuthMethod<LaunchpadPermissions>,
        seatsOpen: number
    ): Promise<Address[]> {
        const entries = await this.getEntries(auth, addresses, Date.now());
        const mappedAccounts = addresses.map((addr, i) => ({
            address: addr,
            entries: entries[i],
        }));

        const winners = [];
        for (let i = 0; i < seatsOpen; i++) {
            const winner = this.weightedRandom(mappedAccounts);
            winners.push(winner);
            mappedAccounts.splice(mappedAccounts.indexOf(winner!), 1);
        }

        return winners.map((winner) => winner!.address);
    }

    private weightedRandom(accounts: { address: Address; entries: number }[]) {
        const weights: Array<number> = [];
        for (let i = 0; i < accounts.length; i++) {
            weights[i] = accounts[i].entries + (weights[i - 1] || 0);
        }

        const random = this.getRandomIntInclusive(
            0,
            weights[weights.length - 1]
        );

        for (let i = 0; i < weights.length; i++) {
            if (random < weights[i]) {
                return accounts[i];
            }
        }
    }

    private getRandomIntInclusive(min: number, max: number): number {
        var rval = 0;
        var range = max - min;

        var bits_needed = Math.ceil(Math.log2(range));
        if (bits_needed > 32) {
            throw new Error('Cannot use more than 32 bits');
        }
        var bytes_needed = Math.ceil(bits_needed / 8);
        var mask = Math.pow(2, bits_needed) - 1;
        // Create byte array and fill with N random numbers
        var byteArray = new Uint8Array(bytes_needed);
        //@ts-ignore
        window.crypto.getRandomValues(byteArray);

        var p = (bytes_needed - 1) * 8;
        for (var i = 0; i < bytes_needed; i++) {
            rval += byteArray[i] * Math.pow(2, p);
            p -= 8;
        }

        // Use & to apply the mask and reduce the number of recursive lookups
        rval = rval & mask;

        if (rval >= range) {
            // Integer out of acceptable range
            return this.getRandomIntInclusive(min, max);
        }
        // Return an integer that falls within the range
        return min + rval;
    }

    createMerkleTree(addresses: Address[]): MerkleTreeInfo {
        const leaves = addresses.map((addr) => CryptoJS.SHA256(addr));
        const tree = new MerkleTree(leaves, CryptoJS.SHA256);

        const root = tree.getRoot().toString('hex');

        return {
            leaves_count: tree.getLeafCount(),
            root,
        };
    }
}
