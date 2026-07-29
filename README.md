## What does Realtor.ca Property Scraper do?

Extract Canadian property listings from Realtor.ca using a map URL, city name, or keyword search. Collect prices, addresses, coordinates, MLS numbers, property details, photo galleries, agent and brokerage information from Canada's largest real estate listing platform. Use the data for market research, property monitoring, lead generation, and investment analysis.

## Why use Realtor.ca Property Scraper?

- **Realtor.ca map URL support** - Paste any Realtor.ca map URL. The Actor reads your area, zoom level, sort order, transaction type, and property type filters directly from the URL.
- **Keyword and location filters** - Search by terms such as condo, waterfront, garage, acreage, or an MLS number. Use city shortcuts for Toronto, Vancouver, Montreal, Calgary, Ottawa, or Edmonton.
- **Pagination and result limits** - Control how many listings and result pages to collect. Start with a small test batch, then scale up.
- **Clean structured output** - Empty and null values are removed before records are saved. Exports stay clean for spreadsheets, dashboards, and data pipelines.
- **Photo galleries** - Each listing includes the primary photo URL and a full array of high-resolution image URLs from Realtor.ca data endpoints.
- **Agent and office data** - Collect agent names, phone numbers, websites, organizations, and brokerage office details when available.

## What data can you extract from Realtor.ca?

| Field | Description |
|-------|-------------|
| `listing_id` | Realtor.ca listing identifier |
| `mls_number` | MLS reference number |
| `url` | Property detail page URL |
| `price` | Displayed listing price |
| `address` | Full property address |
| `city` | City |
| `province` | Province |
| `latitude` | Latitude coordinate |
| `longitude` | Longitude coordinate |
| `bedrooms` | Bedroom count |
| `bathrooms` | Bathroom count |
| `property_type` | Property type (Single Family, Condo, Townhouse, etc.) |
| `transaction_type` | For sale or rental type |
| `ownership_type` | Ownership type |
| `size_interior` | Interior size when available |
| `land_size` | Land size when available |
| `photo_url` | Primary property image URL |
| `photo_urls` | Array of high-resolution property image URLs |
| `agents` | Agent names, phone numbers, websites, and organizations |
| `offices` | Brokerage office details |
| `public_remarks` | Listing description and remarks |
| `features` | Property features and amenities |
| `parking_type` | Parking type |
| `parking_spaces` | Number of parking spaces |
| `building_type` | Building type |
| `architectural_style` | Architectural style |
| `basement_type` | Basement type |
| `constructed_date` | Year built or constructed date |
| `listed_date` | Date the property was listed |
| `updated_date` | Last update timestamp |

## How to use Realtor.ca Property Scraper

1. Open the Actor on Apify Store.
2. Paste a Realtor.ca map URL or enter a city name and optional keyword.
3. Set the number of listings you want and the page limit.
4. Run the Actor.
5. Download the dataset or connect it to your workflow.

## Input Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `startUrl` | String | No | Canada-wide map URL | Realtor.ca map or search URL. URL filters are used first when provided. |
| `keyword` | String | No | Empty | Optional listing keyword or MLS search term. Examples: condo, waterfront, garage, acreage. |
| `location` | String | No | Empty | City shortcut when no URL is provided. Supported: Toronto, Vancouver, Montreal, Calgary, Ottawa, Edmonton. |
| `results_wanted` | Integer | No | `20` | Maximum number of listings to save. |
| `max_pages` | Integer | No | `2` | Maximum number of result pages to request. |
| `proxyConfiguration` | Object | No | Residential proxy | Proxy settings for reliable collection. Residential proxies are recommended. |

## Output Data

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
| `photo_urls` | Array | High-resolution property image gallery URLs |
| `agents` | Array | Agent names, phone numbers, websites, and organizations |
| `offices` | Array | Brokerage office details when available |
| `public_remarks` | String | Listing remarks |
| `raw` | Object | Cleaned source listing data for advanced analysis |

## Usage Examples

### Realtor.ca Map URL

Use a Realtor.ca map URL to collect listings from a specific area with all your filters applied. The Actor reads the coordinates, zoom level, sort order, transaction type, and property type from the URL.

```json
{
    "startUrl": "https://www.realtor.ca/map#ZoomLevel=11&LatitudeMax=43.85546&LongitudeMax=-79.00248&LatitudeMin=43.45830&LongitudeMin=-79.63926&Sort=6-D&PropertyTypeGroupID=1&TransactionTypeId=2&PropertySearchTypeId=0&Currency=CAD",
    "results_wanted": 50,
    "max_pages": 3
}
```

### Keyword Search

Search for listings using a city name and a keyword such as condo, waterfront, or garage.

```json
{
    "location": "Toronto",
    "keyword": "condo",
    "results_wanted": 20,
    "max_pages": 2
}
```

### Canada-Wide Collection

Use the default Canada-wide map URL to collect listings from across the country. Narrow down with optional filters.

```json
{
    "results_wanted": 100,
    "max_pages": 5,
    "proxyConfiguration": {
        "useApifyProxy": true,
        "apifyProxyGroups": ["RESIDENTIAL"]
    }
}
```

## Sample Output

```json
{
    "listing_id": "30001234",
    "mls_number": "C1234567",
    "url": "https://www.realtor.ca/real-estate/30001234/123-example-street",
    "price": "$899,000",
    "price_unformatted": 899000,
    "property_type": "Single Family",
    "transaction_type": "For sale",
    "ownership_type": "Freehold",
    "address": "123 Example Street, Toronto, Ontario",
    "city": "Toronto",
    "province": "Ontario",
    "postal_code": "M5V 1J2",
    "latitude": 43.6532,
    "longitude": -79.3832,
    "bedrooms": "3",
    "bathrooms": "2",
    "size_interior": "1500 sqft",
    "land_size": "30 x 100 ft",
    "photo_url": "https://cdn.realtor.ca/listing/TS638/example.jpg",
    "photo_urls": [
        "https://cdn.realtor.ca/listing/TS638/example-1.jpg",
        "https://cdn.realtor.ca/listing/TS638/example-2.jpg"
    ],
    "agents": [
        {
            "name": "Example Agent",
            "phone": "416-555-0100",
            "organization": "Example Realty"
        }
    ],
    "offices": [
        {
            "name": "Example Realty Inc.",
            "phone": "416-555-0200",
            "website": "https://examplerealty.ca"
        }
    ],
    "public_remarks": "Well maintained home close to transit, parks, and schools.",
    "features": ["Central A/C", "Hardwood Floors", "Finished Basement"],
    "building_type": "House",
    "constructed_date": "2010",
    "parking_type": "Attached Garage",
    "parking_spaces": "2",
    "listed_date": "2026-07-15T12:00:00",
    "updated_date": "2026-07-28T10:30:00"
}
```

## Tips for Best Results

- **Use map URLs** - Open Realtor.ca, apply your filters (area, property type, transaction type, sort order), then copy the map URL. The Actor reads all filters from the URL.
- **Smaller areas work better** - Narrow map areas usually return more complete datasets. Split broad Canada-wide searches into city or neighbourhood searches.
- **Start small** - Test with 20 results and 1-2 pages before running larger jobs.
- **Use newest-first sorting** - The default sort (`Sort=6-D`) returns the most recent listings first, useful for monitoring new inventory.
- **Residential proxies** - Enable Apify residential proxy settings for steady collection, especially on scheduled runs.
- **Empty fields are normal** - Some listings do not provide every field. Empty values are removed from the output to keep datasets clean.

## Integrations

- **Google Sheets** - Send property data to spreadsheets for price tracking and market analysis.
- **Airtable** - Build searchable property databases with photos and agent details.
- **Webhooks** - Push new listings into CRM systems or notify team members.
- **Make or Zapier** - Connect results to no-code automations without writing code.
- **API** - Access datasets programmatically from your own applications.

### Export Formats

- **JSON** - For apps and data pipelines.
- **CSV** - For spreadsheets and BI tools.
- **Excel** - For reporting and analysis.
- **XML** - For integrations that need structured feeds.

## Frequently Asked Questions

### Can I use any Realtor.ca URL?

Use Realtor.ca map or search URLs for best results. The Actor reads the URL filters and uses them for listing collection.

### Can I collect rental listings?

Yes. Use a Realtor.ca URL that already contains the rental filter, or set the transaction type to rental on the Realtor.ca website before copying the URL.

### Why should I use a map URL instead of a city name?

A map URL includes exact coordinates and all your filters. This is more precise than a plain city name and produces cleaner results.

### Why are some fields missing?

Some Realtor.ca listings do not publish every field. Empty values are removed so the dataset stays clean and easy to work with.

### How many listings can I collect?

You can set the desired result count, but broad searches may be capped by the source. Split large areas into smaller city or neighbourhood map searches for better coverage.

### Can I export the data to CSV or Excel?

Yes. Apify datasets can be downloaded in CSV, Excel, JSON, XML, and other supported formats.

### Can I run this Actor on a schedule?

Yes. Schedule the Actor in Apify Console to refresh data hourly, daily, or weekly. This is useful for monitoring new listings in a target area.

### Can I collect listing photos using this Actor?

Yes. Each listing includes a `photo_url` for the primary photo and a `photo_urls` array with full-resolution gallery images from Realtor.ca data endpoints.

### Is it legal to scrape Realtor.ca?

Scraping public web data can be legal, but you are responsible for complying with applicable laws, website terms, and privacy rules. Use the data responsibly.

## Related Actors

- [Redfin Property Scraper](https://apify.com/shahidirfan/redfin-property-scraper) - Extract US real estate listings from Redfin.
- [Realtor.com Scraper](https://apify.com/shahidirfan/realtor-com-scraper) - Extract US property listings from Realtor.com.
- [Zameen.com Scraper](https://apify.com/shahidirfan/zameen-com-scraper) - Extract Pakistan property listings from Zameen.com.
- [Propertyfinder Scraper](https://apify.com/shahidirfan/propertyfinder-scraper) - Extract UAE real estate listings from Propertyfinder.ae.

## Support

For issues, feature requests, or custom Actor work, use the Issues tab on the Actor page or contact the developer through Apify.

## Legal Notice

This Actor is designed for legitimate data collection from publicly available sources. Users are responsible for using the data responsibly and complying with applicable laws, Realtor.ca terms of service, and privacy regulations.
