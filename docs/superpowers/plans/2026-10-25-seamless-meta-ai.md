# Seamless Meta AI integration

User intent: keep Muse Code, improve the signed-in Meta AI experience and use official Facebook/WhatsApp account flows. Implementation proceeds within the requested scope.

## Design

Keep Electron/React and the existing persistent sessions. A full native consumer Muse client is not backed by a documented public chat/Ideas/Goals API in the consulted official materials. The official gadget SDK targets paired devices and does not supply that complete application API. Instead, integrate the existing official application more carefully: remove duplicated Muse navigation with an optional presentation adapter, expose its real navigation/settings controls, retain each section, synchronize section selection, and support bounded official sign-in popups. No credential extraction, private API calls, token migration, or fake login buttons.

The compact adapter only recognizes observed data attributes on muse.ai. It changes layout and invokes finite user-requested navigation controls; it never reads messages, credentials, account details, QR codes, or storage. The original page layout is always recoverable. WhatsApp opens Muse's official Messaging channels settings and the user completes pairing there. Meta/Facebook sign-in stays on Meta's official pages.

## Tasks

- [x] Browser lifecycle: retain per-section views in the existing service partitions; synchronize recognized routes without switching active views; nonfatal secondary-action notices; constrained same-session official popups; preserve native close regression protection.
- [x] Presentation adapter: origin-scoped compact CSS, explicit restore, finite observed navigation/settings actions and graceful fallback; no adapter on authentication origins.
- [x] Local interface: one compact header, native Muse shortcuts and account/connections panel, remove permanent Website sign-in status, show authenticating only on observed auth origins, native view hidden under local overlays.
- [x] Verification: unit cases for retention/routes/redaction/popup policy, integration fixtures for compact layout and settings actions, source and packaged smoke, inspect real signed-in presentation where accessible, byte-verify package and reopen the normal profile.

Additional repairs: startup teardown no longer reports a canceled local document load as a startup failure; genuine failures remain reported. The official settings shortcut now tolerates delayed hydration and replaced controls. Compact CSS restoration was verified on the real Muse page. Exact results are recorded in docs/VALIDATION.md.

## Interfaces

Additional PersonalState fields: compact:boolean, notice:string|null, authenticating:boolean, authWindowOpen:boolean.
Additional commands: {type:'presentation',compact:boolean}, {type:'serviceAction',action:'search'|'feed'|'library'|'settings'|'connections'|'whatsapp'}, {type:'dismissNotice'}.
Presentation module: applyPersonalPresentation(contents,compact) and runPersonalAction(contents,action), imported by browser controller. Actions return boolean and never return page data.

## Review focus

Preserve user drafts on section changes; ignore hidden-view navigation when selecting a section; reject malicious popup redirects and URL credentials; close with an owned popup safely; restore website controls when adapter selectors no longer match.
