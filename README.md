# Realtor.ca Property Scraper

Extract property listings from Realtor.ca search pages and map URLs. Collect prices, addresses, coordinates, MLS numbers, photos, property details, remarks, and agent or office information for real estate research, market monitoring, lead analysis, and property datasets.

## Features

- **Map URL support** - Paste a Realtor.ca map URL and keep the same area, sort, transaction type, and property filters.
- **Keyword filtering** - Search for terms such as condo, waterfront, garage, acreage, or an MLS number.
- **Pagination control** - Set a result count and page limit for quick tests or larger collection runs.
- **Clean output** - Empty and always-null values are removed before records are saved.
- **Rich listing data** - Collect pricing, location, property facts, photos, remarks, agents, offices, and raw source details.

---

## Use Cases

### Market Research
Track asking prices, property types, bedroom counts, and listing density across Canadian cities or map areas. Build datasets for comparable property analysis and neighbourhood research.

### Listing Monitoring
Run scheduled searches for the same Realtor.ca URL to monitor new inventory. Use newest-first sorting to spot recent additions in a target area.

### Lead Analysis
Collect agent and brokerage details where available. Combine listing metadata with price and location filters to prioritize outreach or market coverage.

### Data Exports
Export results as JSON, CSV, Excel, XML, or RSS from Apify datasets. Use the data in spreadsheets, dashboards, CRMs, and internal tools.

---

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | Realtor.ca Canada map URL | Realtor.ca map or search URL. URL filters are used first. |
| `keyword` | String | No | Empty | Optional listing keyword or MLS search term. |
| `location` | String | No | Empty | City shortcut when no URL is provided. Examples: Toronto, Vancouver, Montreal, Calgary, Ottawa, Edmonton. |
| `results_wanted` | Integer | No | `20` | Maximum number of listings to save. |
| `max_pages` | Integer | No | `2` | Maximum number of result pages to request. |
| `proxyConfiguration` | Object | No | Residential proxy | Proxy settings for reliable collection. |

---

## Output Data

Each item in the dataset can include:

| Field | Type | Description |
|-------|------|-------------|
| `listing_id` | String | Realtor.ca listing identifier |
| `mls_number` | String | MLS reference number |
| `url` | String | Property detail URL |
| `price` | String | Displayed listing price |
| `price_unformatted` | Number | Numeric price when provided |
| `property_type` | String | Property type |
| `transaction_type` | String | Sale or rental type |
| `ownership_type` | String | Ownership type |
| `address` | String | Full property address |
| `city` | String | City |
| `province` | String | Province |
| `postal_code` | String | Postal code |
| `latitude` | Number | Latitude |
| `longitude` | Number | Longitude |
| `bedrooms` | String | Bedroom count |
| `bathrooms` | String | Bathroom count |
| `size_interior` | String | Interior size when available |
| `land_size` | String | Land size when available |
| `photo_url` | String | Primary property image |
| `photo_urls` | Array | High-resolution property image gallery URLs collected from Realtor.ca data endpoints |
| `agents` | Array | Agent names, phone numbers, websites, and organizations when available |
| `offices` | Array | Brokerage office details when available |
| `public_remarks` | String | Listing remarks |
| `raw` | Object | Cleaned source listing data for advanced analysis |

---

## Usage Examples

### Realtor.ca Map URL

```json
{
    "startUrl": "https://www.realtor.ca/map#ZoomLevel=11&LatitudeMax=43.85546&LongitudeMax=-79.00248&LatitudeMin=43.45830&LongitudeMin=-79.63926&Sort=6-D&PropertyTypeGroupID=1&TransactionTypeId=2&PropertySearchTypeId=0&Currency=CAD",
    "results_wanted": 50,
    "max_pages": 3
}
```

### Keyword Search

```json
{
    "location": "Toronto",
    "keyword": "condo",
    "results_wanted": 20,
    "max_pages": 2
}
```

### Price and Bedroom Filters

```json
{
    "location": "Vancouver",
    "keyword": "waterfront",
    "results_wanted": 100
}
```

---

## Sample Output

```json
{
    "listing_id": "30001234",
    "mls_number": "C1234567",
    "url": "https://www.realtor.ca/real-estate/30001234/example-address-toronto",
    "price": "$899,000",
    "property_type": "Single Family",
    "transaction_type": "For sale",
    "address": "123 Example Street, Toronto, Ontario",
    "city": "Toronto",
    "province": "Ontario",
    "bedrooms": "3",
    "bathrooms": "2",
    "latitude": "43.6532",
    "longitude": "-79.3832",
    "photo_url": "https://cdn.realtor.ca/listing/TS638/example.jpg",
    "agents": [
        {
            "name": "Example Agent",
            "phone": "416-555-0100",
            "organization": "Example Realty"
        }
    ],
    "public_remarks": "Well maintained home close to transit, parks, and schools."
}
```

---

## Tips for Best Results

### Prefer Map URLs
- Open Realtor.ca, apply your filters, then paste the map URL.
- Smaller map areas usually return cleaner and more complete datasets.
- Use `Sort=6-D` for newest listings first.

### Start Small
- Test with `20` results before running larger jobs.
- Increase `max_pages` only when the first run returns useful data.
- Split very broad searches into city or neighbourhood map areas.

### Use Proxy Settings
- Residential proxy settings are recommended for steady collection.
- Keep result limits practical for repeated scheduled runs.

---

## Integrations

Connect your data with:

- **Google Sheets** - Review listings and price changes in spreadsheets.
- **Airtable** - Build searchable property databases.
- **Slack** - Send alerts for new matching listings.
- **Webhooks** - Push data into internal systems.
- **Make** - Create automated workflows.
- **Zapier** - Trigger follow-up actions.

### Export Formats

- **JSON** - For apps and data pipelines.
- **CSV** - For spreadsheets and BI tools.
- **Excel** - For reporting.
- **XML** - For integrations that need structured feeds.

---

## Frequently Asked Questions

### Can I use any Realtor.ca URL?
Use Realtor.ca map or search URLs for best results. The actor reads the URL filters and uses them for listing collection.

### Can I collect rental listings?
Yes. Use a Realtor.ca URL that already contains the rental filter.

### Why should I use a map URL?
A map URL includes exact coordinates and filters. This is more precise than a plain city name.

### Why are some fields missing?
Some listings do not provide every field. Empty values are removed so the dataset stays clean.

### How many listings can I collect?
You can set the desired result count, but broad searches may be capped by the source. Split large areas into smaller map searches for better coverage.

---

## Support

For issues or feature requests, contact support through the Apify Console.

### Resources

- [Apify Documentation](https://docs.apify.com/)
- [API Reference](https://docs.apify.com/api/v2)
- [Scheduling Runs](https://docs.apify.com/schedules)

---

## Legal Notice

This actor is designed for legitimate data collection purposes. Users are responsible for ensuring compliance with website terms of service and applicable laws. Use data responsibly and respect rate limits.
