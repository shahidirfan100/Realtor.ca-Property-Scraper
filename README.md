## What does Realtor.ca Property Scraper do?

Realtor.ca Property Scraper extracts Canadian property listings from Realtor.ca, Canada's largest real estate listing platform. Paste a Realtor.ca map URL, or search by city with bedroom, bathroom, price, size, and land filters, and collect prices, addresses, coordinates, MLS numbers, property details, photo galleries, agent contacts, and brokerage information. The result is a clean, structured dataset you can export, schedule, or push into your own systems.

## Why use Realtor.ca Property Scraper?

- **Map URL support** - Paste any Realtor.ca map URL. The Actor reads your area, zoom level, sort order, transaction type, and property type filters directly from the URL, so the dataset matches the exact search you built on Realtor.ca.
- **City and filter searches** - Use city shortcuts for Toronto, Vancouver, Montreal, Calgary, Ottawa, or Edmonton, and narrow results by bedrooms, bathrooms, price, interior size, and land size.
- **Pagination and result limits** - Control how many listings you save, how many pages are requested, and how many listings are fetched per page.
- **Clean structured output** - Empty and null values are removed before records are saved, so exports stay clean for spreadsheets, dashboards, and data pipelines.
- **Photo galleries** - Every listing includes a primary photo URL and the complete gallery of high-resolution image URLs, with photos ordered as published on Realtor.ca. Galleries are completed automatically without opening any listing page.
- **Complete records, no page loads** - Every listing is captured from the search results themselves, then completed with its full photo gallery. No listing page is ever opened, which keeps runs fast and stable.
- **Agent and brokerage data** - Collect agent names, positions, phone numbers, websites, and brokerage organizations when available.
- **Scheduling ready** - Run the Actor on demand, or schedule it to monitor new inventory in a target area.
- **Fast runs** - The area session is established once and reused for the whole run, so small jobs finish in seconds and large jobs are limited only by the number of listings you ask for.

## What data can you extract from Realtor.ca?

| Field               | Description                                                        |
| ------------------- | ------------------------------------------------------------------ |
| `listing_id`        | Realtor.ca listing identifier                                      |
| `mls_number`        | MLS reference number                                               |
| `url`               | Realtor.ca property detail page URL                                |
| `price`             | Displayed listing price                                            |
| `price_unformatted` | Numeric price for sorting and calculations                         |
| `address`           | Full property address                                              |
| `street_address`    | Street line only                                                   |
| `city`              | City                                                               |
| `province`          | Province                                                           |
| `postal_code`       | Postal code                                                        |
| `latitude`          | Latitude coordinate                                                |
| `longitude`         | Longitude coordinate                                               |
| `bedrooms`          | Bedroom count                                                      |
| `bathrooms`         | Bathroom count                                                     |
| `property_type`     | Property type (Single Family, Condo, Townhouse, and more)          |
| `transaction_type`  | For sale or rental type when provided                              |
| `ownership_type`    | Ownership type                                                     |
| `size_interior`     | Interior size when available                                       |
| `land_size`         | Land size when available                                           |
| `photo_url`         | Primary property image URL                                         |
| `photo_urls`        | Complete image gallery, ordered as published                       |
| `agents`            | Agent names, positions, phone numbers, websites, and organizations |
| `offices`           | Brokerage office details when available                            |
| `public_remarks`    | Listing remarks                                                    |
| `features`          | Property features and amenities                                    |
| `parking_type`      | Parking type                                                       |
| `parking_spaces`    | Number of parking spaces                                           |
| `building_type`     | Building type                                                      |
| `constructed_date`  | Year built or constructed date                                     |
| `listed_date`       | Date the property was listed                                       |
| `updated_date`      | Last update timestamp in ISO format                                |

Each listing includes the full photo gallery. `photo_url` is the first gallery image.

## How to use Realtor.ca Property Scraper

1. Open the Actor on Apify Store.
2. Paste a Realtor.ca map URL, or enter a city name and optional filters.
3. Set how many listings you want and how many pages to request.
4. Run the Actor.
5. Download the dataset or connect it to your workflow.

## Input Parameters

| Parameter            | Type    | Required | Default             | Description                                                                                                       |
| -------------------- | ------- | -------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `startUrl`           | String  | No       | Canada-wide map URL | Realtor.ca map or search URL. URL filters are used when no location is provided.                                  |
| `location`           | String  | No       | -                   | City shortcut. Supported: Toronto, Vancouver, Montreal, Calgary, Ottawa, Edmonton. Takes precedence over the URL. |
| `beds`               | Integer | No       | -                   | Minimum number of bedrooms.                                                                                       |
| `baths`              | Integer | No       | -                   | Minimum number of bathrooms.                                                                                      |
| `price_min`          | Integer | No       | -                   | Minimum price in Canadian dollars.                                                                                |
| `price_max`          | Integer | No       | -                   | Maximum price in Canadian dollars.                                                                                |
| `size_min`           | Integer | No       | -                   | Minimum interior size in square feet.                                                                             |
| `size_max`           | Integer | No       | -                   | Maximum interior size in square feet.                                                                             |
| `land_min`           | Number  | No       | -                   | Minimum land size in acres.                                                                                       |
| `land_max`           | Number  | No       | -                   | Maximum land size in acres.                                                                                       |
| `results_wanted`     | Integer | No       | `20`                | Maximum number of listings to save.                                                                               |
| `max_pages`          | Integer | No       | `2`                 | Maximum number of result pages to request.                                                                        |
| `proxyConfiguration` | Object  | No       | Residential proxy   | Proxy settings for reliable collection. Residential proxies are recommended.                                      |

### Search mode precedence

- A provided `location` runs that city search and the URL is ignored, which keeps each search mode predictable.
- If no location is provided, the supplied `startUrl` is used.
- If nothing is provided, the Actor runs the default Canada-wide map area.
- Filter inputs and URL filters combine, and an explicit filter input wins over the same filter inside the URL.

## Output Data

| Field                 | Type   | Description                                                        |
| --------------------- | ------ | ------------------------------------------------------------------ |
| `listing_id`          | String | Realtor.ca listing identifier                                      |
| `mls_number`          | String | MLS reference number                                               |
| `url`                 | String | Realtor.ca property detail URL                                     |
| `relative_url`        | String | Realtor.ca detail path                                             |
| `price`               | String | Displayed price                                                    |
| `price_unformatted`   | Number | Numeric price when provided                                        |
| `price_changed_date`  | String | ISO date of the last price change when provided                    |
| `property_type`       | String | Property type                                                      |
| `transaction_type`    | String | Sale or rental type when provided                                  |
| `ownership_type`      | String | Ownership type                                                     |
| `address`             | String | Full property address                                              |
| `street_address`      | String | Street line                                                        |
| `city`                | String | City                                                               |
| `province`            | String | Province                                                           |
| `postal_code`         | String | Postal code                                                        |
| `latitude`            | Number | Latitude                                                           |
| `longitude`           | Number | Longitude                                                          |
| `bedrooms`            | String | Bedroom count                                                      |
| `bathrooms`           | String | Bathroom count                                                     |
| `half_bathrooms`      | String | Half bathroom count when provided                                  |
| `size_interior`       | String | Interior size when available                                       |
| `stories_total`       | String | Number of stories when provided                                    |
| `land_size`           | String | Land size when available                                           |
| `photo_url`           | String | Primary property image                                             |
| `photo_urls`          | Array  | Property image gallery URLs                                        |
| `media`               | Array  | Video tours, brochures, and other media links when provided        |
| `agents`              | Array  | Agent names, positions, phone numbers, websites, and organizations |
| `offices`             | Array  | Brokerage office details when available                            |
| `public_remarks`      | String | Listing remarks when published                                     |
| `features`            | String | Property features when published                                   |
| `amenities_nearby`    | String | Nearby amenities                                                   |
| `building_amenities`  | String | Building amenities when published                                  |
| `parking_type`        | String | Parking type                                                       |
| `parking_spaces`      | String | Number of parking spaces                                           |
| `building_type`       | String | Building type                                                      |
| `architectural_style` | String | Architectural style when provided                                  |
| `basement_type`       | String | Basement type when provided                                        |
| `constructed_date`    | String | Year built or constructed date                                     |
| `business_type`       | String | Business type for commercial listings                              |
| `listed_date`         | String | Date the property was listed                                       |
| `updated_date`        | String | Last update timestamp in ISO format                                |

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

### City Search with Filters

Search a city and narrow the results by bedrooms, bathrooms, and price.

```json
{
    "location": "Toronto",
    "beds": 3,
    "baths": 2,
    "price_min": 700000,
    "price_max": 1500000,
    "results_wanted": 40,
    "max_pages": 2
}
```

### Interior and Land Size Search

Filter by interior size in square feet and land size in acres.

```json
{
    "location": "Calgary",
    "size_min": 1800,
    "land_min": 0.25,
    "results_wanted": 30,
    "max_pages": 2
}
```

### City Only Search

Collect listings for a city with no extra filters.

```json
{
    "location": "Vancouver",
    "results_wanted": 30,
    "max_pages": 2
}
```

### Larger Collection with Custom Pages

Increase the page size to reduce the number of requests while collecting more listings.

```json
{
    "startUrl": "https://www.realtor.ca/map#ZoomLevel=11&LatitudeMax=43.85546&LongitudeMax=-79.00248&LatitudeMin=43.45830&LongitudeMin=-79.63926&Sort=6-D&PropertyTypeGroupID=1&TransactionTypeId=2&PropertySearchTypeId=0&Currency=CAD",
    "results_wanted": 300,
    "max_pages": 5
}
```

## Sample Output

```json
{
    "listing_id": "30340163",
    "mls_number": "W13839638",
    "url": "https://www.realtor.ca/real-estate/30340163/51-arcadian-circle-toronto-long-branch",
    "relative_url": "/real-estate/30340163/51-arcadian-circle-toronto-long-branch",
    "price": "$839,000",
    "price_unformatted": 839000,
    "property_type": "Single Family",
    "ownership_type": "Freehold",
    "address": "51 ARCADIAN CIRCLE, Toronto (Long Branch), Ontario M8W2Z4",
    "street_address": "51 ARCADIAN CIRCLE",
    "province": "Ontario",
    "postal_code": "M8W2Z4",
    "latitude": 43.5937205,
    "longitude": -79.5271542,
    "bedrooms": "2",
    "bathrooms": "2",
    "half_bathrooms": "1",
    "size_interior": "102.1925 m2",
    "stories_total": "1",
    "building_type": "House",
    "building_amenities": "Fireplace(s)",
    "land_size": "30 x 171 FT",
    "land_frontage": "30 ft",
    "parking_type": "Detached Garage, Garage",
    "parking_spaces": "2",
    "photo_url": "https://cdn.realtor.ca/listings/TS639262821898200000/reb82/highres/8/w13839638_1.jpg",
    "photo_urls": [
        "https://cdn.realtor.ca/listings/TS639262821898200000/reb82/highres/8/w13839638_1.jpg",
        "https://cdn.realtor.ca/listings/TS639262821898200000/reb82/highres/8/w13839638_2.jpg",
        "https://cdn.realtor.ca/listings/TS639262821898200000/reb82/highres/8/w13839638_3.jpg"
    ],
    "media": [
        {
            "type": "VideoTourWebsite",
            "url": "https://sites.happyhousegta.com/mls/267387686"
        }
    ],
    "agents": [
        {
            "name": "LEE HUDDLESTON",
            "position": "Salesperson",
            "phone": "259-9639",
            "email": "578297478",
            "organization": "ROYAL LEPAGE PORRITT REAL ESTATE",
            "photo_url": "https://cdn.realtor.ca/individuals/TS638852463600000000/highres/1228896.jpg"
        }
    ],
    "updated_date": "2026-09-29T16:36:29.816Z"
}
```

## Tips for Best Results

- **Use map URLs for precision** - Open Realtor.ca, apply your filters (area, property type, transaction type, sort order), then copy the map URL. The Actor reads all filters from the URL.
- **Filter with the built-in inputs** - Bedrooms, bathrooms, price, interior size, and land size filters combine with a map URL, and an explicit input wins over the same filter inside the URL.
- **Size filters match published sizes** - Realtor.ca only matches interior size filters against listings that publish an exact square footage, so size filters return fewer results than price or bedroom filters.
- **Smaller areas work better** - Narrow map areas usually return more complete datasets. Split broad Canada-wide searches into city or neighbourhood searches.
- **Full galleries are built in** - Every listing is completed with its full photo gallery automatically, and no listing page is opened, so runs stay fast.
- **Know the source cap** - Realtor.ca returns up to 600 listings per search area. Split large regions into smaller searches if you need more.
- **Start small** - Test with 20 listings and 2 pages before running larger jobs.
- **Use newest-first sorting** - The default sort returns the most recent listings first, which is useful for monitoring new inventory.
- **Residential proxies** - Keep residential proxy settings enabled for steady collection, especially on scheduled runs.
- **Empty fields are normal** - Some listings do not publish every field. Empty values are removed from the output to keep datasets clean.

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

Use Realtor.ca map or search URLs for best results. The Actor reads the URL filters and uses them for listing collection. Detail page URLs are not used as search input.

### What happens if I provide both a URL and a location?

The location search runs and the URL is ignored. To collect a specific map area, leave the location empty and provide only the map URL.

### Can I collect rental listings?

Yes. Use a Realtor.ca URL that already contains the rental filter, or set the transaction type to rental on the Realtor.ca website before copying the URL.

### Why should I use a map URL instead of a city name?

A map URL includes exact coordinates and all your filters, which is more precise than a city name alone. City shortcuts are convenient when you want a fast starting point.

### Why are some fields missing?

Some Realtor.ca listings do not publish every field. Empty values are removed so the dataset stays clean and easy to work with.

### How many listings can I collect?

You can set the number of listings you want, but Realtor.ca returns at most 600 listings for a single search area. Split large areas into smaller city or neighbourhood searches for better coverage.

### Can I export the data to CSV or Excel?

Yes. Apify datasets can be downloaded in CSV, Excel, JSON, XML, and other supported formats.

### Can I run this Actor on a schedule?

Yes. Schedule the Actor in Apify Console to refresh data hourly, daily, or weekly. This is useful for monitoring new listings in a target area.

### Can I collect listing photos using this Actor?

Yes. `photo_url` is the first image and `photo_urls` contains the full gallery in the order it was published, which is often 20 to 50 images for a listing. Galleries are completed automatically for every listing.

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
