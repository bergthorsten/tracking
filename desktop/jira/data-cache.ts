import type {
  JiraTicket,
  JiraWorklogResult,
  SavedJiraSettings,
} from "../../src/contracts/desktop-api.ts"
import { yearMonthKey } from "../../src/domain/year-month.ts"
import { TtlCache } from "../../src/shared/cache.ts"

type JiraCacheValue = SavedJiraSettings | JiraTicket[] | JiraWorklogResult

type LoadCacheTtlMs = () => number | Promise<number>

interface CacheOptions {
  force?: boolean
}

export class JiraDataCache {
  readonly #cache = new TtlCache<JiraCacheValue>()
  readonly #loadTtlMs: LoadCacheTtlMs
  readonly #now: () => number

  constructor({
    loadTtlMs,
    now = Date.now,
  }: {
    loadTtlMs: LoadCacheTtlMs
    now?: () => number
  }) {
    this.#loadTtlMs = loadTtlMs
    this.#now = now
  }

  getProfile(load: () => Promise<SavedJiraSettings>, options?: CacheOptions) {
    return this.#cached("profile", load, options)
  }

  getIssues(
    query: string,
    load: () => Promise<JiraTicket[]>,
    options?: CacheOptions
  ) {
    return this.#cached(`issues:${query}`, load, options)
  }

  getWorklogs(
    month: string | null,
    load: () => Promise<JiraWorklogResult>,
    options?: CacheOptions
  ) {
    return this.#cached(
      `worklogs:${yearMonthKey(month, new Date(this.#now()))}`,
      load,
      options
    )
  }

  invalidateAfterWorklogCreate(worklogMonth: string) {
    this.#cache.deletePrefix("issues:")
    this.#cache.delete(`worklogs:${worklogMonth}`)
    this.#cache.delete(`worklogs:${yearMonthKey(null, new Date(this.#now()))}`)
  }

  clear() {
    this.#cache.clear()
  }

  async #cached<T extends JiraCacheValue>(
    key: string,
    load: () => Promise<T>,
    options: CacheOptions = {}
  ) {
    const cached = options.force ? undefined : this.#cache.get<T>(key, this.#now())

    if (cached) {
      return cached.value
    }

    const value = await load()
    this.#cache.set(key, value, await this.#loadTtlMs(), this.#now())

    return value
  }
}
