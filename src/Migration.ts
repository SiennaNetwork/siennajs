import { Client } from '@fadroma/scrt'
import type { ContractLink } from '@fadroma/scrt'

/** Per-user contract-to-contract migrations. */
export class Emigration extends Client {
  enableTo(link: ContractLink) {
    return this.execute({ emigration: { enable_migration_to: link } });
  }
  disableTo(link: ContractLink) {
    return this.execute({ emigration: { disable_migration_to: link } });
  }
}

/** Per-user contract-to-contract migrations. */
export class Immigration extends Client {
  enableFrom(link: ContractLink) {
    return this.execute({ immigration: { enable_migration_from: link } });
  }
  disableFrom(link: ContractLink) {
    return this.execute({ immigration: { disable_migration_from: link } });
  }
  migrateFrom(link: ContractLink) {
    return this.execute({ immigration: { request_migration: link } });
  }
}

