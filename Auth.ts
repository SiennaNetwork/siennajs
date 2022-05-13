import { Client } from "@fadroma/client";

export class MockAuthClient extends Client {
    async update(second_contract: any) {
        return this.execute({ update: { second_contract } });
    }
}

export class AuthProvider extends Client {

    async create_group(name: any, members: any) {
        return this.execute({ create_group: { name, members } });
    }

    async get_group(name: string) {
        return this.query({ group: { name } })
    }

    async get_oracle() {
        return this.query({ oracle: {} })
    }

    async get_admin() {
        return this.query({ admin: { admin: {} } })
    }

}
