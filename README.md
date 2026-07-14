# Velo

Turn an Android phone into a virtual webcam for Windows 11, over any network, without paid
external services. Video is streamed WebRTC-style from the Velo Mobile app straight into a
DirectShow virtual camera that shows up in Discord, Zoom, OBS, etc.

## How the pieces talk to each other

- **Velo Desktop** (Windows, Tauri) bundles a local signaling server as a sidecar process
  (`velo-backend.exe`). It starts automatically with the app and listens on
  `127.0.0.1:{network.signaling_port}` (`4001` by default, see `config/system.yml`).
- **Velo Mobile** (Android, Capacitor) is a separate physical device. It reaches the desktop's
  signaling server over the network, never over `localhost`.
- Both apps load their UI from the same deployed page (`https://velo.cetrei.dev` by default),
  so pairing, settings, and updates always match without reinstalling anything.

Because the phone is a different device, **the desktop's local backend must be exposed to it**.
That's what the Cloudflare Tunnel below is for. This is required in both connection modes
described next — the modes only change how the *video* travels once signaling has connected
the two devices, not whether the phone can reach the signaling server in the first place.

## Connection modes

Pick this in the desktop app: **Settings → Connection mode**. This setting lives in
`config/user.yml` on the machine running Velo Desktop, so it's only editable there; the phone's
own Settings screen shows a note pointing back to the desktop app instead of a broken form,
since the phone has no local config file of its own to write to.

### Encrypted, direct (STUN) — `stun_p2p`

- After the phone and desktop find each other through the signaling server, they open a real
  WebRTC `RTCPeerConnection` and negotiate ICE candidates using the STUN servers listed in
  `config/system.yml` (`stun.l.google.com` by default).
- Once ICE succeeds, video flows **directly, peer-to-peer**, encrypted end-to-end via WebRTC's
  built-in DTLS-SRTP. The tunnel/signaling connection is only used for the brief SDP/ICE
  handshake, not for the video itself.
- Works out of the box on most home networks. If both devices sit behind restrictive/symmetric
  NATs, add your own TURN server under Settings → the optional TURN fields, or see
  [Optional: TURN relay](#optional-turn-relay-for-restrictive-networks) below.
- Use this mode by default. It's faster and keeps video off the tunnel entirely.

### Unencrypted, via tunnel — `cloudflare_relay`

- No P2P attempt at all. Camera frames are captured as JPEGs and sent as binary messages over
  the same signaling connection that's already reaching the desktop through the tunnel.
- There is no WebRTC DTLS-SRTP layer in this mode, so treat it as unencrypted end-to-end even
  though the tunnel itself may be serving HTTPS/WSS in transit.
- Useful as a fallback when STUN can't establish a direct path (e.g. carrier-grade NAT on
  cellular, corporate firewalls) since it only needs the connection that's already open for
  signaling.
- Because every frame now travels through your tunnel, bandwidth and latency depend entirely on
  your Cloudflare Tunnel's connection quality.

## One-time setup: Cloudflare Tunnel

This step is what lets the phone (on Wi-Fi, cellular, anywhere) reach the desktop's local
signaling server. Skipping it means the phone can never pair, regardless of connection mode.

There are two ways to keep the tunnel running. Pick one; they are not meant to run at the same
time against the same hostname.

### Option A: Manual `cloudflared` (recommended, works on any host)

1. Install `cloudflared` on the Windows PC that runs Velo Desktop.
2. In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) go to
   **Networks → Tunnels** and create a tunnel (or reuse one you already have).
3. Add a **Public Hostname** route:
   - **Hostname**: the domain baked into the apps' build config. Unless you customized it,
     that's `velo-server.cetrei.dev` (see `apps/web/.env.example`'s `VITE_SIGNALING_URL`).
   - **Service**: `HTTP` → `localhost:4001` (or whatever `network.signaling_port` is set to in
     `config/system.yml`).
4. Run the tunnel (`cloudflared tunnel run <name>`, or install it as a Windows service so it
   starts with the PC).
5. Keep `cloudflared` running whenever you want the phone to be able to pair or reconnect, in
   either connection mode.

### Option B: Let Velo Desktop manage it for you (opt-in, single PC only)

Desktop can download, update, spawn, and stop `cloudflared` itself so you never have to install
it or keep a separate window running. This only replaces *how the tunnel process starts*; it
still uses the same Cloudflare Zero Trust tunnel and Public Hostname route from steps 2–3 above,
which you still create once in the dashboard.

1. In **Settings → Connection mode**, set the mode to `cloudflare_relay`, paste your tunnel
   token (Zero Trust → Networks → Tunnels → your tunnel → Configure), and turn on
   **Let Velo Desktop run this tunnel for me**.
2. On first activation, Desktop downloads the latest `cloudflared-windows-amd64.exe` release
   straight from `cloudflare/cloudflared`'s GitHub Releases into its own writable app data
   directory, no admin rights or installer step required. It checks for a newer release on every
   app startup and whenever you save this setting again, downloading and swapping in updates
   automatically, since `cloudflared` does not self-update on Windows.
3. Desktop then runs `cloudflared tunnel run --token <your token>` automatically on launch and
   whenever you save this setting, and stops it when you quit the app or turn the toggle back
   off. The Connection mode panel shows the managed tunnel's running state and installed
   `cloudflared` version, with an **Update & restart** button to force a fresh check.
4. This only manages the tunnel *process*. You still need the Public Hostname route from Option
   A step 3 configured once in the Cloudflare dashboard — the token alone does not create that
   route.

This toggle defaults to off. If the toggle is off, Velo Desktop never downloads or touches
`cloudflared`, and Option A's manual flow is exactly what's still expected — nothing breaks by
skipping Option B entirely.

If you use a custom hostname instead of the defaults, keep these three in sync or CORS/pairing
will fail:

| What | Where it's set | Default |
| --- | --- | --- |
| Page origin the apps load from | `apps/web/capacitor.config.ts` `server.url`, `apps/desktop` `VELO_PAGES_URL` build env | `https://velo.cetrei.dev` |
| Signaling server the phone connects to | `apps/web/.env` `VITE_SIGNALING_URL` (build-time, baked into the APK and the web build) | `https://velo-server.cetrei.dev` |
| Origin the signaling server accepts requests from | `apps/server` `VELO_ALLOWED_ORIGIN` env var | `https://velo.cetrei.dev` |

The desktop app itself does not need any of this: it now talks to its own bundled backend
directly at `http://127.0.0.1:{signaling_port}`, without going through the tunnel.

## Verifying everything is wired correctly

The signaling server serves a small status page at `/status`. Use it to confirm the backend is
reachable from wherever you're checking:

- **On the PC itself, always available**: open `http://localhost:4001/status` (adjust the port
  if you changed `network.signaling_port`). This works whether or not the tunnel is configured,
  since the backend always runs locally first.
- **From the tunnel, once the Public Hostname route is set up**: open
  `https://velo-server.cetrei.dev/status` (or your custom hostname) from any device, including
  the phone's browser. If this doesn't load, the phone won't be able to pair either — go back to
  the tunnel setup above before troubleshooting anything else.

Both should show "Velo Signaling Server — Online" with the running version.

## Optional: TURN relay for restrictive networks

`stun_p2p` mode can fall back to a TURN relay when STUN alone can't establish a direct path.
Two independent ways to provide one:

- **Server-provisioned**: set `network.turn` in `config/system.yml` (realm/port/tls_port) and
  the `TURN_STATIC_AUTH_SECRET` env var on the machine running the signaling server. The server
  mints short-lived HMAC credentials per connection automatically; no static secret is ever sent
  to clients.
- **User-supplied**: enter your own TURN server's URL/username/credential under Settings →
  Connection mode → the TURN fields, when using `stun_p2p`.

If neither is configured, `stun_p2p` still works fine on most home networks, it just has no
fallback for symmetric NAT — switch to `cloudflare_relay` in that case.

## Troubleshooting

- **QR code / pairing fails on desktop**: confirm `http://localhost:4001/status` loads. If it
  doesn't, the bundled backend isn't running — check Settings → Updates → Backend.
- **Phone can't pair even though desktop's `/status` works locally**: confirm the tunnel's
  Public Hostname route is active and `https://<your hostname>/status` loads from the phone's
  own browser first, before trying to pair in the app.
- **Video never connects in `stun_p2p` mode**: check the dev diagnostics panel (Settings →
  Developer diagnostics) for ICE candidate types. If no `relay` candidate is ever gathered and
  both `host`/`srflx` fail, you need a TURN server (see above) or should switch to
  `cloudflare_relay`.
- **Managed tunnel toggle does nothing / "cloudflared has not been downloaded yet"**: Desktop
  downloads `cloudflared.exe` automatically the first time the toggle is turned on, so this is
  expected briefly on first activation. If it persists, check Desktop's logs for a
  `[TUNNEL_MANAGER]` fetch or download failure (usually a network or GitHub rate limit issue),
  and fall back to Option A (manual `cloudflared`) above in the meantime.
- **Connection mode settings don't appear, or show a note about the Desktop app**: this is
  expected on the phone. `config/user.yml` only exists on the machine running Velo Desktop, so
  connection mode, resolution, and FPS can only be changed there — open the same Settings screen
  on the desktop app instead.
