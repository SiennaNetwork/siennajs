import { Client } from "@fadroma/client";

export class MockAuthClient extends Client {
    async update(second_contract: any) {
        return this.execute({ update: { second_contract } });
    }
}
