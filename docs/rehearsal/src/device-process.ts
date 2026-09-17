/**
 * STE-25 — the stage manager's handle on one desk or phone process.
 *
 * Its own module so the one property that makes the rehearsal trustworthy can be
 * tested without testnet: a device process that dies fails the calls waiting on
 * it, and every later call, instead of leaving them unsettled. An unsettled
 * promise is not an error to node — it runs out of work and exits 0 in the
 * middle of a step, with no RESULT line and no EVIDENCE.md, so run.sh reports
 * a pass for a run that never finished (14ef24a).
 */
import { fork, type ChildProcess } from "node:child_process";

type Reply = { ok: boolean; value?: unknown; error?: string };

export class Device {
  private seq = 0;
  private stopped = false;
  private exited: string | undefined;
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
      const fail = (error: string) => {
        if (this.stopped || this.exited) return;
        this.exited = error;
        reject(new Error(error));
        for (const settle of this.pending.values()) settle({ ok: false, error });
        this.pending.clear();
      };
      this.child.on("exit", (code, signal) => {
        fail(`${role} process exited (code ${code}, signal ${signal}) — its own output above says why`);
      });
      // A process that could not be spawned, or a send to one that has gone:
      // node emits "error" on the child, and unhandled it would take the stage
      // manager down with it, mid-step and without EVIDENCE.md.
      this.child.on("error", (error) => fail(`${role} process failed: ${error.message}`));
    });
    this.ready.catch(() => {});
  }

  async call<T = Record<string, unknown>>(cmd: string, body: Record<string, unknown> = {}): Promise<T> {
    await this.ready;
    // A device that died after it was ready: `exit` has already settled what was
    // pending then, and nothing would ever settle a call made now.
    if (this.exited) throw new Error(`${this.role} ${cmd}: ${this.exited}`);
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
