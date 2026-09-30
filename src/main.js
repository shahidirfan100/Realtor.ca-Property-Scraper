import { Actor, log } from 'apify';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs';
import { Impit } from 'impit';
import { tmpdir } from 'os';
import { chromium } from 'patchright';
import { join } from 'path';

const SEARCH_ENDPOINT = 'https://api2.realtor.ca/Listing.svc/AsyncPropertySearch_Post';
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
const HTTP_REQUEST_TIMEOUT_MS = 30000;
const CLEARANCE_TIMEOUT_MS = 10000;
const CLEARANCE_POLL_MS = 500;
const RETRY_PAUSE_MS = 1000;
const DISMISS_TIMEOUT_MS = 2000;
const PAGE_ATTEMPTS = 2;
const MAX_SESSION_RESTARTS = 3;
const GALLERY_CONCURRENCY = 10;
const GALLERY_PROBE_BATCH = 4;
const PHOTO_PROBE_TIMEOUT_MS = 15000;
const MAX_GALLERY_PHOTOS = 256;
const SEARCH_RECORDS_PER_PAGE = 100;

const DEFAULT_RESULTS_WANTED = 20;
const DEFAULT_MAX_PAGES = 2;
const DOTNET_EPOCH_OFFSET_TICKS = 621355968000000000;
const DOTNET_TICKS_PER_MILLISECOND = 10000;

const CHALLENGE_PATTERN = /just a moment|checking your browser|security check|contrôle de sécurité|attention required/i;
const BLOCK_PATTERN = /you have been blocked|access denied|accès refusé|error 1020/i;
const PLACEHOLDER_PHOTO_PATTERN = /placeholder/i;

// The HTTP client must present a TLS profile close to the browser that solved the
// bot check, so the newest profile at or below the browser version is selected.
const CHROME_PROFILES = [
    { version: 151, name: 'chrome151' },
    { version: 142, name: 'chrome142' },
    { version: 136, name: 'chrome136' },
    { version: 131, name: 'chrome131' },
    { version: 125, name: 'chrome125' },
    { version: 124, name: 'chrome124' },
    { version: 116, name: 'chrome116' },
    { version: 110, name: 'chrome110' },
    { version: 107, name: 'chrome107' },
    { version: 104, name: 'chrome104' },
    { version: 101, name: 'chrome101' },
    { version: 100, name: 'chrome100' },
];

await Actor.init();

function toPositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return parsed;
}

function toPositiveNumber(value, fallback) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
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

/** Picks the impersonation profile closest to the browser that established the session. */
function chromeProfileFor(userAgent) {
    const major = Number.parseInt(String(userAgent).match(/Chrome\/(\d+)/)?.[1] || '', 10);
    if (!Number.isFinite(major)) return CHROME_PROFILES[0].name;
    return (CHROME_PROFILES.find((profile) => profile.version <= major) || CHROME_PROFILES[CHROME_PROFILES.length - 1])
        .name;
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

/** Resolves the search filters that Realtor.ca accepts as range parameters. */
function buildFilterParams(input) {
    const filters = {};
    const beds = toPositiveInt(input.beds, 0);
    const baths = toPositiveInt(input.baths, 0);
    if (beds) filters.BedRange = `${beds}-0`;
    if (baths) filters.BathRange = `${baths}-0`;

    const priceMin = toPositiveInt(input.price_min, 0);
    const priceMax = toPositiveInt(input.price_max, 0);
    if (priceMin) filters.PriceMin = String(priceMin);
    if (priceMax) filters.PriceMax = String(priceMax);

    const sizeMin = toPositiveInt(input.size_min, 0);
    const sizeMax = toPositiveInt(input.size_max, 0);
    if (sizeMin || sizeMax) filters.BuildingSizeRange = `${sizeMin}-${sizeMax}`;

    const landMin = toPositiveNumber(input.land_min, 0);
    const landMax = toPositiveNumber(input.land_max, 0);
    if (landMin || landMax) filters.LandSizeRange = `${landMin}-${landMax}`;

    return filters;
}

/**
 * Resolves the search mode. A caller-provided location wins over the URL,
 * otherwise the supplied URL is used, and the documented default map area is
 * used only when nothing else was provided.
 */
function resolveSearch(input) {
    const resultsWanted = toPositiveInt(input.results_wanted, DEFAULT_RESULTS_WANTED);
    const maxPages = toPositiveInt(input.max_pages, DEFAULT_MAX_PAGES);
    const recordsPerPage = Math.min(SEARCH_RECORDS_PER_PAGE, resultsWanted);
    const location = normalizeText(input.location);
    const suppliedUrl = firstInputUrl(input);
    const locationBounds = location ? LOCATION_BOUNDS[location.toLowerCase()] : undefined;

    let mode = 'url';
    let sourceUrl = suppliedUrl || DEFAULT_START_URL;

    if (location) {
        mode = 'location';
        sourceUrl = '';
    } else if (!suppliedUrl) {
        log.info('No URL or location was provided; using the default Canada-wide map area.');
    }

    if (mode === 'location' && !locationBounds) {
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
        ...buildFilterParams(input),
    };

    if (mode === 'location' && locationBounds) Object.assign(params, locationBounds);

    return { params, mode, resultsWanted, maxPages, recordsPerPage };
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

/** First photo object from a search or detail property record. */
function firstPhotoObject(property = {}) {
    return toPhotoArray(property)[0];
}

/** Splits a photo path into its base and sequence number so the gallery can be derived. */
function photoSequenceParts(photo) {
    const path = pickPhotoUrl(photo);
    if (!path || PLACEHOLDER_PHOTO_PATTERN.test(path)) return null;
    const match = path.match(/^(.*_)(\d+)(\.[A-Za-z0-9]+)$/);
    if (!match) return null;
    return {
        base: match[1],
        extension: match[3],
        sequence: Number.parseInt(match[2], 10) || 1,
        build: (n) => `${match[1]}${n}${match[3]}`,
    };
}

function photoUrls(property = {}) {
    const photos = toPhotoArray(property);
    if (!photos.length) return undefined;
    const ordered = [...photos].sort((a, b) => Number(a.SequenceId || 0) - Number(b.SequenceId || 0));
    const urls = ordered.map(pickPhotoUrl).filter((url) => url && !PLACEHOLDER_PHOTO_PATTERN.test(url));
    if (!urls.length) return undefined;
    return [...new Set(urls.map(absoluteRealtorUrl).filter(Boolean))];
}

function mapListing(listing, galleryUrls = null) {
    const property = listing.Property || {};
    const address = property.Address || {};
    const building = listing.Building || property.Building || {};
    const land = listing.Land || property.Land || {};
    const business = listing.Business || property.Business || {};
    const alternateUrl = listing.AlternateURL || property.AlternateURL || {};
    const agents = pickCollection(listing.Individual, []);
    const offices = pickCollection(listing.Office, []);
    const detailsPath = listing.RelativeDetailsURL || property.RelativeDetailsURL || alternateUrl.DetailsLink;
    const addressParts = splitAddressText(address.AddressText);
    const photos = galleryUrls?.length ? galleryUrls : photoUrls(property);
    const media = (Array.isArray(listing.Media) ? listing.Media : [])
        .filter((entry) => entry?.MediaCategoryURL)
        .sort((a, b) => Number(a.Order || 0) - Number(b.Order || 0))
        .map((entry) => cleanRecord({ type: entry.Description, url: absoluteRealtorUrl(entry.MediaCategoryURL) }));

    return cleanRecord({
        listing_id: firstDefined(listing.Id, property.PropertyID),
        mls_number: firstDefined(listing.MlsNumber, property.MlsNumber),
        url: absoluteRealtorUrl(detailsPath),
        relative_url: detailsPath,
        price: property.Price,
        price_unformatted: toNumberIfNumeric(property.PriceUnformattedValue),
        price_changed_date: toIsoTimestamp(
            firstDefined(property.PriceChangeTagDateUTC, property.PriceChangeTimeOnRealtor),
        ),
        property_type: property.Type,
        transaction_type: property.TransactionType,
        ownership_type: property.OwnershipType,
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
        building_amenities: building.Ammenities,
        land_size: land.SizeTotal,
        land_frontage: land.SizeFrontage,
        parking_type: property.ParkingType,
        parking_spaces: property.ParkingSpaceTotal,
        features: property.Features,
        amenities_nearby: property.AmmenitiesNearBy,
        public_remarks: listing.PublicRemarks || property.PublicRemarks,
        photo_url: photos?.[0],
        photo_urls: photos,
        media,
        agents: agents.map((agent) =>
            cleanRecord({
                name: agent.Name,
                position: agent.Position,
                phone: agent.Phones?.[0]?.PhoneNumber,
                email: agent.Emails?.[0]?.ContactId,
                website: agent.Websites?.[0]?.Website,
                organization: agent.Organization?.Name,
                photo_url: absoluteRealtorUrl(firstDefined(agent.PhotoHighRes, agent.Photo)),
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
        listed_date: firstDefined(listing.ListedTime, property.ListedTime),
        updated_date: toIsoTimestamp(firstDefined(listing.InsertedDateUTC, listing.TimeOnRealtor)),
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

/** Probes several sequences at once; returns null when a probe fails transiently. */
async function probeSequences(probe, build, sequences) {
    const results = await Promise.all(sequences.map(async (sequence) => [sequence, await probe(build(sequence))]));
    if (results.some(([, found]) => found === null)) return null;
    return results;
}

/**
 * Resolves the full photo gallery from the public image service. The single
 * search photo already carries the sequence pattern, so the highest existing
 * sequence is found with a few parallel probe rounds instead of a detail record
 * for every listing. Probes run in small parallel batches to keep the round-trip
 * count low without hammering the service.
 */
async function deriveGalleryFromCdn(probe, photo) {
    const parts = photoSequenceParts(photo);
    if (!parts) return undefined;
    if ((await probe(parts.build(parts.sequence))) !== true) return undefined;

    // Bracket the gallery size with one parallel ladder of probes.
    const ladder = [8, 24, 48, 80, 120, MAX_GALLERY_PHOTOS].filter((sequence) => sequence > parts.sequence);
    const ladderResults = await probeSequences(probe, parts.build, ladder);
    if (!ladderResults) return undefined;

    let low = parts.sequence;
    let high = MAX_GALLERY_PHOTOS + 1;
    for (const [sequence, found] of ladderResults) {
        if (found) low = Math.max(low, sequence);
        else high = Math.min(high, sequence);
    }

    // Narrow the bracket in parallel rounds until the size is exact.
    while (high - low > 1) {
        const step = Math.ceil((high - low) / (GALLERY_PROBE_BATCH + 1));
        const candidates = [];
        for (let index = 1; index <= GALLERY_PROBE_BATCH; index += 1) {
            const sequence = low + step * index;
            if (sequence > low && sequence < high) candidates.push(sequence);
        }
        if (!candidates.length) break;

        const results = await probeSequences(probe, parts.build, candidates);
        if (!results) return undefined;
        for (const [sequence, found] of results) {
            if (found) low = Math.max(low, sequence);
            else high = Math.min(high, sequence);
        }
    }

    return Array.from({ length: low }, (unused, index) => parts.build(index + 1));
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

async function waitForClearance(page, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const state = await page
            .evaluate(() => ({ title: document.title, text: (document.body?.innerText || '').slice(0, 400) }))
            .catch(() => null);
        if (state) {
            const sample = `${state.title}\n${state.text}`;
            if (BLOCK_PATTERN.test(sample)) return 'blocked';
            if (state.title && !CHALLENGE_PATTERN.test(sample)) return 'ready';
        }
        await page.waitForTimeout(CLEARANCE_POLL_MS);
    }
    return 'timeout';
}

/** Validates a search payload and rejects throttled or partial responses. */
function validateSearchPayload(data) {
    if (!Array.isArray(data?.Results)) return { error: 'the response did not contain a property result list' };
    if (data.Results.length) return { data };

    // An empty list is only trusted when the payload states that nothing matched.
    const totalRecords = Number(data?.Paging?.TotalRecords);
    if (data?.Paging && Number.isFinite(totalRecords) && totalRecords === 0) {
        log.debug('Search returned no matching listings.');
        return { data };
    }
    return { error: 'the response returned no listings without reporting a match count' };
}

/**
 * Bootstraps a stealth browser session once, then reuses that exact session
 * (cookies, user agent, proxy exit) for fast direct requests. The browser stays
 * available to refresh an expired bot-check clearance or to fetch in-page when a
 * direct request is refused.
 */
async function createStealthSession({ mapUrl, proxyUrl }) {
    const proxy = browserProxySettings(proxyUrl);
    const profileDir = mkdtempSync(join(tmpdir(), 'realtor-profile-'));
    const launchStarted = Date.now();
    const context = await launchStealthContext(profileDir, proxy);
    log.info(`Browser launch completed in ${Date.now() - launchStarted}ms.`);
    const page = context.pages()[0] || (await context.newPage());
    const cookieJar = new Map();
    let httpClient = null;
    let apiHeaders = null;

    const cookieHeader = () => [...cookieJar].map(([name, value]) => `${name}=${value}`).join('; ');

    /** Keeps the cookie jar in sync with cookies rotated by the target. */
    function storeResponseCookies(headers) {
        const raw = typeof headers?.getSetCookie === 'function' ? headers.getSetCookie() : [];
        if (!raw?.length) return;
        for (const entry of raw) {
            const pair = String(entry).split(';')[0];
            const separator = pair.indexOf('=');
            if (separator > 0) cookieJar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
        }
        if (apiHeaders) apiHeaders.cookie = cookieHeader();
    }

    /** Copies the browser cookies and user agent to the direct HTTP client. */
    async function captureSession() {
        const cookies = await context.cookies().catch(() => []);
        for (const cookie of cookies) {
            if (!/(^|\.)realtor\.ca$/.test(cookie.domain)) continue;
            cookieJar.set(cookie.name, cookie.value);
        }

        const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => '');
        apiHeaders = {
            ...(cookieJar.size ? { cookie: cookieHeader() } : {}),
            ...(userAgent ? { 'user-agent': userAgent } : {}),
        };

        if (!httpClient) {
            httpClient = new Impit({
                browser: chromeProfileFor(userAgent),
                timeout: HTTP_REQUEST_TIMEOUT_MS,
                ...(proxyUrl ? { proxyUrl } : {}),
            });
        }
        return userAgent;
    }

    async function loadMapPage() {
        // Clearance, not deferred map scripts, determines when HTTP requests can start.
        await page.goto(mapUrl, { waitUntil: 'commit', timeout: NAVIGATION_TIMEOUT_MS });
        await waitForClearance(page, CLEARANCE_TIMEOUT_MS);
        const dismiss = page.getByRole('link', { name: 'Dismiss' });
        if (await dismiss.isVisible({ timeout: DISMISS_TIMEOUT_MS }).catch(() => false)) {
            await dismiss.click({ timeout: DISMISS_TIMEOUT_MS }).catch(() => {});
        }
    }

    async function open() {
        log.info('Opening Realtor.ca in a stealth browser session to establish API access.');
        const started = Date.now();
        await loadMapPage();
        const userAgent = await captureSession();
        log.info(
            `Session established in ${Date.now() - started}ms. Direct requests are ready with the ${chromeProfileFor(userAgent)} profile.`,
        );
    }

    /** Reloads the map page to refresh an expired bot-check clearance. */
    async function refreshSession() {
        try {
            await loadMapPage();
            await captureSession();
            return true;
        } catch (error) {
            log.debug(`Session refresh failed: ${errorText(error)}`);
            return false;
        }
    }

    /** Direct request through the bootstrapped session; returns null when it cannot be sent. */
    async function directRequest(url, options = {}) {
        if (!httpClient) return null;
        try {
            const response = await httpClient.fetch(url, {
                ...options,
                headers: { ...apiHeaders, ...options.headers },
            });
            storeResponseCookies(response.headers);
            return response;
        } catch (error) {
            log.debug(`Direct request failed: ${errorText(error)}`);
            return null;
        }
    }

    async function searchDirect(body) {
        const started = Date.now();
        const response = await directRequest(SEARCH_ENDPOINT, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body,
        });
        if (!response) return { error: 'the direct request could not be sent' };
        if (!response.ok) return { error: `HTTP ${response.status}` };
        try {
            const outcome = validateSearchPayload(JSON.parse(await response.text()));
            if (outcome.data) {
                log.debug(
                    `Search page ${body.match(/CurrentPage=(\d+)/)?.[1] || '?'} fetched directly in ${Date.now() - started}ms.`,
                );
            }
            return outcome;
        } catch (error) {
            return { error: `invalid JSON response: ${errorText(error)}` };
        }
    }

    /** Fallback used only when direct requests are refused. */
    async function searchInPage(body) {
        const started = Date.now();
        try {
            const result = await page.evaluate(
                async ({ url, payload, headers, timeoutMs }) => {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), timeoutMs);
                    try {
                        const response = await fetch(url, {
                            method: 'POST',
                            headers,
                            body: payload,
                            credentials: 'include',
                            signal: controller.signal,
                        });
                        return { ok: response.ok, status: response.status, text: await response.text() };
                    } finally {
                        clearTimeout(timer);
                    }
                },
                {
                    url: SEARCH_ENDPOINT,
                    payload: body,
                    headers: PAGE_FETCH_HEADERS,
                    timeoutMs: HTTP_REQUEST_TIMEOUT_MS,
                },
            );

            if (!result.ok) return { error: `HTTP ${result.status}` };

            try {
                const outcome = validateSearchPayload(JSON.parse(result.text));
                if (outcome.data) log.debug(`Search page fetched in-page in ${Date.now() - started}ms.`);
                return outcome;
            } catch (error) {
                return { error: `invalid JSON response: ${errorText(error)}` };
            }
        } catch (error) {
            return { error: `in-page request failed: ${errorText(error)}` };
        }
    }

    async function fetchSearch(params) {
        const body = toFormBody(params).toString();
        let lastError = 'the session request failed';

        for (let attempt = 1; attempt <= PAGE_ATTEMPTS; attempt++) {
            const direct = await searchDirect(body);
            if (direct.data) return direct;
            lastError = direct.error;

            log.warning(`Direct search request failed (${lastError}); trying the browser session.`);
            const inPage = await searchInPage(body);
            if (inPage.data) {
                // Browser requests may rotate API cookies; use them on the next direct request.
                await captureSession();
                return inPage;
            }
            lastError = inPage.error || lastError;

            if (attempt === PAGE_ATTEMPTS) break;

            log.debug(`Search request failed (${lastError}); refreshing the session.`);
            await refreshSession();
            await page.waitForTimeout(RETRY_PAUSE_MS);
        }

        return { blocked: true, error: lastError };
    }

    /** Checks that a photo exists, using the direct client first. */
    async function photoExists(url) {
        const direct = await directRequest(url, { method: 'HEAD' });
        if (direct) {
            if (direct.status === 200) return true;
            if (direct.status === 404) return false;
            return null;
        }

        try {
            const fallback = await context.request.head(url, { timeout: PHOTO_PROBE_TIMEOUT_MS });
            if (fallback.status() === 200) return true;
            if (fallback.status() === 404) return false;
            return null;
        } catch {
            return null;
        }
    }

    /** Derives the complete photo gallery from the public image service. */
    async function photoGallery(listing) {
        return deriveGalleryFromCdn(photoExists, firstPhotoObject(listing.Property));
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

    return { open, fetchSearch, photoGallery, close };
}

async function main() {
    const input = (await Actor.getInput()) || {};
    const { params, mode, resultsWanted, maxPages, recordsPerPage } = resolveSearch(input);

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
        `Starting Realtor.ca extraction in ${mode} mode. Results wanted: ${resultsWanted}, max pages: ${maxPages}.`,
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
                const activeSession = session;

                // Galleries are completed from the image service, so no listing page
                // or detail record has to be requested.
                const galleryStarted = Date.now();
                const galleries = await mapWithConcurrency(batch, GALLERY_CONCURRENCY, (listing) =>
                    activeSession.photoGallery(listing),
                );
                log.debug(`Photo galleries for ${batch.length} listings completed in ${Date.now() - galleryStarted}ms.`);

                await Actor.pushData(batch.map((listing, index) => mapListing(listing, galleries[index])));
                saved += batch.length;
                log.info(`Saved ${saved}/${resultsWanted} listings.`);
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
