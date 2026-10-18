# TabBar

A floating pill at the bottom of the phone screen with five destinations: Explore, Play, Tours, Wildlife and You.

- **Each tab:** a 26px icon over a one-word label in `caption` weight 600.
- **The current tab** (`aria-current="page"`) sits on `surface-raised`, with its icon in `highlight-ink`.
- **Position:** 12px above the bottom safe area, side gutters `max(16px, safe-area)`. It hides while a sheet is open at full height.
- **Desktop:** the same destinations move into the top bar as text buttons.

**Provide:** a `nav` with `aria-label`, real buttons or links, and the current state.
