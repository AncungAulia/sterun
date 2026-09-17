/**
 * STE-25 — the stage manager's handle on one desk or phone process.
 *
 * Its own module so the one property that makes the rehearsal trustworthy can be
 * tested without testnet: a device process that dies fails the calls waiting on
 * it instead of leaving them unsettled. An unsettled
 * promise is not an error to node — it runs out of work and exits 0 in the
 * middle of a step, with no RESULT line and no EVIDENCE.md, so run.sh reports
 * a pass for a run that never finished (14ef24a).
 */
import { fork, type ChildProcess } from "node:child_process";

type Reply = { ok: boolean; value?: unknown; error?: string };

export class Device {
  private seq = 0;
  private stopped = false;
  private readonly pending = new Map<number, (m: Reply) => void>();
  private readonly ready: Promise<void>;
  private readonly child: ChildProcess;

  constructor(readonly role: string, bundle: string, execArgv: string[] = []) {
    this.child = fork(bundle, [role], {
      execArgv,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });
    this.ready = new Promise((resolve, reject) => {
      this.child.on("message", (raw) => {
        const m = raw as Reply & { id: number };
        if (m.id === 0) return resolve();
        this.pending.get(m.id)?.(m);
        this.pending.delete(m.id);
      });
      // A device that dies (a missing package, a crash) used to leave `ready` and
      // every pending call unsettled. Node then ran out of work and exited 0 in
      // the middle of a step, with no RESULT line and no EVIDENCE.md.
      this.child.on("exit", (code, signal) => {
        if (this.stopped) return;
        const error = `${role} process exited (code ${code}, signal ${signal}) — its own output above says why`;
        reject(new Error(error));
        for (const settle of this.pending.values()) settle({ ok: false, error });
        this.pending.clear();
      });
    });
    this.ready.catch(() => {});
  }

  async call<T = Record<string, unknown>>(cmd: string, body: Record<string, unknown> = {}): Promise<T> {
    await this.ready;
    this.seq += 1;
    const id = this.seq;
    const reply = await new Promise<Reply>((resolve) => {
      this.pending.set(id, resolve);
      this.child.send({ id, cmd, ...body });
    });
    if (!reply.ok) throw new Error(`${this.role} ${cmd}: ${reply.error}`);
    return reply.value as T;
  }

  stop(): void {
    this.stopped = true;
    this.child.kill();
  }
}
