/** Keeps the most recent terminal output of a plot so its terminal can be replayed. */
export class OutputBuffer {
  private chunks: string[] = []
  private size = 0
  /** Total characters ever pushed; lets the UI line up replayed and live output. */
  total = 0

  constructor(private readonly limit = 256 * 1024) {}

  push(data: string): void {
    this.total += data.length
    this.chunks.push(data)
    this.size += data.length
    while (this.size > this.limit && this.chunks.length > 1) {
      this.size -= this.chunks.shift()!.length
    }
    if (this.size > this.limit) {
      // A single huge chunk: keep its tail.
      const only = this.chunks[0].slice(-this.limit)
      this.chunks = [only]
      this.size = only.length
    }
  }

  toString(): string {
    if (this.chunks.length > 1) this.chunks = [this.chunks.join('')]
    return this.chunks[0] ?? ''
  }
}
