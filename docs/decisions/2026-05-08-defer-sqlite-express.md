# Defer SQLite via Express

Date: 2026-05-08

Express was present as a dependency, but the application does not currently import or require it. The active storage path is the browser localStorage/entity layer, and there is no Node, tsx, or Express server entry wired through package scripts.

We are deferring a SQLite-via-Express backend until the localStorage/entity layer reaches clear limits, such as data scale, multi-device synchronization, or reporting needs that are awkward to handle client-side.

Revisit this decision when those needs become concrete enough to justify adding a server boundary and database adapter.
