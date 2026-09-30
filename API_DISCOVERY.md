## Selected API

- Endpoint: `https://api2.realtor.ca/Listing.svc/AsyncPropertySearch_Post`
- Method: `POST`
- Body: `application/x-www-form-urlencoded`
- Auth: none, but the endpoint sits behind a Cloudflare bot check that is bound to the client session
- Pagination: `CurrentPage`, `RecordsPerPage` (max 100), `MaximumResults`. `Paging` reports `TotalPages`; Realtor.ca caps a single search area at `MaxRecords: 600`
- Input source: Realtor.ca map URL hash parameters or actor filters
- Selected implementation: a Chrome browser session for bootstrap, then a reusable Impit client for search and photo requests; bounded in-page `fetch` is the fallback

## Candidate Matrix

| Candidate                                                                                 | Profile                                                                                |                                                            Status/body |                                 Fields | Pagination     | Decision                                                                        |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------: | -------------------------------------: | -------------- | ------------------------------------------------------------------------------- |
| `AsyncPropertySearch_Post` via in-page `fetch` from a real Chrome session                 | Chrome headful, no injected headers, content type only                                 |                  HTTP 200 JSON (`Results[10]`, `Paging.TotalPages=60`) |  40+ listing fields plus pins/grouping | `CurrentPage`  | Bootstrap and fallback path                                                     |
| `AsyncPropertySearch_Post` via `impit` with the browser cookies, `chrome151`, matching UA | Direct client, same cookies, user agent, and proxy session                             |                                                HTTP 200 JSON, 1.1-2.5s |                          same as above | `CurrentPage`  | Selected as the fast path                                                       |
| `AsyncPropertySearch_Post` via `impit`                                                    | `chrome`, `firefox`, `okhttp5`, `chrome110` to `chrome151`, HTTP/3, no session cookies |   HTTP 403 Cloudflare "Sorry, you have been blocked" for every variant |                                   none | n/a            | Rejected without cookies; the generic `chrome` profile also failed with cookies |
| `AsyncPropertySearch_Post` via `impit`                                                    | `ios18`                                                                                |                    TLS handshake failure (`AlertReceived DecodeError`) |                                   none | n/a            | Rejected: broken handshake for this target                                      |
| `AsyncPropertySearch_Post` via `context.request` (browser cookie jar, Node fingerprints)  | Chrome context request with explicit `origin`, `referer`, `x-requested-with`           |          HTTP 403 block page, even after the page itself had clearance |                                   none | n/a            | Rejected                                                                        |
| `AsyncPropertySearch_Post` via in-page `fetch` with `x-requested-with`                    | Chrome page context                                                                    |         Browser `TypeError: Failed to fetch` (CORS preflight rejected) |                                   none | n/a            | Rejected: custom header forces a preflight the API does not allow               |
| `AsyncPropertySearch_Post` from a headless Chromium session                               | Patchright bundled Chromium, headless                                                  |                       Cloudflare block page on the map document itself |                                   none | n/a            | Rejected for the primary path                                                   |
| `PropertySearch_Post` (legacy)                                                            | Browser-like POST with session cookies                                                 |                                                               HTTP 403 |                           40+ expected | `CurrentPage`  | Rejected: legacy endpoint is blocked for direct clients                         |
| `PropertyDetails` via GET                                                                 | Chrome page context or direct client, plain GET, no custom headers                     |                                                    HTTP 200 JSON array | 37-50 photos plus rooms, taxes, zoning | n/a            | Rejected: rate limited per session and one request per listing                  |
| Homepage or map page HTML parsing                                                         | Chrome and non-browser clients                                                         | JavaScript rendered, and no `__NEXT_DATA__` or JSON-LD listing payload |                           fewer fields | browser-driven | Rejected                                                                        |
| Mobile app probing                                                                        | `ios18`, `okhttp` variants against the same host                                       |     No separate app endpoint found; only the shared `/Listing.svc` API |                            same as web | `CurrentPage`  | Rejected: no evidence of an app-only API                                        |

## Verified search filters

Every filter below was verified against the live API by comparing `Paging.TotalRecords` with and without the parameter, on a Toronto map area that reports 14,753 matching records:

| Filter            | Parameter              | Unit / format                          | Measured effect               |
| ----------------- | ---------------------- | -------------------------------------- | ----------------------------- |
| Minimum bedrooms  | `BedRange`             | `N-0` for "N or more"                  | 5+ bedrooms: 14,753 -> 2,946  |
| Minimum bathrooms | `BathRange`            | `N-0` for "N or more"                  | 4+ bathrooms: 14,753 -> 3,137 |
| Minimum storeys   | `StoreyRange`          | `N-0` for "N or more"                  | 3+ storeys: 14,753 -> 1,043   |
| Price             | `PriceMin`, `PriceMax` | Canadian dollars, separate parameters  | max 500,000: 14,753 -> 2,640  |
| Interior size     | `BuildingSizeRange`    | square feet, `min-max`, 0 for open end | 2,000-3,000 sqft: 14,753 -> 6 |
| Land size         | `LandSizeRange`        | acres, `min-max`, 0 for open end       | 1-2 acres: 14,753 -> 115      |

Notes:

- `BuildingSizeRange` only matches listings that publish an exact square footage. Listings that publish a bucket such as `1100+ sqft` are not matched, so interior size filters return far fewer results than price or bedroom filters. That is a source limitation, not an actor limit.
- The API returns interior size in the unit each listing publishes, for example `102.1925 m2` or `2024 sqft`. The value is passed through unchanged.
- Parameter names found in the site's own scripts that do **not** work: `BuildingSizeRangeID`, `LotSizeRange`, `LandAreaRange`, `SizeRange`. Unknown parameters are ignored, and rapid unknown-parameter probing triggers the bot check.
- `Keywords` is not exposed as an input. It still works when it appears in a Realtor.ca URL, because URL parameters are read from the map URL hash.

## Maximum data without detail records

The search response is the only source the actor needs. Each listing arrives with 25 top level fields, and the following are mapped as well:

- `Property`: price, unformatted price, price change date, type, ownership, parking, amenities, address, coordinates, and the first photo.
- `Building`: bedrooms, bathrooms, half bathrooms, interior size, storeys, building type, amenities, and, when published, architectural style, basement type, and construction year.
- `Land`: total size and frontage.
- `Individual`: agent names, positions, phones, emails, websites, organizations, and agent photo.
- `Media`: video tours, brochures, and other media links.
- `Tags`, `StatusId`, `Pins`, and `GroupingLevel` are intentionally not mapped: tags are relative time labels, pins carry no property data, and status ids have undocumented meanings.

The full gallery is resolved from the public image service by probing the photo sequence, so no per-listing detail request is needed at all.

## Request flow that works

1. Launch a real Chrome profile (`channel: 'chrome'`) in headful mode through a persistent context. Headful is required: headless Chromium was blocked, and non-browser clients without a session were blocked.
2. Open the Realtor.ca map URL so the session obtains bot-check cookies and the site's own search request warms the API path.
3. Wait only for document commit, then poll for bot-check clearance (capped at 10 seconds). Do not wait for deferred map scripts to finish before handing off to HTTP. Dismiss the cookie and terms banner with a short, non-blocking check.
4. Copy the browser cookies and the browser user agent into a direct HTTP client (`impit`, profile chosen by browser version). The proxy session stays the same, so the exit IP matches the cleared session.
5. Send all search and photo requests through that client. The browser remains available but is used for search only when a direct request fails.
6. If a direct search fails, try the same request in-page immediately, with a 30-second abort timeout covering both fetch and body reading. A successful fallback copies the refreshed browser cookies back to Impit for the next page. If both paths fail, reload and recapture the session before the bounded retry.
7. Validate that each response is JSON, contains `Results`, and reports a match count. An empty list without a match count is treated as throttled, not as the end of the results.
8. Page through `CurrentPage` up to `results_wanted` and `max_pages`, requesting 100 records per page.
9. Complete each saved record with its gallery by probing the image service, and never request a per-listing detail record.

## Fast path measurements

| Request          | Client        |              Typical latency measured |
| ---------------- | ------------- | ------------------------------------: |
| Search page      | direct client | 1.1-2.5s (browser bootstrap warms it) |
| Photo HEAD probe | direct client |                                 ~0.4s |

A direct client is about three times faster than fetching from inside the page. The client must present the impersonation profile closest to the browser that cleared the session: with `chrome151` and the browser user agent, requests returned HTTP 200, while the generic `chrome` profile was answered with the bot-check page even with valid cookies and a matching user agent. Requests without the session cookies were blocked outright.

Bootstrap cost on a healthy session: about 2s for the browser launch, 4s for the map page, and about 1s for the first warmed search request.

### Startup optimization check

Local 20-listing default-area runs without a proxy both completed successfully. The original source took 34.4 seconds overall, including about 7.0 seconds between opening the map and establishing the session. The updated source took 15.3 seconds overall, with a 0.7-second browser launch and a 1.9-second map/session handoff. These are separate smoke-test samples, not a controlled benchmark or an Apify residential-proxy guarantee; network and browser shutdown times varied. One photo probe needed its existing fallback in the updated run.

Logs now report browser launch and map/session setup durations at INFO, plus search and gallery durations at DEBUG. The reported two-minute cloud startup has not been reproduced locally; the cloud run log is needed to identify its remaining cause.

## Image galleries

The search payload returns exactly one photo per listing, so the gallery has to be completed separately. Two options were evaluated:

| Request                    | Method             |    Result |            Photos | Extra fields                                                                                                            |
| -------------------------- | ------------------ | --------: | ----------------: | ----------------------------------------------------------------------------------------------------------------------- |
| `AsyncPropertySearch_Post` | POST, form encoded |  HTTP 200 |     1 per listing | price, address, building, land, individual, media, price change, tags                                                   |
| `PropertyDetails`          | GET                |  HTTP 200 | 37-50 per listing | `BasementType`, `ArchitecturalStyle`, `ConstructedDate`, `Room`, `TaxAmount`, `ZoningDescription`, and the full gallery |
| `cdn.realtor.ca` sequence  | HEAD               | 200 / 404 |  complete gallery | none                                                                                                                    |

The detail route was removed. It is rate limited per session, adds one request per listing, and is the slowest part of a run, while the image service answers a full gallery in a few small parallel probes.

### Gallery derivation

Photo paths follow a fixed pattern, `<base>_<sequence>.<extension>`, and the search payload already contains the first photo of every listing. The gallery is resolved by probing the image service for the highest existing sequence:

1. Probe a ladder of sequences in one parallel batch to bracket the gallery size.
2. Narrow the bracket with parallel probe rounds until the size is exact.
3. Emit every URL from 1 to that size.

Verified against ground truth: for listing `W13838198` the derived gallery was exactly 50 photos, matching the detail record. A probe that returns anything other than 200 or 404 aborts the derivation, so a partial gallery is never published, and listings without real photos resolve to no gallery instead of the Realtor.ca placeholder image.

### Detail rate limiting (why the detail route was removed)

`PropertyDetails` is rate limited per session. Measured on Apify: after 100 listings the endpoint started failing, and 76 of the next 100 detail records could not be fetched. Measured locally: responses slowed from 0.8s to 8.6s, the eighth sequential request failed with `Failed to fetch`, and afterwards the search endpoint failed as well for more than 45 seconds. In the same Apify run the gallery derivation for those 76 listings was the second largest cost at about 48 seconds.

Both costs are gone now: no detail requests are sent, and gallery probing runs in parallel. A 100 listing run that previously took 175 seconds, then 64 seconds, now finishes in 25 seconds locally.

## Notes

- The endpoint is cross-origin relative to `www.realtor.ca`. Adding `x-requested-with` or any other custom header triggers a CORS preflight that the API rejects, which surfaces as `Failed to fetch`. Sending only `content-type` keeps the request simple and returns HTTP 200.
- `context.request` shares the browser cookie jar but keeps Node HTTP fingerprints, so Cloudflare blocks it even when the page session has clearance. Only requests issued from inside the page work.
- Request parameters: `ApplicationId=1`, `CultureId=1`, `Version=7.0`, `IncludeHiddenListings=false`, map bounds, and the form-encoded filters.
- Response shape: `Results[]` with `Id`, `MlsNumber`, `Property` (price, type, address, photo), `Building`, `Land`, `Business`, `Individual`, `Office`, `AlternateURL`, `RelativeDetailsURL`, `PublicRemarks`, and `Paging`.
- `Property.Photo` can be a single object or an array. Search results carry one photo, and the gallery is completed from the same sequence pattern on the image service.
- `InsertedDateUTC` is .NET ticks, not an ISO string, and is converted to ISO during mapping.
- Some numeric fields arrive as strings, such as `PriceUnformattedValue` and address coordinates, and are normalized to numbers.
- `Address.AddressText` joins the street and city lines with a pipe character, which is normalized into a comma separated address plus a separate `street_address`.
- Search and detail requests use `RecordsPerPage=100`, the largest page the API accepts, which keeps a 300 listing run to three search requests.
- Detail records are optional enrichment: they deliver the complete gallery in one request plus fields such as features, architectural style, basement type, construction year, and transaction type. Any listing without a detail record is still completed with a derived gallery, so the dataset contract never depends on the rate limited endpoint.
- Realtor.ca map URLs are preferred for coverage because they contain exact bounding-box filters. Keyword and location inputs are supported, and they take precedence over the URL when supplied.
