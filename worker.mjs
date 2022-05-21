import index_html from "./index.html";
import index_css from "./index.css";
import index_js from "./index.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    // Serve static content.
    if (path === "/") {
      return new Response(index_html, {headers: {"content-type": "text/html"}});
    } else if (path === "/index.css") {
      return new Response(index_css, {headers: {"content-type": "text/css"}});
    } else if (path === "/index.js") {
      return new Response(index_js, {headers: {"content-type": "text/javascript"}});
    } else if (path.startsWith("/api/channel/")) {
    // Delegate websocket requests to durable object.
      const seg = path.split("/");
      if (seg.length === 4 && seg[3].match(/^[0-9a-f]{64}$/)) {
        const channel = env.channels.get(env.channels.idFromName(seg[3]));
        return channel.fetch(req.url, req);
      }
    }
    return new Response("not found", {status: 404});
  }
}

const messageLimit = 4096;

// Durable object for message relay.
export class Channel {
  constructor(state, env) {
    // Store nothing persistently.
    this.sessions = [];
  }

  async fetch(req) {
    if (req.headers.get("Upgrade") !== "websocket") {
      return new Response("websocket only", {status: 400});
    }
    // Each channel is limited to two client sessions.
    // A different E2EE protocol is needed to support group chats.
    if (this.sessions.length >= 2) {
      return new Response("already in use", {status: 403});
    }
    const pair = new WebSocketPair();
    const ws = pair[1];
    ws.accept();
    this.sessions.push(ws);

    ws.addEventListener("message", async msg => {
      const data = msg.data;
      if (typeof data === "string" && data.length && data.length <= messageLimit) {
        try {
          // Relay encrypted messages.
          const j = JSON.parse(data);
          if (j.op === 3) {
            const s = this.sessions.find(s => s !== ws);
            if (s) {
              s.send(data);
            } 
          }
        } catch (_) {
        }
      }
    });
  
    ws.addEventListener("close", _ => {
      this.sessions = this.sessions.filter(s => s !== ws);
      this.clientChanged();
    });

    this.clientChanged();

    return new Response(null, {status: 101, webSocket: pair[0]});
  }

  clientChanged() {
    // Broadcast the number of active clients in the channel.
    const payload = JSON.stringify({op: this.sessions.length});
    this.sessions.forEach(s => s.send(payload));
  }
}