## Selected API

- Endpoint: `https://api2.realtor.ca/Listing.svc/AsyncPropertySearch_Post`
- Fallback endpoint: `https://api2.realtor.ca/Listing.svc/PropertySearch_Post`
- Method: `POST`
- Body: `application/x-www-form-urlencoded`
- Auth: none, but protected by Incapsula/Akamai-style bot checks on weak fingerprints
- Pagination: `CurrentPage`, `RecordsPerPage`, `MaximumResults`
- Input source: Realtor.ca map URL hash parameters or actor filters
- Selected implementation: direct HTTP calls with `impit` first, then a Firefox browser API-session fallback only when the endpoint returns 403

## Candidate Matrix

| Candidate | Header profile | Status/body | Fields | Pagination | Decision |
|---|---|---:|---:|---|---|
| `api2.realtor.ca/Listing.svc/AsyncPropertySearch_Post` | Captured from live map page after terms dismissal | HTTP 200 JSON | 40+ listing fields plus pins/grouping | `CurrentPage` | Selected |
| `api2.realtor.ca/Listing.svc/PropertySearch_Post` | browser-like POST, website referer | Local PowerShell received 403 Incapsula | 40+ expected from listing payload | `CurrentPage` | Fallback endpoint |
| URLScan public search for `page.domain:realtor.ca` | public scan lookup | Recent scans found for homepage/detail pages, exact map XHR unavailable without logged-in result fetch | network candidates inconclusive | unknown | Rejected as insufficient for map search |
| HTML parsing | desktop page HTML | JavaScript rendered and protected | fewer fields | browser-driven | Rejected |
| Browser automation | Firefox network/API session | Required on Apify after direct HTTP still returned 403 | rich fields available | XHR replay | Fallback selected |

## Available Fields

The selected listing search payload exposes property, address, building, land, photo, agent, office, MLS, pricing, remarks, and geolocation fields. The actor maps useful top-level fields and keeps the original listing payload under `raw` after removing null and empty values.

## Notes

- Plain local PowerShell calls to the older endpoint were blocked with an Incapsula incident response. The live browser network request now uses `AsyncPropertySearch_Post` with `ApplicationId=1`, `CultureId=1`, `Version=7.0`, `IncludeHiddenListings=false`, and form-encoded map filters.
- The actor first attempts HTTP-only extraction. If Realtor.ca blocks raw HTTP, it opens a Firefox session and calls the same internal JSON endpoint from that session. It does not parse listing HTML.
- Realtor.ca map URLs are preferred because they contain exact bounding-box filters. Keyword/location inputs are supported, but map URLs are more precise for city/neighbourhood searches.
