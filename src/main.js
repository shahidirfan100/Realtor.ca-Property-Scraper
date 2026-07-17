import { Actor, log } from 'apify';
import { Impit } from 'impit';
import { chromium, firefox } from 'playwright';

const SEARCH_ENDPOINTS = [
    'https://api2.realtor.ca/Listing.svc/AsyncPropertySearch_Post',
    'https://api2.realtor.ca/Listing.svc/PropertySearch_Post',
];

const DETAIL_ENDPOINTS = [
    { url: 'https://api2.realtor.ca/Listing.svc/PropertyDetails', applicationId: '1' },
    { url: 'https://api37.realtor.ca/Listing.svc/PropertyDetails', applicationId: '37' },
];

const DEFAULT_BOUNDS = {
    LatitudeMax: '60.60705',
    LongitudeMax: '-33.33362',
    LatitudeMin: '36.06441',
    LongitudeMin: '-136.16565',
    ZoomLevel: '4',
};

const LOCATION_BOUNDS = {
    toronto: { LatitudeMax: '43.85546', LongitudeMax: '-79.00248', LatitudeMin: '43.45830', LongitudeMin: '-79.63926', ZoomLevel: '11' },
    'toronto, on': { LatitudeMax: '43.85546', LongitudeMax: '-79.00248', LatitudeMin: '43.45830', LongitudeMin: '-79.63926', ZoomLevel: '11' },
    vancouver: { LatitudeMax: '49.36270', LongitudeMax: '-122.80178', LatitudeMin: '49.00231', LongitudeMin: '-123.38184', ZoomLevel: '11' },
    'vancouver, bc': { LatitudeMax: '49.36270', LongitudeMax: '-122.80178', LatitudeMin: '49.00231', LongitudeMin: '-123.38184', ZoomLevel: '11' },
    montreal: { LatitudeMax: '45.70479', LongitudeMax: '-73.36668', LatitudeMin: '45.40216', LongitudeMin: '-73.97210', ZoomLevel: '11' },
    'montreal, qc': { LatitudeMax: '45.70479', LongitudeMax: '-73.36668', LatitudeMin: '45.40216', LongitudeMin: '-73.97210', ZoomLevel: '11' },
    calgary: { LatitudeMax: '51.21215', LongitudeMax: '-113.78358', LatitudeMin: '50.84252', LongitudeMin: '-114.31576', ZoomLevel: '11' },
    'calgary, ab': { LatitudeMax: '51.21215', LongitudeMax: '-113.78358', LatitudeMin: '50.84252', LongitudeMin: '-114.31576', ZoomLevel: '11' },
    ottawa: { LatitudeMax: '45.53758', LongitudeMax: '-75.24658', LatitudeMin: '45.18104', LongitudeMin: '-76.35321', ZoomLevel: '10' },
    'ottawa, on': { LatitudeMax: '45.53758', LongitudeMax: '-75.24658', LatitudeMin: '45.18104', LongitudeMin: '-76.35321', ZoomLevel: '10' },
    edmonton: { LatitudeMax: '53.71695', LongitudeMax: '-113.18368', LatitudeMin: '53.39576', LongitudeMin: '-113.71305', ZoomLevel: '11' },
    'edmonton, ab': { LatitudeMax: '53.71695', LongitudeMax: '-113.18368', LatitudeMin: '53.39576', LongitudeMin: '-113.71305', ZoomLevel: '11' },
};

const URL_PARAM_KEYS = new Set([
    'ZoomLevel',
    'Center',
    'LatitudeMax',
    'LongitudeMax',
    'LatitudeMin',
    'LongitudeMin',
    'Sort',
    'PropertyTypeGroupID',
    'TransactionTypeId',
    'PropertySearchTypeId',
    'Currency',
    'PriceMin',
    'PriceMax',
    'BedRange',
    'BathRange',
    'BuildingTypeId',
    'ConstructionStyleId',
    'OwnershipTypeGroupId',
    'StoreyRange',
    'Keywords',
    'ListingIds',
    'OpenHouse',
    'OpenHouseStartDate',
    'OpenHouseEndDate',
]);

await Actor.init();

function firstInputUrl(input) {
    if (input.startUrl) return input.startUrl;
    if (input.url) return input.url;
    if (Array.isArray(input.startUrls) && input.startUrls.length > 0) {
        const first = input.startUrls[0];
        return typeof first === 'string' ? first : first?.url;
    }
    return '';
}

function parseRealtorUrl(rawUrl) {
    if (!rawUrl) return {};

    const params = {};

    try {
        const parsed = new URL(rawUrl);
        const hash = parsed.hash?.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
        const hashParams = new URLSearchParams(hash || '');

        for (const [key, value] of hashParams.entries()) {
            if (URL_PARAM_KEYS.has(key) && value !== '') params[key] = value;
        }

        for (const [key, value] of parsed.searchParams.entries()) {
            if (URL_PARAM_KEYS.has(key) && value !== '') params[key] = value;
        }
    } catch (error) {
        log.debug(`Could not parse start URL. Falling back to input filters. Error: ${error.message}`);
    }

    return params;
}

function buildSearchParams(input) {
    const sourceUrl = firstInputUrl(input);
    const urlParams = parseRealtorUrl(sourceUrl);
    const locationKey = String(input.location || '').trim().toLowerCase();
    const locationBounds = locationKey ? LOCATION_BOUNDS[locationKey] : null;

    const resultsWanted = Math.max(Number(input.results_wanted || 20), 1);
    const recordsPerPage = String(Math.min(Math.max(Number(input.records_per_page || 50), 1), 100, resultsWanted));
    const params = {
        CultureId: '1',
        ApplicationId: '1',
        Version: '7.0',
        CurrentPage: '1',
        RecordsPerPage: recordsPerPage,
        MaximumResults: String(Math.min(resultsWanted, 200)),
        PropertySearchTypeId: '0',
        TransactionTypeId: '2',
        PropertyTypeGroupID: '1',
        Currency: 'CAD',
        Sort: '6-D',
        IncludeHiddenListings: 'false',
        StoreyRange: '0-0',
        ...DEFAULT_BOUNDS,
        ...locationBounds,
        ...urlParams,
    };

    if (input.keyword) params.Keywords = String(input.keyword).trim();
    if (input.property_type_group_id) params.PropertyTypeGroupID = String(input.property_type_group_id);
    if (input.transaction_type_id) params.TransactionTypeId = String(input.transaction_type_id);
    if (input.property_search_type_id) params.PropertySearchTypeId = String(input.property_search_type_id);
    if (input.price_min) params.PriceMin = String(input.price_min);
    if (input.price_max) params.PriceMax = String(input.price_max);
    if (input.bed_range) params.BedRange = String(input.bed_range);
    if (input.bath_range) params.BathRange = String(input.bath_range);
    if (input.sort) params.Sort = String(input.sort);

    return { params, sourceUrl };
}

function toFormBody(params) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') body.set(key, String(value));
    }
    return body;
}

function buildMapUrl(params) {
    const hash = new URLSearchParams();
    for (const key of URL_PARAM_KEYS) {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
            hash.set(key, String(params[key]));
        }
    }
    return `https://www.realtor.ca/map#${hash.toString()}`;
}

function cleanValue(value) {
    if (value === null || value === undefined || value === '') return undefined;
    if (Array.isArray(value)) {
        const cleaned = value.map(cleanValue).filter((item) => item !== undefined);
        return cleaned.length ? cleaned : undefined;
    }
    if (typeof value === 'object') {
        const cleaned = {};
        for (const [key, nestedValue] of Object.entries(value)) {
            const nextValue = cleanValue(nestedValue);
            if (nextValue !== undefined) cleaned[key] = nextValue;
        }
        return Object.keys(cleaned).length ? cleaned : undefined;
    }
    return value;
}

function cleanRecord(record) {
    return cleanValue(record) || {};
}

function absoluteRealtorUrl(pathOrUrl) {
    if (!pathOrUrl) return undefined;
    try {
        return new URL(pathOrUrl, 'https://www.realtor.ca').href;
    } catch {
        return undefined;
    }
}

function photoUrls(property = {}) {
    const photos = property.Photo;
    if (!Array.isArray(photos)) return undefined;
    const urls = photos.map((photo) => photo.HighResPath || photo.PhotoPath);
    return [...new Set(urls.map(absoluteRealtorUrl).filter(Boolean))];
}

function listingPropertyId(listing = {}) {
    const detailsPath = listing.RelativeDetailsURL || listing.Property?.RelativeDetailsURL || listing.AlternateURL?.DetailsLink;
    const pathId = detailsPath?.match(/\/(?:real-estate|immobilier)\/(\d+)\//i)?.[1];
    return listing.Id || listing.Property?.PropertyID || pathId;
}

function listingReferenceNumber(listing = {}) {
    return listing.MlsNumber || listing.Property?.MlsNumber;
}

function mapListing(listing, details = null) {
    const property = listing.Property || {};
    const detailProperty = details?.Property || {};
    const address = property.Address || {};
    const building = listing.Building || property.Building || {};
    const land = listing.Land || property.Land || {};
    const business = listing.Business || property.Business || {};
    const alternateUrl = listing.AlternateURL || property.AlternateURL || {};
    const agents = Array.isArray(listing.Individual) ? listing.Individual : [];
    const offices = Array.isArray(listing.Office) ? listing.Office : [];
    const detailsPath = alternateUrl.DetailsLink || listing.RelativeDetailsURL || property.RelativeDetailsURL;

    return cleanRecord({
        listing_id: listing.Id || property.PropertyID,
        mls_number: listing.MlsNumber || property.MlsNumber,
        url: absoluteRealtorUrl(detailsPath),
        relative_url: detailsPath,
        price: property.Price,
        price_unformatted: property.PriceUnformattedValue,
        property_type: property.Type,
        transaction_type: property.TransactionType,
        ownership_type: property.OwnershipType,
        address: address.AddressText,
        street_address: address.StreetAddress,
        city: address.City,
        province: address.Province || listing.ProvinceName,
        postal_code: address.PostalCode || listing.PostalCode,
        latitude: address.Latitude,
        longitude: address.Longitude,
        bedrooms: building.Bedrooms || property.Bedrooms,
        bathrooms: building.BathroomTotal || property.BathroomTotal,
        half_bathrooms: building.HalfBathTotal,
        size_interior: building.SizeInterior,
        stories_total: building.StoriesTotal,
        building_type: building.Type,
        architectural_style: building.ArchitecturalStyle,
        basement_type: building.BasementType,
        constructed_date: building.ConstructedDate,
        land_size: land.SizeTotal,
        parking_type: property.ParkingType,
        parking_spaces: property.ParkingSpaceTotal,
        features: property.Features,
        amenities_nearby: property.AmmenitiesNearBy,
        public_remarks: listing.PublicRemarks || property.PublicRemarks,
        photo_url: absoluteRealtorUrl(detailProperty.Photo?.[0]?.HighResPath || property.Photo?.[0]?.HighResPath || property.Photo?.[0]?.MedResPath || property.Photo?.[0]?.LowResPath),
        photo_urls: photoUrls(detailProperty)?.length ? photoUrls(detailProperty) : photoUrls(property),
        agents: agents.map((agent) => cleanRecord({
            name: agent.Name,
            position: agent.Position,
            phone: agent.Phones?.[0]?.PhoneNumber,
            email: agent.Emails?.[0]?.ContactId,
            website: agent.Websites?.[0]?.Website,
            organization: agent.Organization?.Name,
        })),
        offices: offices.map((office) => cleanRecord({
            name: office.Name,
            phone: office.Phones?.[0]?.PhoneNumber,
            website: office.Websites?.[0]?.Website,
            address: office.Address?.AddressText,
        })),
        business_type: business.BusinessType,
        listed_date: listing.ListedTime || property.ListedTime,
        updated_date: listing.InsertedDateUTC || listing.TimeOnRealtor,
        raw_details: details,
        raw: listing,
    });
}

async function createClient(proxyConfiguration) {
    let proxyUrl;

    if (proxyConfiguration?.useApifyProxy || proxyConfiguration?.proxyUrls?.length) {
        if (Actor.isAtHome()) {
            const proxy = await Actor.createProxyConfiguration(proxyConfiguration);
            proxyUrl = await proxy.newUrl();
        } else {
            log.info('Local run detected. Skipping Apify Proxy; proxy settings will be used on the Apify platform.');
        }
    }

    return new Impit({
        browser: 'chrome',
        ignoreTlsErrors: true,
        ...(proxyUrl && { proxyUrl }),
    });
}

async function fetchSearchPage(client, params) {
    const body = toFormBody(params);
    let lastError;

    for (const endpoint of SEARCH_ENDPOINTS) {
        try {
            const response = await client.fetch(endpoint, {
                method: 'POST',
                headers: {
                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    origin: 'https://www.realtor.ca',
                    referer: 'https://www.realtor.ca/',
                    'x-requested-with': 'XMLHttpRequest',
                },
                body: body.toString(),
            });

            const text = await response.text();
            if (!response.ok) {
                lastError = new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
                log.debug(`${endpoint} returned ${response.status}. Trying next endpoint if available.`);
                continue;
            }

            try {
                return JSON.parse(text);
            } catch (error) {
                throw new Error(`Invalid JSON from ${endpoint}: ${error.message}. Body: ${text.slice(0, 200)}`);
            }
        } catch (error) {
            lastError = error;
            log.debug(`Search request failed at ${endpoint}: ${error.message}`);
        }
    }

    throw lastError || new Error('All Realtor.ca search endpoints failed.');
}

async function createBrowserApiFetcher(startUrl) {
    const launcher = Actor.isAtHome() ? firefox : chromium;
    const browserName = Actor.isAtHome() ? 'Firefox' : 'Chromium';
    const browser = await launcher.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: Actor.isAtHome()
            ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0'
            : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
        viewport: { width: 1536, height: 864 },
    });
    const page = await context.newPage();
    const responsesByPage = new Map();

    function responseCacheKey(pageNumber, recordsPerPage) {
        return `${pageNumber}:${recordsPerPage || ''}`;
    }

    async function waitForCachedPage(pageNumber, recordsPerPage, timeoutMs = 15000) {
        const key = responseCacheKey(pageNumber, recordsPerPage);
        const started = Date.now();
        while (Date.now() - started < timeoutMs) {
            if (responsesByPage.has(key)) return responsesByPage.get(key);
            await page.waitForTimeout(500);
        }
        return undefined;
    }

    page.on('response', async (response) => {
        if (!response.url().includes('/Listing.svc/AsyncPropertySearch_Post') || !response.ok()) return;

        try {
            const postData = response.request().postData() || '';
            const requestParams = new URLSearchParams(postData);
            const pageNumber = requestParams.get('CurrentPage') || '1';
            const recordsPerPage = requestParams.get('RecordsPerPage') || '';
            const data = await response.json();
            if (Array.isArray(data.Results)) responsesByPage.set(responseCacheKey(pageNumber, recordsPerPage), data);
        } catch (error) {
            log.debug(`Could not capture browser API response: ${error.message}`);
        }
    });

    log.debug(`Opening Realtor.ca map once with ${browserName} to establish browser API session.`);
    try {
        await page.goto(startUrl, { waitUntil: 'commit', timeout: 60000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
    } catch (error) {
        if (!String(error.message || '').includes('NS_ERROR_ABORT')) throw error;
        log.debug(`Firefox navigation was aborted by the page but session setup will continue: ${error.message}`);
    }

    const dismiss = page.getByRole('link', { name: 'Dismiss' });
    if (await dismiss.isVisible({ timeout: 10000 }).catch(() => false)) {
        await dismiss.click({ timeout: 10000 }).catch(() => {});
    }

    await page.waitForTimeout(2000);
    if (![...responsesByPage.keys()].some((key) => key.startsWith('1:'))) {
        await waitForCachedPage('1', undefined, 30000);
    }
    if (![...responsesByPage.keys()].some((key) => key.startsWith('1:'))) {
        log.debug('No native Realtor.ca API response captured after initial load; reloading map once.');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        await waitForCachedPage('1', undefined, 15000);
    }

    return {
        async fetch(params) {
            const pageNumber = String(params.CurrentPage || '1');
            const recordsPerPage = String(params.RecordsPerPage || '');
            const key = responseCacheKey(pageNumber, recordsPerPage);
            if (responsesByPage.has(key)) return responsesByPage.get(key);
            const captured = await waitForCachedPage(pageNumber, recordsPerPage);
            if (captured) return captured;

            const body = toFormBody(params).toString();
            let result;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
                    result = await page.evaluate(async (requestBody) => {
                        const response = await fetch('https://api2.realtor.ca/Listing.svc/AsyncPropertySearch_Post', {
                            method: 'POST',
                            headers: {
                                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                            },
                            body: requestBody,
                        });
                        return {
                            ok: response.ok,
                            status: response.status,
                            text: await response.text(),
                        };
                    }, body);
                    break;
                } catch (error) {
                    const delayedCapture = await waitForCachedPage(pageNumber, recordsPerPage, 3000);
                    if (delayedCapture) return delayedCapture;
                    if (attempt === 3) {
                        log.debug(`Browser page fetch failed; trying browser-context API request: ${error.message}`);
                        const apiResponse = await context.request.post(
                            'https://api2.realtor.ca/Listing.svc/AsyncPropertySearch_Post',
                            {
                                headers: {
                                    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                                    referer: 'https://www.realtor.ca/',
                                },
                                data: body,
                            },
                        );
                        result = {
                            ok: apiResponse.ok(),
                            status: apiResponse.status(),
                            text: await apiResponse.text(),
                        };
                        break;
                    }
                    log.debug(`Browser API fetch retry ${attempt} after page context reset: ${error.message}`);
                    await page.waitForTimeout(1000);
                }
            }

            if (!result.ok) {
                if (pageNumber === '1') {
                    const capturedAfterBlockedFetch = await waitForCachedPage(pageNumber, recordsPerPage, 10000);
                    if (capturedAfterBlockedFetch) return capturedAfterBlockedFetch;
                }
                throw new Error(`Browser API fetch returned HTTP ${result.status}: ${result.text.slice(0, 200)}`);
            }

            const data = JSON.parse(result.text);
            if (Array.isArray(data.Results)) responsesByPage.set(key, data);
            return data;
        },
        async fetchDetails(listing) {
            const propertyId = listingPropertyId(listing);
            const referenceNumber = listingReferenceNumber(listing);
            if (!propertyId || !referenceNumber) return null;

            for (let attempt = 1; attempt <= 2; attempt++) {
                for (const endpoint of DETAIL_ENDPOINTS) {
                    const url = new URL(endpoint.url);
                    url.searchParams.set('ApplicationId', endpoint.applicationId);
                    url.searchParams.set('CultureId', '1');
                    url.searchParams.set('PropertyID', String(propertyId));
                    url.searchParams.set('ReferenceNumber', String(referenceNumber));
                    url.searchParams.set('PreferedMeasurementUnit', '1');
                    url.searchParams.set('HashCode', '0');

                    try {
                        const result = await page.evaluate(async (detailUrl) => {
                            const response = await fetch(detailUrl, {
                                credentials: 'include',
                                headers: {
                                    accept: 'application/json, text/javascript, */*; q=0.01',
                                    'x-requested-with': 'XMLHttpRequest',
                                },
                            });
                            return {
                                ok: response.ok,
                                status: response.status,
                                text: await response.text(),
                            };
                        }, url.href);

                        if (!result.ok) {
                            log.debug(`Property details returned HTTP ${result.status} for ${propertyId}`);
                            continue;
                        }

                        const data = JSON.parse(result.text);
                        const details = Array.isArray(data) ? data[0] : data;
                        if (details?.Property || details?.Building || details?.Individual) return details;
                    } catch (error) {
                        log.debug(`Browser property details request failed for ${propertyId}: ${error.message}`);
                    }

                    try {
                        const response = await context.request.get(url.href, {
                            headers: {
                                accept: 'application/json, text/javascript, */*; q=0.01',
                                referer: 'https://www.realtor.ca/',
                                'x-requested-with': 'XMLHttpRequest',
                            },
                        });
                        if (!response.ok()) continue;

                        const data = await response.json();
                        const details = Array.isArray(data) ? data[0] : data;
                        if (details?.Property || details?.Building || details?.Individual) return details;
                    } catch (error) {
                        log.debug(`Context property details request failed for ${propertyId}: ${error.message}`);
                    }
                }

                if (attempt < 2) {
                    await page.waitForTimeout(500 + Math.floor(Math.random() * 700));
                }
            }

            return null;
        },
        async close() {
            await browser.close();
        },
    };
}

async function main() {
    const input = (await Actor.getInput()) || {};
    const resultsWanted = Math.max(Number(input.results_wanted || 20), 1);
    const maxPages = Math.max(Number(input.max_pages || 5), 1);
    const { params, sourceUrl } = buildSearchParams(input);
    const client = await createClient(input.proxyConfiguration);
    const mapUrl = sourceUrl || buildMapUrl(params);

    let saved = 0;
    const seen = new Set();
    let browserApiFetcher;

    log.debug('Starting Realtor.ca property search', {
        sourceUrl: sourceUrl || 'input filters',
        resultsWanted,
        maxPages,
        search: {
            LatitudeMin: params.LatitudeMin,
            LatitudeMax: params.LatitudeMax,
            LongitudeMin: params.LongitudeMin,
            LongitudeMax: params.LongitudeMax,
            Keywords: params.Keywords,
            Sort: params.Sort,
        },
    });

    for (let page = 1; page <= maxPages && saved < resultsWanted; page++) {
        params.CurrentPage = String(page);
        params.MaximumResults = String(Math.min(resultsWanted, 200));
        params.RecordsPerPage = String(Math.min(Number(params.RecordsPerPage || 50), 100));

        let data;
        if (browserApiFetcher) {
            data = await browserApiFetcher.fetch(params);
        } else {
            try {
                data = await fetchSearchPage(client, params);
            } catch (error) {
                log.debug('Switching to browser API session.');
                browserApiFetcher = await createBrowserApiFetcher(mapUrl);
                data = await browserApiFetcher.fetch(params);
            }
        }
        const listings = Array.isArray(data.Results) ? data.Results : [];

        if (!listings.length) {
            log.info(`No listings returned on page ${page}. Stopping.`);
            break;
        }

        if (!browserApiFetcher) browserApiFetcher = await createBrowserApiFetcher(mapUrl);

        const records = [];
        for (const listing of listings) {
            if (saved + records.length >= resultsWanted) break;

            const key = listing.MlsNumber || listing.Id || JSON.stringify(listing).slice(0, 200);
            if (seen.has(key)) continue;
            seen.add(key);

            const details = browserApiFetcher ? await browserApiFetcher.fetchDetails(listing) : null;
            records.push(mapListing(listing, details));
        }

        if (records.length) {
            await Actor.pushData(records);
            saved += records.length;
            log.info(`Saved ${saved}/${resultsWanted} listings`);
        }

        const paging = data.Paging || {};
        const totalPages = Number(paging.TotalPages || paging.TotalPagesCount || 0);
        if (totalPages && page >= totalPages) break;
        if (listings.length < Number(params.RecordsPerPage || 50)) break;
    }

    if (browserApiFetcher) await browserApiFetcher.close();

    if (saved === 0) {
        throw new Error('No Realtor.ca listings were saved. Try a narrower Realtor.ca map URL and enable Apify Residential proxy.');
    }

    log.info(`Finished. Saved ${saved} listings.`);
}

await main();
await Actor.exit();
