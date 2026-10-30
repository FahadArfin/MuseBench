# Windows build speed implementation

Execute inline with one independent whole-change review; existing authorization covers testing, main integration, GitHub publication and verified desktop update.

1. Preserve the current workflows as a required-check inventory in regression tests. Add RED assertions for shared validation, parallel packaging, fail-closed release gates and subprocess/timing behavior.
2. Implement six allowlisted validation groups and a fail-fast runner with timing receipts. Add the reusable workflow, call it from release and branch/PR validation, and remove duplicate serial checks from packaging.
3. Run focused and full unit tests, production build, and representative real group execution; inspect the workflow with a GitHub Actions linter. Independently review the complete patch and fix material findings with regression evidence.
4. Recheck main, integrate and push the finished change. Verify all checks on the exact pushed source, compare actual timing, and record any runner queueing or failures honestly.
5. Verify the published installer hashes, recheck app idleness and preserve its entire profile, then install/reopen and verify the installed version through native MCP. Preserve receipts and the separate import work.
