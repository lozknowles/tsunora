# Upgrade Agent Control 4.7.0 to 4.7.1

1. Record the current version, launch method and all configured state locations. Stop only the intended installation through its established procedure.
2. Preserve a consistent backup of configuration and state, including external state directories. Keep credential files private.
3. Clone `v4.7.1` into a clean sibling directory; never pull over a dirty installation. Run the documented bootstrap with the existing supported Node.js runtime.
4. Point the new instance to the preserved configuration/state and start on loopback using the existing operator authentication.
5. Verify the version, text operation, a harmless governed observation, Process Map, Usage and retained job history before changing any operational exposure.
6. Keep the previous checkout and backup until verification completes.

No core state-schema migration is required by this update. GPT-Live is optional and experimental; an absent provider credential leaves normal text and jobs usable. See [Mallow voice](mallow-voice.md) for explicit transport selection and server-side credential references. Do not expose the provider key in the browser or request a new account merely to install 4.7.

For rollback, stop 4.7, preserve its logs and evidence, and restart the saved previous checkout against the pre-upgrade backup. Do not erase the new history or overwrite the old backup. Release publication does not deploy to your estate automatically.

The release qualification performs clean Linux installation and an isolated upgrade from the exact formal v4.7.0 source. It does not imply a new Windows, macOS or Android installation qualification.
