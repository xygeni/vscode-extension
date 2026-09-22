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
- Add Code Quality scan (xygeni/xygeni-product-backlog#56)

## [1.2.10]

- Add API Security scan (xygeni/xygeni-product-backlog#1691)
- Add AI Security scan (xygeni/xygeni-product-backlog#1692)
- AI Security findings can be fixed with the Xygeni Agent (FIX IT tab, scanner `util rectify --ai`) (xygeni/xygeni-product-backlog#1692)
- API Security findings are listed by flaw type, like the other categories; the full title is shown in the details panel (xygeni/xygeni-product-backlog#1691)
- API Security findings now point to the endpoint handler file and line (or the module's OpenAPI spec), so they open in the editor and appear in Problems (xygeni/eclipse-plugin#22, xygeni/visual-studio-extension#15)
- Auto Scan on Save no longer discards the findings of the scan types it does not run (Dependency Analysis, Misconfigurations, Code Quality, API Security, AI Security) (xygeni/eclipse-plugin#22, xygeni/visual-studio-extension#15)
- Escape scanner-provided text (titles, endpoint paths, module names, explanations) in the issue details panel (xygeni/eclipse-plugin#22, xygeni/visual-studio-extension#15)
- A scan that only skipped an unlicensed scan type (or that found issues) is now reported as completed instead of failed (xygeni/eclipse-plugin#22, xygeni/visual-studio-extension#15)
