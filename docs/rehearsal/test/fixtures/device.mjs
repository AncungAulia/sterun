// A device that speaks the same IPC as src/device.ts, and can be told to crash.
process.on("message", (msg) => {
  if (msg.cmd === "echo") process.send({ id: msg.id, ok: true, value: msg.value });
  if (msg.cmd === "crash") process.exit(3);
});
process.send({ id: 0, ok: true, value: { ready: process.argv[2] } });
