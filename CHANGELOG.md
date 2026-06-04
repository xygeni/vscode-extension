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