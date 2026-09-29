## Selected API

- Endpoint: `https://api2.realtor.ca/Listing.svc/AsyncPropertySearch_Post`
- Method: `POST`
- Body: `application/x-www-form-urlencoded`
- Auth: none, but the endpoint sits behind a Cloudflare bot check that is bound to the client session
- Pagination: `CurrentPage`, `RecordsPerPage` (max 100), `MaximumResults`. `Paging` reports `TotalPages`; Realtor.ca caps a single search area at `MaxRecords: 600`
- Input source: Realtor.ca map URL hash parameters or actor filters
- Selected implementation: a stealth Chrome browser session that replays the same internal search request with an in-page `fetch`

## Candidate Matrix

| Candidate                                                                                | Profile                                                                      |                                                            Status/body |                                 Fields | Pagination     | Decision                                                          |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------: | -------------------------------------: | -------------- | ----------------------------------------------------------------- |
| `AsyncPropertySearch_Post` via in-page `fetch` from a real Chrome session                | Chrome headful, no injected headers, content type only                       |                  HTTP 200 JSON (`Results[10]`, `Paging.TotalPages=60`) |  40+ listing fields plus pins/grouping | `CurrentPage`  | Selected                                                          |
| `AsyncPropertySearch_Post` via `impit`                                                   | `chrome`, `firefox`, `okhttp5`, `chrome110` to `chrome151`, HTTP/3           |   HTTP 403 Cloudflare "Sorry, you have been blocked" for every variant |                                   none | n/a            | Rejected: TLS/header impersonation is not enough                  |
| `AsyncPropertySearch_Post` via `impit`                                                   | `ios18`                                                                      |                    TLS handshake failure (`AlertReceived DecodeError`) |                                   none | n/a            | Rejected: broken handshake for this target                        |
| `AsyncPropertySearch_Post` via `context.request` (browser cookie jar, Node fingerprints) | Chrome context request with explicit `origin`, `referer`, `x-requested-with` |          HTTP 403 block page, even after the page itself had clearance |                                   none | n/a            | Rejected                                                          |
| `AsyncPropertySearch_Post` via in-page `fetch` with `x-requested-with`                   | Chrome page context                                                          |         Browser `TypeError: Failed to fetch` (CORS preflight rejected) |                                   none | n/a            | Rejected: custom header forces a preflight the API does not allow |
| `AsyncPropertySearch_Post` from a headless Chromium session                              | Patchright bundled Chromium, headless                                        |                       Cloudflare block page on the map document itself |                                   none | n/a            | Rejected for the primary path                                     |
| `PropertySearch_Post` (legacy)                                                           | Browser-like POST with session cookies                                       |                                                               HTTP 403 |                           40+ expected | `CurrentPage`  | Rejected: legacy endpoint is blocked for direct clients           |
| `PropertyDetails` via in-page GET                                                        | Chrome page context, plain GET, no custom headers                            |                                                    HTTP 200 JSON array | 37-50 photos plus rooms, taxes, zoning | n/a            | Selected for the gallery and detail fields                        |
| Homepage or map page HTML parsing                                                        | Chrome and non-browser clients                                               | JavaScript rendered, and no `__NEXT_DATA__` or JSON-LD listing payload |                           fewer fields | browser-driven | Rejected                                                          |
| Mobile app probing                                                                       | `ios18`, `okhttp` variants against the same host                             |     No separate app endpoint found; only the shared `/Listing.svc` API |                            same as web | `CurrentPage`  | Rejected: no evidence of an app-only API                          |

## Request flow that works

1. Launch a real Chrome profile (`channel: 'chrome'`) in headful mode through a persistent context. Headful is required: headless Chromium was blocked, and all pure HTTP clients were blocked.
2. Open the Realtor.ca map URL so the session obtains Cloudflare clearance and the site's own search request runs.
3. Dismiss the cookie and terms banner.
4. Replay `AsyncPropertySearch_Post` with `fetch` inside the page context, sending only `content-type`, with `credentials: 'include'`.
5. Validate that the response is JSON and contains `Results`, then page through `CurrentPage` up to `results_wanted` and `max_pages`.
6. When `include_details` is enabled, request `PropertyDetails` for each saved listing from inside the same page context (bounded concurrency of 4) and merge the richer record.

## Detail record and image galleries

The search payload returns exactly one photo per listing. Measured on a page of 20 Toronto listings, every listing returned a single `Property.Photo` entry, while the detail record for the same listings returned 37 to 50 photos. The full gallery therefore requires the detail record; it cannot be produced from the search response alone.

| Request                    | Method             |   Result |            Photos | Extra fields                                                                                                                                      |
| -------------------------- | ------------------ | -------: | ----------------: | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AsyncPropertySearch_Post` | POST, form encoded | HTTP 200 |     1 per listing | price, address, building, land, individual, office                                                                                                |
| `PropertyDetails`          | GET, in-page       | HTTP 200 | 37-50 per listing | `BasementType`, `ArchitecturalStyle`, `ConstructedDate`, `HalfBathTotal`, `Features`, `Room`, `TransactionType`, `TaxAmount`, `ZoningDescription` |

The detail request is a plain GET issued from the page context. No custom headers are added, so no CORS preflight is triggered and no detail page HTML is rendered. Query parameters are `ApplicationId=1`, `CultureId=1`, `PropertyID`, `ReferenceNumber`, `PreferedMeasurementUnit=1`, and `HashCode=0`.

Photos are sorted by `SequenceId` before being written to `photo_urls`, which keeps the gallery in published order.

## Notes

- The endpoint is cross-origin relative to `www.realtor.ca`. Adding `x-requested-with` or any other custom header triggers a CORS preflight that the API rejects, which surfaces as `Failed to fetch`. Sending only `content-type` keeps the request simple and returns HTTP 200.
- `context.request` shares the browser cookie jar but keeps Node HTTP fingerprints, so Cloudflare blocks it even when the page session has clearance. Only requests issued from inside the page work.
- Request parameters: `ApplicationId=1`, `CultureId=1`, `Version=7.0`, `IncludeHiddenListings=false`, map bounds, and the form-encoded filters.
- Response shape: `Results[]` with `Id`, `MlsNumber`, `Property` (price, type, address, photo), `Building`, `Land`, `Business`, `Individual`, `Office`, `AlternateURL`, `RelativeDetailsURL`, `PublicRemarks`, and `Paging`.
- `Property.Photo` can be a single object or an array. Search results carry one photo, while the detail record carries the full gallery as an array of absolute `cdn.realtor.ca` URLs ordered by `SequenceId`.
- `InsertedDateUTC` is .NET ticks, not an ISO string, and is converted to ISO during mapping.
- Some numeric fields arrive as strings, such as `PriceUnformattedValue` and address coordinates, and are normalized to numbers.
- `Address.AddressText` joins the street and city lines with a pipe character, which is normalized into a comma separated address plus a separate `street_address`.
- Search-only records are enough for price, address, coordinates, photos (first image only), and MLS data. Detail records are required for the complete gallery and for fields such as features, architectural style, basement type, construction year, and transaction type. One detail request per saved listing keeps the cost proportional to `results_wanted`, and a failed detail request falls back to the search record instead of failing the run.
- Realtor.ca map URLs are preferred for coverage because they contain exact bounding-box filters. Keyword and location inputs are supported, and they take precedence over the URL when supplied.
