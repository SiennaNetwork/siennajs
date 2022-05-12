export interface PaginatedResponse <T> {
  /** The total number of entries stored by the contract. */
  total: number
  /** The entries on this page. */
  entries: T[]
}
