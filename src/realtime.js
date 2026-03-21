const WebSocket = require("ws");

function createRealtimeServer(server) {
  const wss = new WebSocket.Server({ server });

  function broadcast(type, payload) {
    const message = JSON.stringify({ type, payload });

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  wss.on("connection", (socket) => {
    socket.send(JSON.stringify({ type: "news:connected", payload: { ok: true } }));
  });

  return { broadcast };
}

module.exports = { createRealtimeServer };
