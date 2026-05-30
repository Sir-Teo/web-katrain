export class AnalysisQueueCanceledError extends Error {
  readonly canceled = true;

  constructor(message = 'Analysis queue job canceled') {
    super(message);
    this.name = 'AnalysisQueueCanceledError';
  }
}

export class AnalysisQueueStaleError extends Error {
  readonly stale = true;

  constructor(message = 'Analysis queue job is stale') {
    super(message);
    this.name = 'AnalysisQueueStaleError';
  }
}

export const isAnalysisQueueCanceledError = (err: unknown): err is AnalysisQueueCanceledError => {
  if (!err || typeof err !== 'object') return false;
  if ((err as { canceled?: boolean }).canceled) return true;
  return err instanceof Error && err.name === 'AnalysisQueueCanceledError';
};

export const isAnalysisQueueStaleError = (err: unknown): err is AnalysisQueueStaleError => {
  if (!err || typeof err !== 'object') return false;
  if ((err as { stale?: boolean }).stale) return true;
  return err instanceof Error && err.name === 'AnalysisQueueStaleError';
};

type AbortListener = () => void;

export class AnalysisQueueSignal {
  private listeners = new Set<AbortListener>();
  aborted = false;
  reason = '';

  addAbortListener(listener: AbortListener): () => void {
    if (this.aborted) {
      listener();
      return () => undefined;
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  throwIfAborted(): void {
    if (this.aborted) throw new AnalysisQueueCanceledError(this.reason || undefined);
  }

  abort(reason: string): void {
    if (this.aborted) return;
    this.aborted = true;
    this.reason = reason;
    for (const listener of this.listeners) listener();
    this.listeners.clear();
  }
}

export type AnalysisQueueContext = {
  jobId: string;
  signal: AnalysisQueueSignal;
  isStale: () => boolean;
};

export type AnalysisQueueJobSnapshot = {
  id: string;
  label: string;
  group: string;
  priority: number;
  state: 'pending' | 'active';
  staleKey?: string;
  cacheKey?: string;
};

type AnalysisQueueJob<T> = {
  id: string;
  label: string;
  group: string;
  priority: number;
  sequence: number;
  staleKey?: string;
  staleVersion?: number;
  cacheKey?: string;
  preempt: boolean;
  signal: AnalysisQueueSignal;
  run: (ctx: AnalysisQueueContext) => Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
};

export type AnalysisQueueEnqueueOptions<T> = {
  id?: string;
  label?: string;
  group: string;
  priority: number;
  staleKey?: string;
  cacheKey?: string;
  bypassCache?: boolean;
  preempt?: boolean;
  run: (ctx: AnalysisQueueContext) => Promise<T>;
};

export class AnalysisQueue {
  private nextId = 1;
  private sequence = 1;
  private readonly pending: AnalysisQueueJob<unknown>[] = [];
  private readonly active = new Set<AnalysisQueueJob<unknown>>();
  private readonly staleVersions = new Map<string, number>();
  private readonly cache = new Map<string, unknown>();
  private readonly maxCacheEntries: number;

  constructor(maxCacheEntries = 128) {
    this.maxCacheEntries = maxCacheEntries;
  }

  enqueue<T>(opts: AnalysisQueueEnqueueOptions<T>): Promise<T> {
    const staleVersion = opts.staleKey ? this.bumpStaleVersion(opts.staleKey) : undefined;
    if (opts.staleKey) this.cancelPendingStaleJobs(opts.staleKey, staleVersion);

    const cached = opts.cacheKey && !opts.bypassCache ? this.cache.get(opts.cacheKey) : undefined;
    if (cached !== undefined) return Promise.resolve(cached as T);

    return new Promise<T>((resolve, reject) => {
      const job: AnalysisQueueJob<T> = {
        id: opts.id ?? `analysis-job-${this.nextId++}`,
        label: opts.label ?? opts.id ?? 'Analysis job',
        group: opts.group,
        priority: opts.priority,
        sequence: this.sequence++,
        staleKey: opts.staleKey,
        staleVersion,
        cacheKey: opts.cacheKey,
        preempt: opts.preempt === true,
        signal: new AnalysisQueueSignal(),
        run: opts.run,
        resolve,
        reject,
      };

      const hasHigherPriorityActive = Array.from(this.active).some(
        (activeJob) => !activeJob.signal.aborted && activeJob.priority > job.priority
      );
      if (job.preempt && !hasHigherPriorityActive) {
        this.cancelActiveAtOrBelow(job.priority, `Preempted by ${job.label}`);
        this.start(job as AnalysisQueueJob<unknown>);
        return;
      }

      this.pending.push(job as AnalysisQueueJob<unknown>);
      this.pump();
    });
  }

  cancelGroup(group: string, reason = `Canceled ${group} analysis jobs`): number {
    return this.cancelWhere((job) => job.group === group, reason);
  }

  cancelWhere(predicate: (job: AnalysisQueueJobSnapshot) => boolean, reason = 'Analysis job canceled'): number {
    let count = 0;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const job = this.pending[i]!;
      if (!predicate(this.snapshotOf(job, 'pending'))) continue;
      this.pending.splice(i, 1);
      job.signal.abort(reason);
      job.reject(new AnalysisQueueCanceledError(reason));
      count++;
    }

    for (const job of this.active) {
      if (!predicate(this.snapshotOf(job, 'active'))) continue;
      job.signal.abort(reason);
      count++;
    }
    return count;
  }

  clearCache(): void {
    this.cache.clear();
  }

  getSnapshot(): { active: AnalysisQueueJobSnapshot[]; pending: AnalysisQueueJobSnapshot[] } {
    return {
      active: Array.from(this.active).map((job) => this.snapshotOf(job, 'active')),
      pending: this.pending.map((job) => this.snapshotOf(job, 'pending')),
    };
  }

  private start(job: AnalysisQueueJob<unknown>): void {
    if (job.signal.aborted) {
      job.reject(new AnalysisQueueCanceledError(job.signal.reason || undefined));
      this.pump();
      return;
    }

    this.active.add(job);
    const isStale = () => this.isStale(job);

    void job
      .run({ jobId: job.id, signal: job.signal, isStale })
      .then((result) => {
        if (job.signal.aborted) throw new AnalysisQueueCanceledError(job.signal.reason || undefined);
        if (isStale()) throw new AnalysisQueueStaleError(`${job.label} result was superseded`);
        if (job.cacheKey) this.writeCache(job.cacheKey, result);
        job.resolve(result);
      })
      .catch((err: unknown) => {
        if (job.signal.aborted) {
          job.reject(new AnalysisQueueCanceledError(job.signal.reason || undefined));
          return;
        }
        if (this.isStale(job)) {
          job.reject(new AnalysisQueueStaleError(`${job.label} result was superseded`));
          return;
        }
        job.reject(err);
      })
      .finally(() => {
        this.active.delete(job);
        this.pump();
      });
  }

  private pump(): void {
    if (this.active.size > 0 || this.pending.length === 0) return;
    this.pending.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
    const next = this.pending.shift();
    if (next) this.start(next);
  }

  private cancelActiveAtOrBelow(priority: number, reason: string): void {
    for (const job of this.active) {
      if (job.priority <= priority) job.signal.abort(reason);
    }
  }

  private cancelPendingStaleJobs(staleKey: string, currentVersion?: number): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const job = this.pending[i]!;
      if (job.staleKey !== staleKey || job.staleVersion === currentVersion) continue;
      this.pending.splice(i, 1);
      const reason = `${job.label} was superseded`;
      job.signal.abort(reason);
      job.reject(new AnalysisQueueStaleError(reason));
    }
  }

  private bumpStaleVersion(staleKey: string): number {
    const next = (this.staleVersions.get(staleKey) ?? 0) + 1;
    this.staleVersions.set(staleKey, next);
    return next;
  }

  private isStale(job: AnalysisQueueJob<unknown>): boolean {
    if (!job.staleKey) return false;
    return this.staleVersions.get(job.staleKey) !== job.staleVersion;
  }

  private writeCache(cacheKey: string, value: unknown): void {
    if (this.cache.has(cacheKey)) this.cache.delete(cacheKey);
    this.cache.set(cacheKey, value);
    while (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private snapshotOf(job: AnalysisQueueJob<unknown>, state: 'pending' | 'active'): AnalysisQueueJobSnapshot {
    return {
      id: job.id,
      label: job.label,
      group: job.group,
      priority: job.priority,
      state,
      staleKey: job.staleKey,
      cacheKey: job.cacheKey,
    };
  }
}

export const analysisQueue = new AnalysisQueue();
