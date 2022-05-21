// Key exchange parameters.
const keyAlgo = "ECDH";
const namedCurve = "P-256";

// Message encryption parameters.
const encAlgo = "AES-GCM";
const encAlgoLen = 256;
const encIVLen = 12;

// Encoder and decoder functions.
const arrayToHex = a => a.reduce((r, i) => r + ("0" + i.toString(16)).slice(-2), "");
const hexToArray = h => new Uint8Array(h.match(/[0-9a-f]{2}/g).map(s => parseInt(s, 16)));
const uint8Array = a => new Uint8Array(a);
const encodeText = t => new TextEncoder().encode(t);
const decodeText = a => new TextDecoder().decode(a);

// EC and AES utility functions.
const generateIV = () => crypto.getRandomValues(new Uint8Array(encIVLen));
const generateKey = () => crypto.subtle.generateKey({name: keyAlgo, namedCurve}, true, ["deriveKey"]);
const importPubKey = key => crypto.subtle.importKey("raw", key, {name: keyAlgo, namedCurve}, false, []);
const deriveKey = (pvt, pub) => crypto.subtle.deriveKey({name: keyAlgo, public: pub}, pvt, {name: encAlgo, length: encAlgoLen}, false, ["encrypt", "decrypt"]);
const encryptAES = (raw, iv, secret) => crypto.subtle.encrypt({name: encAlgo, iv}, secret, raw);
const decryptAES = (cipher, iv, secret) => crypto.subtle.decrypt({name: encAlgo, iv}, secret, cipher);
const exportKey = key => crypto.subtle.exportKey("raw", key).then(uint8Array);
const encryptText = async (text, secret, _) => (_ = generateIV(), arrayToHex(_) + arrayToHex(uint8Array(await encryptAES(encodeText(text), _, secret))));
const decryptText = async (hex, secret) => decodeText(await decryptAES(hexToArray(hex.substr(encIVLen*2)), hexToArray(hex.substr(0, encIVLen*2)), secret));

// Global state.
const g = {
  logEl: document.getElementById("log"),
  inputEl: document.getElementById("input"),
  state: "",
  ws: null,
  pvtKey: null,
  pubKey: null,
  extKey: null,
  secret: null,
  setExtKey: async key => (g.extKey = key, g.secret = await deriveKey(g.pvtKey, await importPubKey(key))),
};

// Add a line to the bottom.
function log(line, cls) {
  const div = document.createElement("div");
  div.innerText = line;
  div.className = cls || "";
  g.logEl.appendChild(div);
  scrollTo(0, document.body.clientHeight);
}

// Establish a WebSocket connection for E2EE communication.
function joinChannel(channel) {
  const ws = new WebSocket(`${location.protocol.endsWith("s:") ? "wss" : "ws"}://${location.host}/api/channel/${channel}`);
  ws.addEventListener("open", _ => {
    g.state = "open";
    log("Channel is opened");
  });
  ws.addEventListener("message", async ev => {
    try {
      const j = JSON.parse(ev.data);
      switch (j.op) {
        case 1:
          if (g.state === "ready") {
            log("The other party has left");
            g.ws.close();
          } else {
            g.state = "wait";
            log("Waiting for the other party to join");
          }
          break;
        case 2:
          g.state = "ready";
          log("Ready for e2ee communication");        
          break;
        case 3:
          log(j.data, "debug");
          log(await decryptText(j.data, g.secret), "remote");
          break;
        default:
          throw Error();
      }
    } catch (_) {
      log("Received invalid message");
    }
  });
  ws.addEventListener("close", _ => {
    g.state = "close";
    log("Channel is closed");  
  });
  ws.addEventListener("error", _ => {
    g.state = "fail";
    log("Channel is broken");  
  });
  g.ws = ws;
};

// Parse the other party's public key and join a channel.
async function parseExtKey(h) {
  // For simplicity, only uncompressed public keys are accepted.
  if (/^04[0-9a-f]{128}$/.test(h)) {
    await g.setExtKey(hexToArray(h));
    log(h, "ext-key");
    
    g.state = "join";
    // Generate a shared channel id by XOR'ing the x-coordinates of two public keys.
    const a = [];
    for (let i = 1; i <= 32; i++) {
      a.push(g.pubKey[i] ^ g.extKey[i]);
    }
    const channel = arrayToHex(a);
    log("Joining channel:");
    log(channel, "debug");
    joinChannel(channel);
  }
}

// Send encrypted message via WebSocket.
async function sendText(text) {
  const data = await encryptText(text, g.secret);
  log(data, "debug");
  log(text, "local");
  g.ws.send(JSON.stringify({op: 3, data}));
}

// Process user input based on the current state.
function enterLine(input) {
  const line = input.value.trim();
  if (line) {
    switch (g.state) {
      case "init":
        parseExtKey(line);
        break;
      case "ready":
        sendText(line);
        break;
    }
  }
  input.value = "";
}

async function start() {
  g.inputEl.addEventListener("keypress", ev => ev.key === "Enter" && enterLine(ev.currentTarget));
  log("E2EE Chat");

  // Generate an ephemeral key pair.
  const kp = await generateKey();
  g.pvtKey = kp.privateKey;
  g.pubKey = await exportKey(kp.publicKey);
  log("Share your ephemeral public key with the other party:");
  log(arrayToHex(g.pubKey), "pub-key");

  g.state = "init";
  log("Enter the other party's public key below:");
}

start();