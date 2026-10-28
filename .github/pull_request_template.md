## Change and linked work

Describe the concrete trigger and resulting behavior. Link the work ticket(s),
and distinguish this PR's completed slice from release-wide acceptance.

## Validation evidence

Record commit/build, command/check, fixture/environment and result. Explain any
failure or skip; do not substitute a deployment status for test execution.

| Check | Evidence/result |
| --- | --- |
| TypeScript, lint, mobile deterministic tests | |
| Mandatory native C++ regression suite | |
| Server/shared contracts and generated-document drift | |
| Real isolated PostgreSQL integration (zero skipped DB gates) | |
| Web lint/type/unit/production build and public browser smoke | |
| Documentation/link checks | |

Mark a check not applicable only with a reason tied to this change; maintain
required CI gates. Test/trace artifacts use synthetic data and exclude real
credentials, accounts, routes, messages and audio.

## Remaining acceptance gates

- [ ] Documentation/API/env changes describe the implemented behavior and limitations.
- [ ] Existing personal SQLite data, Local operation and retained provider data remain protected.
- [ ] Native builds, physical iOS/Android/background/permission checks are recorded or explicitly pending.
- [ ] Two-device connected journeys, optional-provider faults and container/stage/prod evidence are recorded or explicitly pending.
- [ ] Parent tickets stay open wherever their full acceptance still lacks evidence.

List the concrete remaining gates and links. Browser emulation, schemas and
unit fixtures do not establish native-device or production-service acceptance.
