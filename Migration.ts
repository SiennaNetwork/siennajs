import * as Fadroma from '@fadroma/scrt'

/** Per-user contract-to-contract migrations. */

export class Emigration extends Fadroma.Client {
  enableTo(link: Fadroma.ContractLink) {
    return this.execute({ emigration: { enable_migration_to: link } });
  }
  disableTo(link: Fadroma.ContractLink) {
    return this.execute({ emigration: { disable_migration_to: link } });
  }
}

export class Immigration extends Fadroma.Client {
  enableFrom(link: Fadroma.ContractLink) {
    return this.execute({ immigration: { enable_migration_from: link } });
  }
  disableFrom(link: Fadroma.ContractLink) {
    return this.execute({ immigration: { disable_migration_from: link } });
  }
  migrateFrom(link: Fadroma.ContractLink) {
    return this.execute({ immigration: { request_migration: link } });
  }
}
