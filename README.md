# cf-e2eechat

End-to-end encrypted chat demo using [Cloudflare Workers](https://developers.cloudflare.com/workers) and [Durable Objects](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/).

Live demo: https://e2eechat.migrant.workers.dev/

Screencast: [e2eechat.mp4](e2eechat.mp4)

## Usage

1. Two users start chatting over an insecure channel which might be eavesdropping on the conversation.
2. Both parties open https://e2eechat.migrant.workers.dev/ and copy their public key.
3. They exchange keys over the existing channel and enter the other party's key in e2eechat.
4. Once both users join the shared channel, they can start messaging each other with end-to-end encryption.

## Inner workings

* [worker.mjs](worker.mjs) runs as a Cloudflare Worker to serve static contents (index.*) and delegates websocket requests to a Durable Object "`Channel`".
* When [index.html](index.html) is loaded, [index.js](index.js) generates an ephemeral ECC key pair on the client side. The public key is hex-encoded and shown to the user for sharing.
* After the user enters the other party's public key, a websocket connection is established at `/api/channel/{channel-id}`. The channel id is deterministically generated from both public keys.
* When the other user joins the channel which is handled by the same Durable Object instance, both clients are ready for E2EE messaging.
* Using a secret derived from the sender's private key and the recipient's public key, each message is AES-encrypted on the client side, relayed by the shared Durable Object on the server side, and eventually decrypted by the recipient on the other end.

## Limitations

* A channel allows two users only. It requires a more sophisticated E2EE protocol to support group chat.
* For simplicity's sake, this demo does not prevent denial-of-service, message replay, and message tampering attacks.
* No attempt is made to reconnect to a broken websocket session.