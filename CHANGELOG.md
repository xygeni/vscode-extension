# Xygeni Security Change Log


## [1.0.0]

- Initial release
- Configure and Run Xygeni Scanner in your workspace
- 
## [1.1.0]

- Extension homepage README and CHANGELOG minor changes

## [1.2.0]

- Auto-Fix Code Issues for SCA and SAST added


## [1.2.1]

- Fix scan executions on Windows

## [1.2.2]

- Fix remediation executions on Windows

## [1.2.3]

- Fix scanner compatibility with asdf CLI manager
- Remove deprecate install.sh usage

## [1.2.4]

- Update MCP Setup to use current XYGENI_TOKEN
- Allow download scanner CLI from non-production Xygeni API Url (e.g. on-premise environments)

## [1.2.5]

- Fix scanner CLI checksum validation (non on-premise)
- Display propagation path graph for issues

## [1.2.6]

- Add incremental scan on file save (Auto Scan on Save)
- Remove axios dependency and resolve scanner CLI Java home

## [1.2.7]

- Fix Save button action error in the configuration view

## [1.2.8]

- Fix AI Explain CLI parsing and license gating
- Auto Scan on Save now requires a non-Free license; on the Free plan it is shown disabled with a link to upgrade

## [1.2.9]

- Fix Free license handling

## [1.2.10]

- Add Code Quality scan (xygeni/xygeni-product-backlog#56)
- Add API Security scan (xygeni/xygeni-product-backlog#1691)
- Add AI Security scan (xygeni/xygeni-product-backlog#1692)
- AI Security findings can be fixed with the Xygeni Agent (FIX IT tab, scanner `util rectify --ai`) (xygeni/xygeni-product-backlog#1692)
- API Security findings are listed by flaw type, like the other categories; the full title is shown in the details panel (xygeni/xygeni-product-backlog#1691)
- API Security findings now point to the endpoint handler file and line (or the module's OpenAPI spec), so they open in the editor and appear in Problems (xygeni/eclipse-plugin#22, xygeni/visual-studio-extension#15)
- Auto Scan on Save no longer discards the findings of the scan types it does not run (Dependency Analysis, Misconfigurations, Code Quality, API Security, AI Security) (xygeni/eclipse-plugin#22, xygeni/visual-studio-extension#15)
- Escape scanner-provided text (titles, endpoint paths, module names, explanations) in the issue details panel (xygeni/eclipse-plugin#22, xygeni/visual-studio-extension#15)
- A scan that only skipped an unlicensed scan type (or that found issues) is now reported as completed instead of failed (xygeni/eclipse-plugin#22, xygeni/visual-studio-extension#15)
- Scanner global options (xygeni/tech-support#378): Skip SSL Verification (`--skip-ssl-verify`, for corporate proxies that inspect TLS traffic), Skip Scanner Update and Verbose Scanner Output checkboxes plus an Additional Global Options field in the Scan Settings. Skip SSL Verification can be toggled from the Configuration view, where the other options also show while they are on; a scan that fails on the SSL certificate offers to enable it
- Gear icon in the Configuration view to open the Xygeni settings


## [1.2.11]

- Scanner options (#415): a command-line-like input in Scan configuration adds `xygeni scan` options with
  autocompletion and validation (a closed list: include patterns, detectors, mute, standard, AI review,
  license analysis, custom configuration); the options the plugin sets itself (`--run`, `-o`, excludes…) are refused.
  Saved as `options` in `.xygeni/ide.json` and validated again when the file is read.
- `.xygeni/ide.json` is treated as input from the repository (xygeni/xygeni-product-backlog#415): an option or exclude with a quote or a control character is refused (on Windows it could add scanner options of its own), `--conf`, `--custom-detectors-dir` and `--mute` take a path inside the project (or `--mute=#profile`), the file is never written through a symbolic link, a save keeps the keys another plugin added, and "Restore defaults" rewrites the file instead of deleting it.
- Run one scan type alone: a play button in the title of each results view (SAST, SCA, Secrets…) runs just that scan
  and refreshes only its findings.
- Configuration view: more room between rows and blocks.
- Security (xygeni/xygeni-product-backlog#1438): a server URL that uses `http://` to a host other than localhost is refused,
  with the reason in the connection error, because the API token would travel in clear on every request. `http://localhost`
  stays allowed (the traffic never leaves the machine). The new setting `xygeni.api.allowInsecureHttp` lets a server without
  TLS through on purpose; the connection status then keeps warning "insecure http: token in clear". The HTTP client refuses
  such URLs too, so no request path can send the token in clear by accident.
- Security (xygeni/xygeni-product-backlog#2628, CWE-77): JAVA_HOME is read from the login shell with an argument array
  instead of a command string built from `$SHELL`, and only an absolute, existing `$SHELL` is used. The scanner itself was
  already spawned shell-free with an argument array; a test now pins that a workspace path with shell metacharacters
  reaches it as one untouched argument. A failure while preparing the scanner environment no longer leaves the scan
  hanging as "running".
- A 503 from the backend's `/ping` no longer marks the URL as invalid: the endpoint answers 503 while the server's CPU is above its threshold, so the extension goes on with the token check instead of asking for a reconnect. When that token check itself gets a 5xx or no answer, the status says the server is unavailable and to retry, instead of "invalid token". The startup check also retries up to three times on other 5xx or a refused connection, and the Configuration view shows "Connecting…" meanwhile instead of "Disconnected"
- The Configuration section of the Xygeni sidebar is now a single panel with three blocks: Connection (URL, token, scanner and licence status, Auto Scan on Save, scanner options, MCP server), Scan (Run scan, findings per category and the last scans; it replaces the Scan section) and Scan configuration (xygeni/xygeni-product-backlog#415)
- Scan configuration per project (xygeni/xygeni-product-backlog#415): the Scan configuration block chooses which scan types the full scan runs (one checkbox per scanner; SCA brings suspect dependencies) and which of the file-scoped ones (Secrets, SAST, IaC, Malware, Code Quality) also run on save, and which folders or glob patterns are excluded from every scan (passed as `--exclude-add`, so the scanner's default excludes are kept; needs scanner 6.23 or later). Saved in `.xygeni/ide.json` at the workspace root, shared with the other Xygeni IDE plugins and meant to be committed; the defaults (every scan type, Secrets / SAST / IaC / Malware on save, nothing excluded) write nothing. A full scan now shows only the findings of the scan types it ran
- MCP server updates (xygeni/xygeni-product-backlog#2382): once a day, after the connection is validated, the extension reads the published MCP server version and, according to the new `xygeni.mcp.updates` setting, notifies with Update / Ignore this version actions (default), updates in the background, or does nothing. The command `Xygeni: Check for MCP Server Updates` checks now. The check is shared with the other Xygeni IDE plugins through `~/.xygeni/mcp/last-check.txt`; when the published version cannot be read (no network, not published yet) nothing is shown, it is only logged
- MCP server updates (xygeni/xygeni-product-backlog#2382): after an update the extension says what to do in plain words (restart your
  AI assistant so it uses the new version), with a "Show me how" guide per assistant (Copilot, Claude Code, Cursor, Claude Desktop) and
  a note in the Configuration view that stays until dismissed; the status no longer keeps saying "available" for the version just
  installed; at startup the MCP server shows "Installed" from the JAR on disk, or "Checking…" while the connection check runs,
  instead of "Not installed yet". The MCP Setup guide gains the Java prerequisite, where the configuration goes for each
  assistant (`servers` vs `mcpServers`), a check-that-it-works step and troubleshooting.
- The installed MCP server version is written to `~/.xygeni/mcp/version.txt` and shown with the path and the update status in the MCP Server Setup guide (xygeni/xygeni-product-backlog#2382)
- The MCP server download is verified against the published SHA-256 checksum; a mismatch, or an update whose checksum cannot be read, keeps the JAR already installed. Until the checksum is published, a first install goes ahead with a visible warning. An update that cannot replace a JAR locked by a running MCP client (Windows) is kept as `.pending` and applied the next time VS Code starts (xygeni/xygeni-product-backlog#2382)
- The MCP server is installed in `~/.xygeni/mcp/xygeni-mcp-server.jar`, shared with the other Xygeni IDE plugins, so its path no longer changes when the extension is updated. An existing copy inside the extension folder is moved there and a notification asks to update the path in the MCP client configuration (xygeni/xygeni-product-backlog#2382)
- The MCP server is downloaded when it is missing even if the scanner is already installed; before, it was reported as installed without checking the file (xygeni/xygeni-product-backlog#2382)
- New "Malware" view listing the malware evidences of the scan (kind, detector, severity, explanation, scan type, location, resolved code and tags, plus the CODE FLOW tab with graph, path and AI explain for the evidences that carry code flows), which were already scanned but never shown (xygeni/xygeni-product-backlog#1473)
- The CODE FLOW tab no longer breaks when the scanned code of a step contains `</script>` or `$` replacement patterns: the flow data is written script-safe and inserted as is
