import { Client } from "@hackbg/fadroma";

export class MockAuthClient extends Client {
    async update(second_contract: any) {
        return this.execute({ update: { second_contract } });
    }
}
