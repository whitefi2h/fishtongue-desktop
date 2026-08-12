# FishTongue Analysis Sidecar

Short-lived, offline PanPhon adapter. It reads NDJSON requests from stdin and writes one matching response to stdout. It never opens a port, reads a project file, or connects to the network.

Build the Windows onedir artifact with `pyinstaller --clean analysis_sidecar.spec`. The release process must preserve PanPhon and Python license files beside the artifact.
