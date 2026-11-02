---
section: Fixed
---
- The V-3 source scan refuses a credential written through an aliased state object (`const st = context.workspaceState; st.update(k, refreshToken)`): the state rule now reads any `.update(...)` call's arguments, whatever the receiver.
