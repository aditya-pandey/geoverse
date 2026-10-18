# Bhoogol analytics (Google Analytics 4)

**Property:** `G-R0PQMW24PX`

**Where it lives:**
- The tag is at the top of `index.html`.
- Every event goes through `track()` in `app.js`.

## How the tag behaves

| Situation | What happens |
|---|---|
| Live site (bhoogol.netlify.app) | Tag loads; page view + all events below |
| `localhost` / `127.0.0.1` | Nothing is loaded or sent (local testing never pollutes the numbers) |
| `?notrack` in the URL | Nothing is sent for that visit |
| `?ga_debug` in the URL | Events show up live in GA → Admin → DebugView |
| About → "Don't count my visits" | Remembered on that device; nothing is sent from it again |
| Visitors in the EEA, UK, Switzerland | Consent mode: no analytics cookies; GA receives cookieless pings and models the numbers |
| Everyone | Ads signals off (`ad_storage`, `ad_user_data`, `ad_personalization` denied, Google signals off). Bhoogol has no ads |

## Events

Names in **bold** are GA4 recommended events, which GA's built-in reports understand.

| Event | When | Parameters |
|---|---|---|
| `page_view` | Each visit (automatic) | Standard |
| `app_ready` | The globe is ready to use | `load_ms`, `layout` (phone/desktop), `returning` |
| `mode_change` | Explore / Tours / Atlas / Earth / Arcade | `mode` |
| `view_country` | A country is opened (once per country in a row) | `country_code`, `country_name`, `region`, `mode` |
| `view_states` | "Show states" for a country | `country_code`, `country_name` |
| `panel_tab` | A tab in the country card | `tab`, `country_code` |
| `atlas_metric` | A data map is chosen | `metric` |
| `compare` | Two countries compared | `country_a`, `country_b` |
| `wildlife_3d` | A 3D animal or plant placed on the globe | `species`, `country_code` |
| **`search`** | A search result is picked | `search_term` |
| **`select_content`** | …and what was picked | `content_type` (search_country, search_river, …), `item_id` |
| `tour_begin` / `tour_complete` | Story tours | `tour_id` |
| **`level_start`** | An arcade game starts | `level_name`, `game`, `quiz_type`, `region`, `difficulty`, `challenge` |
| **`level_end`** | An arcade game finishes | `level_name`, `success`, `score`, `correct`, `rounds`, `best_streak`, `region`, `difficulty` |
| **`post_score`** | Its score | `score`, `level` |
| `level_quit` | Quit mid-game | `level_name`, `round` |
| **`share`** | App link, challenge link or scorecard shared | `method` (native/copy), `content_type` (app/challenge/scorecard), `item_id` |
| `welcome_shown` / `welcome_choice` | First-visit welcome card | `choice` (tour/play/explore) |
| **`tutorial_begin`** / **`tutorial_complete`** / `tutorial_skip` | The walkthrough | `tutorial`, `play_now`, `step` |
| `intro_skip` / `intro_replay` | The opening animation | (none) |
| `setting_change` | Sound, names, pins, terrain view | `setting`, `value` |
| `analytics_opt_out` | Someone turns counting off | (none) |
| **`exception`** | JavaScript error, lost 3D view, failed start-up | `description`, `fatal` |

## One-time setup in Google Analytics

These steps are for you to do in the GA admin, since they can't be done from code.

1. **Test the tag.** After deploying, open the property → **Test installation** with `https://bhoogol.netlify.app`. To watch events live, open the site with `?ga_debug` and go to **Admin → DebugView**.
2. **Keep data longer.** Go to **Admin → Data collection and modification → Data retention** and set **Event data retention** to **14 months**. The default of 2 months limits Explorations.
3. **Stop duplicate page views.** Go to **Admin → Data streams →** your web stream **→ Enhanced measurement**:
   - Open **Page views → Show advanced settings** and turn **off** "Page changes based on browser history events". The app updates its URL as you explore, which would otherwise count as dozens of page views; the events above already measure that properly.
   - Turn **off** Scrolls, Site search and Form interactions. The globe doesn't scroll, search is measured by the `search` event, and there are no forms.
   - Keep Outbound clicks and File downloads on.
4. **Register custom dimensions** so the parameters appear in reports. Go to **Admin → Custom definitions → Create custom dimension**, scope **Event**, and add:
   - `country_code`, `country_name`, `region`, `mode`, `tab`, `metric`, `tour_id`
   - `game`, `quiz_type`, `difficulty`, `level_name`, `challenge`
   - `choice`, `setting`, `value`, `layout`, `species`, `country_a`, `country_b`

   Then **Custom metrics**, unit Standard unless noted: `load_ms` (milliseconds), `correct`, `best_streak`.
5. **Mark key events.** Go to **Admin → Events** (or Key events) and mark `level_end`, `tour_complete`, `share` and `tutorial_complete` as **key events**.
6. **Leave Google signals off.** Under **Admin → Data collection**, it isn't needed and the code already turns it off.
7. **Optional: exclude yourself.** Go to **Admin → Data streams → Configure tag settings → Define internal traffic**, add your IP, then activate the "Internal traffic" filter in **Admin → Data filters**. Or simply use About → "Don't count my visits" on your own devices.
8. **Optional: the old address.** If GitHub Pages still serves aditya-pandey.github.io/geoverse, its visits count too. Either switch GitHub Pages off, or filter reports by **Hostname = bhoogol.netlify.app**.

## Useful reports to build (Explore)

- **Countries people open:** free form, `country_name` × event count of `view_country`.
- **Which games are played and finished:** `level_name` × `level_start` vs `level_end` counts, plus average `score`.
- **First-visit funnel:** `welcome_shown` → `welcome_choice` → `tutorial_begin` → `tutorial_complete` → `level_start`.
- **Health:** `exception` by `description`, and average `load_ms` split by `layout`.
