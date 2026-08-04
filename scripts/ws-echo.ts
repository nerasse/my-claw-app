const PORT = 8080;

const server = Bun.serve({
  port: PORT,
  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname !== "/ws") return new Response("my-claw ws echo - use ws://<host>:" + PORT + "/ws", { headers: { "content-type": "text/plain" } });
    if (server.upgrade(req)) return;
    return new Response("upgrade failed", { status: 400 });
  },
  websocket: {
    open(ws) {
      console.log("client connected");
      ws.send("echo: hello from my-claw");
    },
    message(ws, msg) {
      console.log("received:", String(msg));
      ws.send(String(msg));
    },
    close() {
      console.log("client disconnected");
    },
  },
});

console.log("ws echo server listening on :" + PORT + "/ws");
