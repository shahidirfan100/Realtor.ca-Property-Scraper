import { Actor, log } from 'apify';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { chromium } from 'patchright';
import { join } from 'path';

const SEARCH_ENDPOINT = 'https://api2.realtor.ca/Listing.svc/AsyncPropertySearch_Post';
const DETAIL_ENDPOINT = 'https://api2.realtor.ca/Listing.svc/PropertyDetails';
const MAP_PAGE_URL = 'https://www.realtor.ca/map';

// Mirrors the `startUrl` default in .actor/input_schema.json. Used only when the
// caller supplies no URL, keyword, or location.
const DEFAULT_START_URL =
    'https://www.realtor.ca/map#ZoomLevel=4&Center=49.864363%2C-84.749636&LatitudeMax=60.60705&LongitudeMax=-33.33362&LatitudeMin=36.06441&LongitudeMin=-136.16565&view=list&Sort=6-D&PropertyTypeGroupID=1&TransactionTypeId=2&PropertySearchTypeId=0&Currency=CAD';

const DEFAULT_BOUNDS = {
    LatitudeMax: '60.60705',
    LongitudeMax: '-33.33362',
    LatitudeMin: '36.06441',
    LongitudeMin: '-136.16565',
    ZoomLevel: '4',
};

const LOCATION_BOUNDS = {
    toronto: {
        LatitudeMax: '43.85546',
        LongitudeMax: '-79.00248',
        LatitudeMin: '43.45830',
        LongitudeMin: '-79.63926',
        ZoomLevel: '11',
    },
    'toronto, on': {
        LatitudeMax: '43.85546',
        LongitudeMax: '-79.00248',
        LatitudeMin: '43.45830',
        LongitudeMin: '-79.63926',
        ZoomLevel: '11',
    },
    vancouver: {
        LatitudeMax: '49.36270',
        LongitudeMax: '-122.80178',
        LatitudeMin: '49.00231',
        LongitudeMin: '-123.38184',
        ZoomLevel: '11',
    },
    'vancouver, bc': {
        LatitudeMax: '49.36270',
        LongitudeMax: '-122.80178',
        LatitudeMin: '49.00231',
        LongitudeMin: '-123.38184',
        ZoomLevel: '11',
    },
    montreal: {
        LatitudeMax: '45.70479',
        LongitudeMax: '-73.36668',
        LatitudeMin: '45.40216',
        LongitudeMin: '-73.97210',
        ZoomLevel: '11',
    },
    'montreal, qc': {
        LatitudeMax: '45.70479',
        LongitudeMax: '-73.36668',
        LatitudeMin: '45.40216',
        LongitudeMin: '-73.97210',
        ZoomLevel: '11',
    },
    calgary: {
        LatitudeMax: '51.21215',
        LongitudeMax: '-113.78358',
        LatitudeMin: '50.84252',
        LongitudeMin: '-114.31576',
        ZoomLevel: '11',
    },
    'calgary, ab': {
        LatitudeMax: '51.21215',
        LongitudeMax: '-113.78358',
        LatitudeMin: '50.84252',
        LongitudeMin: '-114.31576',
        ZoomLevel: '11',
    },
    ottawa: {
        LatitudeMax: '45.53758',
        LongitudeMax: '-75.24658',
        LatitudeMin: '45.18104',
        LongitudeMin: '-76.35321',
        ZoomLevel: '10',
    },
    'ottawa, on': {
        LatitudeMax: '45.53758',
        LongitudeMax: '-75.24658',
        LatitudeMin: '45.18104',
        LongitudeMin: '-76.35321',
        ZoomLevel: '10',
    },
    edmonton: {
        LatitudeMax: '53.71695',
        LongitudeMax: '-113.18368',
        LatitudeMin: '53.39576',
        LongitudeMin: '-113.71305',
        ZoomLevel: '11',
    },
    'edmonton, ab': {
        LatitudeMax: '53.71695',
        LongitudeMax: '-113.18368',
        LatitudeMin: '53.39576',
        LongitudeMin: '-113.71305',
        ZoomLevel: '11',
    },
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

// The search API is cross-origin, so the browser performs a preflight for any
// custom header and rejects the request. Only the content type is sent, which
// keeps the call a simple request, and the browser supplies origin, referer,
// cookies, and fingerprint headers itself.
const PAGE_FETCH_HEADERS = {
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
};

const NAVIGATION_TIMEOUT_MS = 60000;
const CLEARANCE_TIMEOUT_MS = 30000;
const PAGE_ATTEMPTS = 2;
const MAX_SESSION_RESTARTS = 3;
const DETAIL_CONCURRENCY = 4;

const DEFAULT_RESULTS_WANTED = 20;
const DEFAULT_MAX_PAGES = 2;
const DEFAULT_RECORDS_PER_PAGE = 50;
const MAX_RECORDS_PER_PAGE = 100;
const DOTNET_EPOCH_OFFSET_TICKS = 621355968000000000;
const DOTNET_TICKS_PER_MILLISECOND = 10000;

const CHALLENGE_PATTERN = /just a moment|checking your browser|security check|contrôle de sécurité|attention required/i;
const BLOCK_PATTERN = /you have been blocked|access denied|accès refusé|error 1020/i;

await Actor.init();

function toPositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return parsed;
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

/** Returns the first value that is not empty; used to prefer richer detail data. */
function firstDefined(...values) {
    return values.find((value) => value !== undefined && value !== null && value !== '');
}

function errorText(error) {
    const message = error?.message ? String(error.message) : String(error);
    return message.split('\n')[0].trim().slice(0, 200);
}

function firstInputUrl(input) {
    const direct = normalizeText(input.startUrl) || normalizeText(input.url);
    if (direct) return direct;
    if (Array.isArray(input.startUrls)) {
        for (const item of input.startUrls) {
            const candidate = typeof item === 'string' ? item : item?.url;
            if (normalizeText(candidate)) return normalizeText(candidate);
        }
    }
    return '';
}

function parseRealtorUrl(rawUrl) {
    const params = {};
    if (!rawUrl) return params;
    try {
        const parsed = new URL(rawUrl);
        const hash = parsed.hash?.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
        for (const [key, value] of new URLSearchParams(hash || '').entries()) {
            if (URL_PARAM_KEYS.has(key) && value !== '') params[key] = value;
        }
        for (const [key, value] of parsed.searchParams.entries()) {
            if (URL_PARAM_KEYS.has(key) && value !== '') params[key] = value;
        }
    } catch (error) {
        log.debug(
            `Could not parse the supplied Realtor.ca URL; using input filters instead. Error: ${errorText(error)}`,
        );
    }
    return params;
}

/**
 * Resolves the search mode. A caller-provided keyword or location wins over the
 * URL, otherwise the supplied URL is used, and the documented default map area
 * is used only when nothing else was provided.
 */
function resolveSearch(input) {
    const resultsWanted = toPositiveInt(input.results_wanted, DEFAULT_RESULTS_WANTED);
    const maxPages = toPositiveInt(input.max_pages, DEFAULT_MAX_PAGES);
    const recordsPerPage = Math.min(
        toPositiveInt(input.records_per_page, DEFAULT_RECORDS_PER_PAGE),
        MAX_RECORDS_PER_PAGE,
        resultsWanted,
    );
    const keyword = normalizeText(input.keyword);
    const location = normalizeText(input.location);
    const suppliedUrl = firstInputUrl(input);
    const includeDetails = input.include_details !== false;
    const locationBounds = location ? LOCATION_BOUNDS[location.toLowerCase()] : undefined;

    let mode = 'url';
    let sourceUrl = suppliedUrl || DEFAULT_START_URL;

    if (keyword) {
        mode = 'keyword';
        sourceUrl = '';
    } else if (location) {
        mode = 'location';
        sourceUrl = '';
    } else if (!suppliedUrl) {
        log.info('No URL, keyword, or location was provided; using the default Canada-wide map area.');
    }

    if (mode !== 'url' && location && !locationBounds) {
        log.warning(`"${location}" is not a supported city shortcut; searching the default Canada-wide area instead.`);
    }

    const params = {
        CultureId: '1',
        ApplicationId: '1',
        Version: '7.0',
        CurrentPage: '1',
        RecordsPerPage: String(recordsPerPage),
        MaximumResults: String(resultsWanted),
        PropertySearchTypeId: '0',
        TransactionTypeId: '2',
        PropertyTypeGroupID: '1',
        Currency: 'CAD',
        Sort: '6-D',
        IncludeHiddenListings: 'false',
        StoreyRange: '0-0',
        ...DEFAULT_BOUNDS,
        ...parseRealtorUrl(sourceUrl),
    };

    if (keyword) params.Keywords = keyword;
    if (mode !== 'url' && locationBounds) Object.assign(params, locationBounds);

    return { params, mode, resultsWanted, maxPages, recordsPerPage, includeDetails };
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
    return `${MAP_PAGE_URL}#${hash.toString()}`;
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

/** Prefers the detail collection when it has entries, otherwise the search collection. */
function pickCollection(preferred, fallback) {
    if (Array.isArray(preferred) && preferred.length) return preferred;
    return Array.isArray(fallback) ? fallback : [];
}

/** Realtor.ca occasionally returns numeric values as strings. */
function toNumberIfNumeric(value) {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return value;
    return Number(trimmed);
}

/** Realtor.ca returns some timestamps as .NET ticks; convert them to ISO strings. */
function toIsoTimestamp(value) {
    const ticks = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
    if (typeof ticks !== 'number' || !Number.isFinite(ticks) || ticks <= DOTNET_EPOCH_OFFSET_TICKS) return value;
    try {
        return new Date((ticks - DOTNET_EPOCH_OFFSET_TICKS) / DOTNET_TICKS_PER_MILLISECOND).toISOString();
    } catch {
        return value;
    }
}

/** Address text uses a pipe between the street line and the city line. */
function splitAddressText(addressText) {
    if (typeof addressText !== 'string' || !addressText.includes('|')) return { full: addressText, street: undefined };
    const [street, ...rest] = addressText
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean);
    return { full: [street, ...rest].join(', '), street };
}

function absoluteRealtorUrl(pathOrUrl) {
    if (!pathOrUrl) return undefined;
    try {
        return new URL(pathOrUrl, 'https://www.realtor.ca').href;
    } catch {
        return undefined;
    }
}

function toPhotoArray(property) {
    if (Array.isArray(property.Photo)) return property.Photo;
    if (property.Photo) return [property.Photo];
    return [];
}

function pickPhotoUrl(photo) {
    return photo.HighResPath || photo.MedResPath || photo.LowResPath || photo.PhotoPath;
}

function photoUrls(property = {}) {
    const photos = toPhotoArray(property);
    if (!photos.length) return undefined;
    const ordered = [...photos].sort((a, b) => Number(a.SequenceId || 0) - Number(b.SequenceId || 0));
    const urls = ordered.map(pickPhotoUrl).filter(Boolean);
    return [...new Set(urls.map(absoluteRealtorUrl).filter(Boolean))];
}

function firstPhotoUrl(property = {}) {
    const urls = photoUrls(property);
    return urls?.[0];
}

function mapListing(listing, details = null) {
    const property = listing.Property || {};
    const detailProperty = details?.Property || {};
    const address = property.Address || detailProperty.Address || {};
    const building = details?.Building || listing.Building || property.Building || {};
    const land = details?.Land || listing.Land || property.Land || {};
    const business = details?.Business || listing.Business || property.Business || {};
    const alternateUrl = listing.AlternateURL || property.AlternateURL || {};
    const agents = pickCollection(details?.Individual, listing.Individual);
    const offices = pickCollection(details?.Office, listing.Office);
    const detailsPath = listing.RelativeDetailsURL || property.RelativeDetailsURL || alternateUrl.DetailsLink;
    const updatedDate = firstDefined(details?.InsertedDateUTC, listing.InsertedDateUTC, listing.TimeOnRealtor);
    const addressParts = splitAddressText(address.AddressText);

    return cleanRecord({
        listing_id: firstDefined(listing.Id, property.PropertyID),
        mls_number: firstDefined(listing.MlsNumber, property.MlsNumber),
        url: absoluteRealtorUrl(detailsPath),
        relative_url: detailsPath,
        price: firstDefined(property.Price, detailProperty.Price),
        price_unformatted: toNumberIfNumeric(
            firstDefined(property.PriceUnformattedValue, detailProperty.PriceUnformattedValue),
        ),
        property_type: firstDefined(property.Type, detailProperty.Type),
        transaction_type: firstDefined(property.TransactionType, detailProperty.TransactionType),
        ownership_type: firstDefined(property.OwnershipType, detailProperty.OwnershipType),
        address: addressParts.full,
        street_address: address.StreetAddress || addressParts.street,
        city: address.City,
        province: firstDefined(address.Province, listing.ProvinceName),
        postal_code: firstDefined(address.PostalCode, listing.PostalCode),
        latitude: toNumberIfNumeric(address.Latitude),
        longitude: toNumberIfNumeric(address.Longitude),
        bedrooms: firstDefined(building.Bedrooms, property.Bedrooms),
        bathrooms: firstDefined(building.BathroomTotal, property.BathroomTotal),
        half_bathrooms: building.HalfBathTotal,
        size_interior: building.SizeInterior,
        stories_total: building.StoriesTotal,
        building_type: building.Type,
        architectural_style: building.ArchitecturalStyle,
        basement_type: building.BasementType,
        constructed_date: building.ConstructedDate,
        land_size: land.SizeTotal,
        parking_type: firstDefined(property.ParkingType, detailProperty.ParkingType),
        parking_spaces: firstDefined(property.ParkingSpaceTotal, detailProperty.ParkingSpaceTotal),
        features: firstDefined(detailProperty.Features, property.Features),
        amenities_nearby: firstDefined(property.AmmenitiesNearBy, detailProperty.AmmenitiesNearBy),
        public_remarks: firstDefined(details?.PublicRemarks, listing.PublicRemarks, property.PublicRemarks),
        photo_url: firstPhotoUrl(detailProperty) || firstPhotoUrl(property),
        photo_urls: photoUrls(detailProperty) || photoUrls(property),
        agents: agents.map((agent) =>
            cleanRecord({
                name: agent.Name,
                position: agent.Position,
                phone: agent.Phones?.[0]?.PhoneNumber,
                email: agent.Emails?.[0]?.ContactId,
                website: agent.Websites?.[0]?.Website,
                organization: agent.Organization?.Name,
            }),
        ),
        offices: offices.map((office) =>
            cleanRecord({
                name: office.Name,
                phone: office.Phones?.[0]?.PhoneNumber,
                website: office.Websites?.[0]?.Website,
                address: office.Address?.AddressText,
            }),
        ),
        business_type: business.BusinessType,
        listed_date: firstDefined(listing.ListedTime, details?.ListedTime, property.ListedTime),
        updated_date: toIsoTimestamp(updatedDate),
    });
}

/** Runs an async worker over items with a bounded number of parallel workers. */
async function mapWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    const queue = items.map((item, index) => ({ item, index }));
    const runners = Array.from({ length: Math.max(Math.min(limit, queue.length), 0) }, async () => {
        let entry = queue.shift();
        while (entry) {
            results[entry.index] = await worker(entry.item);
            entry = queue.shift();
        }
    });
    await Promise.all(runners);
    return results;
}

function browserDirs(root) {
    let entries;
    try {
        entries = readdirSync(root, { withFileTypes: true });
    } catch {
        return [];
    }
    const revisions = entries
        .filter((entry) => entry.isDirectory() && /^chromium(_headless_shell)?-\d+$/.test(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => Number.parseInt(b.split('-').pop(), 10) - Number.parseInt(a.split('-').pop(), 10));
    const executables = [];
    for (const revision of revisions) {
        const base = join(root, revision);
        executables.push(
            join(base, 'chrome-linux64', 'chrome'),
            join(base, 'chrome-linux', 'chrome'),
            join(base, 'chrome-win64', 'chrome.exe'),
            join(base, 'chrome-win', 'chrome.exe'),
            join(base, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
            join(base, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
        );
    }
    return executables;
}

function findChromiumExecutable() {
    const searchRoots = [];
    if (process.env.PLAYWRIGHT_BROWSERS_PATH) searchRoots.push(process.env.PLAYWRIGHT_BROWSERS_PATH);
    const home = process.env.USERPROFILE || process.env.HOME || '';
    if (home) {
        searchRoots.push(join(home, 'AppData', 'Local', 'ms-playwright'), join(home, '.cache', 'ms-playwright'));
    }

    const candidates = [
        ...searchRoots.filter((root) => existsSync(root)).flatMap(browserDirs),
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
    ];
    return candidates.find((candidate) => existsSync(candidate)) || null;
}

function browserProxySettings(proxyUrl) {
    if (!proxyUrl) return undefined;
    try {
        const parsed = new URL(proxyUrl);
        const settings = { server: `${parsed.protocol}//${parsed.host}` };
        if (parsed.username) settings.username = decodeURIComponent(parsed.username);
        if (parsed.password) settings.password = decodeURIComponent(parsed.password);
        return settings;
    } catch (error) {
        log.debug(`Could not parse the proxy URL for the browser session: ${errorText(error)}`);
        return undefined;
    }
}

/**
 * Stealth launch order: real Chrome first, then the patched Chromium build, and
 * headful before headless. Headful profiles are attempted even without a known
 * display, because the Apify Chrome image runs Xvfb and a failed launch only
 * steps to the next profile. No fingerprint headers or user agent are injected,
 * so the browser profile stays internally consistent.
 */
function buildLaunchStrategies(proxy) {
    const executablePath = findChromiumExecutable();
    const strategies = [];
    const add = (name, options) => strategies.push({ name, options: { ...options, ...(proxy ? { proxy } : {}) } });

    add('Chrome (headful)', { channel: 'chrome', headless: false, viewport: null });
    add('Chrome (headless)', { channel: 'chrome', headless: true, viewport: null });
    if (executablePath) {
        add('patched Chromium (headful)', { executablePath, headless: false, viewport: null });
        add('patched Chromium (headless)', { executablePath, headless: true, viewport: null });
    } else {
        add('patched Chromium (headful)', { headless: false, viewport: null });
        add('patched Chromium (headless)', { headless: true, viewport: null });
    }
    return strategies;
}

async function launchStealthContext(profileDir, proxy) {
    let lastError;
    for (const strategy of buildLaunchStrategies(proxy)) {
        try {
            const context = await chromium.launchPersistentContext(profileDir, strategy.options);
            log.info(`Browser session started with the ${strategy.name} profile.`);
            return context;
        } catch (error) {
            lastError = error;
            log.debug(`Browser launch profile "${strategy.name}" is unavailable: ${errorText(error)}`);
        }
    }
    throw new Error(`no browser profile could be started (${errorText(lastError)})`);
}

async function waitForClearance(page) {
    const started = Date.now();
    while (Date.now() - started < CLEARANCE_TIMEOUT_MS) {
        const state = await page
            .evaluate(() => ({ title: document.title, text: (document.body?.innerText || '').slice(0, 400) }))
            .catch(() => null);
        if (state) {
            const sample = `${state.title}\n${state.text}`;
            if (BLOCK_PATTERN.test(sample)) return 'blocked';
            if (state.title && !CHALLENGE_PATTERN.test(sample)) return 'ready';
        }
        await page.waitForTimeout(500);
    }
    return 'timeout';
}

/**
 * Opens a stealth browser session and fetches the internal Realtor.ca search API
 * from inside that session, using the same request the Realtor.ca map page makes.
 */
async function createStealthSession({ mapUrl, proxyUrl }) {
    const proxy = browserProxySettings(proxyUrl);
    const profileDir = mkdtempSync(join(tmpdir(), 'realtor-profile-'));
    const context = await launchStealthContext(profileDir, proxy);
    const page = context.pages()[0] || (await context.newPage());

    async function open() {
        log.info('Opening Realtor.ca in a stealth browser session to establish API access.');
        await page.goto(mapUrl, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });

        const clearance = await waitForClearance(page);
        if (clearance === 'blocked') {
            log.warning('Realtor.ca served a bot-protection block page to this browser session.');
        } else if (clearance === 'timeout') {
            log.warning('Realtor.ca bot protection had not cleared yet; continuing with the API request.');
        }

        const dismiss = page.getByRole('link', { name: 'Dismiss' });
        if (await dismiss.isVisible({ timeout: 5000 }).catch(() => false)) {
            await dismiss.click({ timeout: 5000 }).catch(() => {});
        }
    }

    async function fetchSearch(params) {
        const body = toFormBody(params).toString();
        let lastError = 'the browser session request failed';

        for (let attempt = 1; attempt <= PAGE_ATTEMPTS; attempt++) {
            try {
                const result = await page.evaluate(
                    async ({ url, payload, headers }) => {
                        const response = await fetch(url, {
                            method: 'POST',
                            headers,
                            body: payload,
                            credentials: 'include',
                        });
                        return { ok: response.ok, status: response.status, text: await response.text() };
                    },
                    { url: SEARCH_ENDPOINT, payload: body, headers: PAGE_FETCH_HEADERS },
                );

                if (result.ok) {
                    try {
                        const data = JSON.parse(result.text);
                        if (Array.isArray(data?.Results)) return { data };
                        return { blocked: true, error: 'the response did not contain a property result list' };
                    } catch (error) {
                        return { blocked: true, error: `invalid JSON response: ${errorText(error)}` };
                    }
                }

                lastError = `HTTP ${result.status}`;
                if (result.status !== 429 && result.status < 500) break;
            } catch (error) {
                lastError = `in-page request failed: ${errorText(error)}`;
            }

            if (attempt < PAGE_ATTEMPTS) await page.waitForTimeout(1000 * attempt);
        }

        return { blocked: true, error: lastError };
    }

    async function fetchDetails(listing) {
        const propertyId = listing.Id;
        const referenceNumber = listing.MlsNumber;
        if (!propertyId || !referenceNumber) return null;

        const url = new URL(DETAIL_ENDPOINT);
        url.searchParams.set('ApplicationId', '1');
        url.searchParams.set('CultureId', '1');
        url.searchParams.set('PropertyID', String(propertyId));
        url.searchParams.set('ReferenceNumber', String(referenceNumber));
        url.searchParams.set('PreferedMeasurementUnit', '1');
        url.searchParams.set('HashCode', '0');

        try {
            const result = await page.evaluate(async (endpoint) => {
                const response = await fetch(endpoint, { credentials: 'include' });
                return { ok: response.ok, status: response.status, text: await response.text() };
            }, url.href);

            if (!result.ok) {
                log.debug(`Detail record for ${propertyId} returned HTTP ${result.status}.`);
                return null;
            }

            const parsed = JSON.parse(result.text);
            const details = Array.isArray(parsed) ? parsed[0] : parsed;
            if (!details?.Property && !details?.Building) return null;
            return details;
        } catch (error) {
            log.debug(`Detail record for ${propertyId} could not be loaded: ${errorText(error)}`);
            return null;
        }
    }

    async function close() {
        await context
            .close()
            .catch((error) => log.debug(`Could not close the browser session cleanly: ${errorText(error)}`));
        try {
            rmSync(profileDir, { recursive: true, force: true });
        } catch (error) {
            log.debug(`Could not remove the temporary browser profile: ${errorText(error)}`);
        }
    }

    return { open, fetchSearch, fetchDetails, close };
}

async function main() {
    const input = (await Actor.getInput()) || {};
    const { params, mode, resultsWanted, maxPages, recordsPerPage, includeDetails } = resolveSearch(input);

    const rawProxyConfiguration = input.proxyConfiguration;
    const hasCustomProxyUrls =
        Array.isArray(rawProxyConfiguration?.proxyUrls) && rawProxyConfiguration.proxyUrls.length > 0;
    const wantsApifyProxy =
        rawProxyConfiguration?.useApifyProxy === true ||
        (Array.isArray(rawProxyConfiguration?.apifyProxyGroups) && rawProxyConfiguration.apifyProxyGroups.length > 0);
    let proxyConfiguration;
    if (hasCustomProxyUrls) {
        proxyConfiguration = await Actor.createProxyConfiguration(rawProxyConfiguration);
    } else if (wantsApifyProxy) {
        if (Actor.isAtHome() || process.env.APIFY_PROXY_PASSWORD) {
            proxyConfiguration = await Actor.createProxyConfiguration(rawProxyConfiguration);
        } else {
            log.warning(
                'Apify Proxy settings were provided, but Apify Proxy requires a cloud run or proxy credentials. Continuing without a proxy.',
            );
        }
    }

    // One proxy session and one browser profile are reused for the whole flow and
    // replaced together when the target blocks the session.
    const newSessionId = () => `realtor_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const newProxyUrl = async () => (proxyConfiguration ? proxyConfiguration.newUrl(newSessionId()) : undefined);

    const pageParams = (page) => ({
        ...params,
        CurrentPage: String(page),
        RecordsPerPage: String(recordsPerPage),
        MaximumResults: String(resultsWanted),
    });

    let session;
    let sessionRestarts = 0;

    async function openSession() {
        if (session) await session.close();
        session = await createStealthSession({ mapUrl: buildMapUrl(params), proxyUrl: await newProxyUrl() });
        await session.open();
    }

    async function restartSession() {
        if (sessionRestarts >= MAX_SESSION_RESTARTS) return false;
        sessionRestarts++;
        log.warning(
            `Rotating the proxy session and browser profile (attempt ${sessionRestarts}/${MAX_SESSION_RESTARTS}).`,
        );
        await openSession();
        return true;
    }

    async function fetchPage(page) {
        let result = await session.fetchSearch(pageParams(page));
        if (!result.data && (await restartSession())) {
            result = await session.fetchSearch(pageParams(page));
        }
        return result;
    }

    log.info(
        `Starting Realtor.ca extraction in ${mode} mode. Results wanted: ${resultsWanted}, max pages: ${maxPages}, records per page: ${recordsPerPage}, detail records: ${includeDetails ? 'enabled' : 'disabled'}.`,
    );

    let saved = 0;
    let pagesProcessed = 0;
    let stopReason = 'reached the requested result count';
    const seen = new Set();

    try {
        await openSession();

        for (let page = 1; page <= maxPages && saved < resultsWanted; page++) {
            const result = await fetchPage(page);

            if (!result.data) {
                stopReason = `stopped at page ${page}: ${result.error}`;
                if (page === 1) throw new Error(`Realtor.ca search could not be reached (${result.error}).`);
                log.warning(`Stopping pagination. ${result.error}`);
                break;
            }

            pagesProcessed = page;
            const listings = result.data.Results;

            if (!listings.length) {
                stopReason = 'no more listings were returned';
                break;
            }

            const batch = [];
            for (const listing of listings) {
                if (saved + batch.length >= resultsWanted) break;
                const key = listing.MlsNumber || listing.Id || JSON.stringify(listing).slice(0, 200);
                if (seen.has(key)) continue;
                seen.add(key);
                batch.push(listing);
            }

            if (batch.length) {
                let detailFailures = 0;
                const activeSession = session;
                const details = includeDetails
                    ? await mapWithConcurrency(batch, DETAIL_CONCURRENCY, async (listing) => {
                          const detail = await activeSession.fetchDetails(listing);
                          if (!detail) detailFailures += 1;
                          return detail;
                      })
                    : batch.map(() => null);

                await Actor.pushData(batch.map((listing, index) => mapListing(listing, details[index])));
                saved += batch.length;
                if (detailFailures) {
                    log.warning(
                        `Saved ${saved}/${resultsWanted} listings. ${detailFailures} of ${batch.length} detail records could not be loaded and were saved with search data only.`,
                    );
                } else {
                    log.info(`Saved ${saved}/${resultsWanted} listings.`);
                }
            }

            const paging = result.data.Paging || {};
            const totalPages = Number(paging.TotalPages || paging.TotalPagesCount || 0);
            if (totalPages && page >= totalPages) {
                stopReason = 'reached the last available result page';
                break;
            }
            if (listings.length < recordsPerPage) {
                stopReason = 'the last page contained fewer listings than requested';
                break;
            }
            if (page === maxPages) stopReason = 'reached the max pages limit';
        }
    } finally {
        if (session) await session.close();
    }

    if (saved === 0) {
        throw new Error(
            `No Realtor.ca listings were saved (${stopReason}). Try a wider Realtor.ca map URL or different filters.`,
        );
    }

    log.info(`Finished. Saved ${saved} listings across ${pagesProcessed} page(s). Stop reason: ${stopReason}.`);
    return saved;
}

try {
    await main();
} catch (error) {
    await Actor.fail(`Realtor.ca extraction failed: ${errorText(error)}`);
}
await Actor.exit();
