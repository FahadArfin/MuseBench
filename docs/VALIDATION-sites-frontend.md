# Sites frontend-only validation

The local Sites interface is ready without a hosting account. Share and Publish open a saved local setup; Publish to web is disabled. No live publication, domain registration, analytics, visitor login or access enforcement is claimed.

- 83 Sites tests passed: [output](../artifacts/sites-frontend-tests.txt).
- Eight packaged UI checks passed with zero hosting/model requests and no renderer errors: [report and screenshots](../artifacts/sites-frontend-ui/packaged-ogfaws/report.json).
- Eighteen existing app navigation checks passed: [report](../artifacts/redesign-ui/source-n6ou2f/report.json).
- Exact packaged content matches 57 source/build files plus both native helpers: [verification](../artifacts/sites-frontend-package-verification.json).
- Build and Windows packaging passed; the existing Vite large-bundle advisory remains.

Review caught a transition that discarded unsaved setup while creating the first version. It now saves validated local preferences before moving to the version dialog and returns to sharing after either save or cancel. An Electron regression covers preservation, and an independent final review verified both paths.

Thirty-six backend/controller/runtime/Electron files match the previous release, including personal login integration and sandbox runtime. Saved account profiles and hosting credentials were not changed. Test runs used isolated profiles. The normal app was reopened after packaging.

Frontend setup is stored per site in the desktop profile; it is not an active hosting policy. Existing published URLs or permissions are unaffected. Future backend work must validate and enforce supported sharing options before deployment is enabled.
