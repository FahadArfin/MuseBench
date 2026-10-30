# Context history

In a Muse Code chat, choose **Context** above the composer when a native usage reading is available, or **Context history** when only compactions have been observed. Both open Session details. Session also remains available from the composer's add menu.

The context reading is Muse's last reported occupancy floor: counted-once prompt tokens plus the driving record's output tokens. It is not exact current occupancy or billing usage. A percentage and meter appear only when Muse supplies its effective window size. Missing limits remain unknown; lower readings after compaction are valid. Readings above the reported window keep their actual percentage while the visual fill stops at 100%.

The chip marks saved readings. Session details show whether the owning connection still reports that fact, whether it came from an event or restored snapshot, the local observation time and native pressure. Reconnecting without a fresh native reading does not make saved data current. No background polling or model request is needed.

The history retains up to 30 native observations per chat, including automatic and manual compaction. Expand a row for its session/turn identity, revision, observed token counts and optional opaque boundary. Restored observations are labeled; records from previous sessions remain distinguishable. The timestamp is when MuseBench first observed the item, not an invented provider completion time.

Compaction token snapshots describe a past compaction. They are separate from the reported context reading and do not promise exactly which messages Muse retained. Missing measurements stay unknown. Local transcript and files remain unchanged. Starting or accepting a manual compaction request is distinct from observing its completion; the existing Compact context control retains its connection and idle guards.

Interrupted observations become unknown when the connection ends or the app restarts. A later higher native revision can reconcile them. MuseBench does not replay uncertain requests. Observations are attached to the emitting chat even while another chat is selected, and duplicate/stale revisions do not replace newer evidence.

Deleting a chat closes its idle connection; a new chat receives separate observation ownership. Restart reconciles the saved chat and selection snapshots by native revision, preserving a completion that was saved before an interrupted write.

No background summarization, automatic compaction request, retention tuning or model warming is introduced. Those require native support and separately authorized model acceptance. Browser preview uses labeled sample data. Actual native compaction depends on the supported Muse connection.
