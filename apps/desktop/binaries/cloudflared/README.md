Cloudflared Binary (Managed Tunnel Mode)

This binary is no longer vendored by hand. apps/desktop/src/tunnel_manager.rs
downloads cloudflared.exe automatically from cloudflare/cloudflared's GitHub
Releases (the cloudflared-windows-amd64.exe asset) the first time
connection.cloudflare_relay.managed is turned on in Settings, and checks for
newer releases on every app startup and whenever the connection setting is
saved again.

The binary is stored in the app's writable data directory alongside the
managed backend binary, not next to the installed Velo Desktop executable,
so no admin permissions or installer step are needed to update it. See
apps/desktop/src/tunnel_manager.rs for the exact resolution logic
(resolve_writable_tunnel_path).

Nothing needs to be placed in this directory manually. If you were following
older instructions to manually download and copy a cloudflared.exe here,
that step has been superseded; see _deprecaated/cloudflared-vendoring-README.md
for the previous approach this replaced.

Manual fallback remains available regardless: managed mode is opt-in and
defaults to off (connection.cloudflare_relay.managed defaults to false).
Users who prefer to run cloudflared themselves should follow the "One-time
setup: Cloudflare Tunnel" section in the root README.md instead.
