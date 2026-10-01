import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    input: {},
    cookies: [],
    direct: vi.fn(),
    browserFetch: vi.fn(),
    goto: vi.fn(),
    close: vi.fn(),
    pushData: vi.fn(),
    fail: vi.fn(),
    clientOptions: [],
    launchOptions: [],
    newProxyUrl: vi.fn(),
}));

vi.mock('apify', () => ({
    Actor: {
        init: vi.fn(),
        getInput: async () => mocks.input,
        createProxyConfiguration: vi.fn(async () => ({ newUrl: mocks.newProxyUrl })),
        isAtHome: () => false,
        pushData: mocks.pushData,
        fail: mocks.fail,
        exit: vi.fn(),
    },
    log: { info: vi.fn(), debug: vi.fn(), warning: vi.fn() },
}));

vi.mock('impit', () => ({
    Impit: class {
        constructor(options) {
            mocks.clientOptions.push(options);
        }

        fetch(...args) {
            return mocks.direct(...args);
        }
    },
}));

vi.mock('patchright', () => ({
    chromium: {
        launchPersistentContext: async (profileDir, options) => {
            mocks.launchOptions.push({ profileDir, options });
            return {
                pages: () => [
                    {
                        goto: mocks.goto,
                        getByRole: () => ({ isVisible: async () => false }),
                        waitForTimeout: async () => {},
                        evaluate: async (callback, args) => {
                            if (args) return mocks.browserFetch(callback, args);
                            if (callback.toString().includes('navigator.userAgent')) return 'Chrome/151.0.0.0';
                            return { title: 'REALTOR.ca', text: 'Map search' };
                        },
                    },
                ],
                cookies: async () => mocks.cookies,
                close: mocks.close,
            };
        },
    },
}));

vi.mock('timers/promises', () => ({ setTimeout: vi.fn(async () => {}) }));

function payload(count, firstId = 1, totalPages = 1) {
    return {
        Results: Array.from({ length: count }, (unused, index) => ({
            Id: firstId + index,
            Property: { Price: '$500,000', Photo: { HighResPath: 'https://cdn.realtor.ca/placeholder.jpg' } },
        })),
        Paging: { TotalRecords: count, TotalPages: totalPages },
    };
}

function response(data, status = 200) {
    return { ok: status === 200, status, headers: new Headers(), text: async () => JSON.stringify(data) };
}

beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.goto.mockReset();
    mocks.newProxyUrl.mockReset();
    mocks.newProxyUrl.mockImplementation(async (sessionId) => `http://${sessionId}:password@proxy.example.test:8000`);
    mocks.direct.mockReset();
    mocks.browserFetch.mockReset();
    mocks.close.mockResolvedValue(undefined);
    mocks.input = { location: 'Toronto', results_wanted: 2, max_pages: 1 };
    mocks.cookies = [{ domain: '.realtor.ca', name: 'cf_clearance', value: 'initial' }];
    mocks.clientOptions.length = 0;
    mocks.launchOptions.length = 0;
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('browser bootstrap and direct request handoff', () => {
    it.each([
        { name: 'omitted search', input: {}, latitude: '60.60705', results: '20', pages: 2 },
        {
            name: 'URL-only search',
            input: {
                startUrl: 'https://www.realtor.ca/map#LatitudeMax=49.36270&Sort=1-A',
                results_wanted: 1,
                max_pages: 1,
            },
            latitude: '49.36270',
            results: '1',
            pages: 1,
            sort: '1-A',
        },
        {
            name: 'location precedence over the default URL',
            input: { location: ' Toronto ', startUrl: 'https://www.realtor.ca/map#LatitudeMax=49.36270&Sort=1-A' },
            latitude: '43.85546',
            results: '20',
            pages: 2,
        },
        {
            name: 'blank search values',
            input: { location: ' ', startUrl: ' ' },
            latitude: '60.60705',
            results: '20',
            pages: 2,
        },
    ])('preserves $name through startup recovery', async ({ input, latitude, results, pages, sort }) => {
        mocks.input = input;
        mocks.goto.mockRejectedValueOnce(new Error('page.goto: net::ERR_TIMED_OUT'));
        mocks.direct.mockResolvedValue(response(payload(Number(results))));
        await import('./main.js');

        const body = new URLSearchParams(mocks.direct.mock.calls[0][1].body);
        expect(body.get('LatitudeMax')).toBe(latitude);
        expect(body.get('MaximumResults')).toBe(results);
        expect(body.get('Sort')).toBe(sort || '6-D');
        expect(mocks.goto).toHaveBeenCalledTimes(2);
        expect(mocks.goto.mock.calls[0][0]).toBe(mocks.goto.mock.calls[1][0]);
        expect(mocks.pushData.mock.calls[0][0]).toHaveLength(Number(results));
        expect(mocks.fail).not.toHaveBeenCalled();
        const { log } = await import('apify');
        expect(log.info).toHaveBeenCalledWith(expect.stringContaining(`max pages: ${pages}.`));
    });
    it('starts at document commit and uses Impit without browser fetch on a healthy session', async () => {
        mocks.direct.mockResolvedValue(response(payload(2)));
        await import('./main.js');

        expect(mocks.goto).toHaveBeenCalledWith(expect.stringContaining('LatitudeMax=43.85546'), {
            waitUntil: 'commit',
            timeout: 60000,
        });
        expect(mocks.clientOptions).toHaveLength(1);
        expect(mocks.clientOptions[0].browser).toBe('chrome151');
        expect(mocks.browserFetch).not.toHaveBeenCalled();
        expect(mocks.pushData.mock.calls[0][0]).toHaveLength(2);
        expect(mocks.fail).not.toHaveBeenCalled();
        expect(mocks.close).toHaveBeenCalledOnce();
    });

    it('recovers from the cloud navigation timeout with a fresh paired browser and proxy session', async () => {
        mocks.input.proxyConfiguration = { proxyUrls: ['http://proxy.example.test:8000'] };
        mocks.goto.mockRejectedValueOnce(new Error('page.goto: net::ERR_TIMED_OUT at https://www.realtor.ca/map'));
        mocks.direct.mockResolvedValue(response(payload(2)));
        await import('./main.js');

        expect(mocks.goto).toHaveBeenCalledTimes(2);
        expect(mocks.goto.mock.calls[0][0]).toBe(mocks.goto.mock.calls[1][0]);
        expect(mocks.newProxyUrl).toHaveBeenCalledTimes(2);
        expect(mocks.launchOptions[0].profileDir).not.toBe(mocks.launchOptions[1].profileDir);
        const initialProxy = mocks.launchOptions[0].options.proxy;
        const recoveredProxy = mocks.launchOptions[1].options.proxy;
        expect(initialProxy.username).not.toBe(recoveredProxy.username);
        expect(new URL(mocks.clientOptions[0].proxyUrl).username).toBe(recoveredProxy.username);
        expect(mocks.pushData.mock.calls[0][0]).toHaveLength(2);
        expect(mocks.fail).not.toHaveBeenCalled();
        expect(mocks.close).toHaveBeenCalledTimes(2);
    });

    it('fails and closes every browser after exhausting startup navigation retries', async () => {
        mocks.goto.mockRejectedValue(new Error('page.goto: net::ERR_TIMED_OUT'));
        await import('./main.js');

        expect(mocks.goto).toHaveBeenCalledTimes(4);
        expect(mocks.close).toHaveBeenCalledTimes(4);
        expect(mocks.direct).not.toHaveBeenCalled();
        expect(mocks.pushData).not.toHaveBeenCalled();
        expect(mocks.fail).toHaveBeenCalledWith(expect.stringContaining('exhausting 3 session restarts'));
    });

    it('recovers from a Playwright navigation timeout', async () => {
        mocks.goto.mockRejectedValueOnce(
            Object.assign(new Error('page.goto: Timeout 60000ms exceeded'), {
                name: 'TimeoutError',
            }),
        );
        mocks.direct.mockResolvedValue(response(payload(2)));
        await import('./main.js');

        expect(mocks.goto).toHaveBeenCalledTimes(2);
        expect(mocks.fail).not.toHaveBeenCalled();
    });

    it('does not retry a permanent navigation error', async () => {
        mocks.goto.mockRejectedValue(new Error('page.goto: net::ERR_CERT_AUTHORITY_INVALID'));
        await import('./main.js');

        expect(mocks.goto).toHaveBeenCalledOnce();
        expect(mocks.close).toHaveBeenCalledOnce();
        expect(mocks.fail).toHaveBeenCalledWith(expect.stringContaining('ERR_CERT_AUTHORITY_INVALID'));
    });

    it('shares the restart budget between startup and later search recovery', async () => {
        mocks.goto
            .mockRejectedValueOnce(new Error('page.goto: net::ERR_CONNECTION_RESET'))
            .mockRejectedValueOnce(new Error('page.goto: net::ERR_TIMED_OUT'))
            .mockRejectedValueOnce(new Error('page.goto: net::ERR_TIMED_OUT'));
        mocks.direct.mockResolvedValue(response({}, 403));
        mocks.browserFetch.mockResolvedValue({ ok: false, status: 403, text: '' });
        await import('./main.js');

        expect(mocks.launchOptions).toHaveLength(4);
        expect(mocks.close).toHaveBeenCalledTimes(4);
        expect(mocks.direct).toHaveBeenCalledTimes(2);
        expect(mocks.fail).toHaveBeenCalledWith(expect.stringContaining('HTTP 403'));
    });

    it('warms a refused request in the browser and reuses fresh cookies on the next page', async () => {
        mocks.input = { location: 'Toronto', results_wanted: 101, max_pages: 2 };
        mocks.direct.mockResolvedValueOnce(response({}, 403)).mockResolvedValueOnce(response(payload(1, 101, 2)));
        mocks.browserFetch.mockImplementation(async (callback, args) => {
            mocks.cookies = [{ domain: '.realtor.ca', name: 'cf_clearance', value: 'refreshed' }];
            expect(args.timeoutMs).toBe(30000);
            return { ok: true, status: 200, text: JSON.stringify(payload(100, 1, 2)) };
        });
        await import('./main.js');

        expect(mocks.goto).toHaveBeenCalledOnce();
        expect(mocks.browserFetch).toHaveBeenCalledOnce();
        expect(mocks.direct).toHaveBeenCalledTimes(2);
        expect(mocks.direct.mock.calls[1][1].headers.cookie).toBe('cf_clearance=refreshed');
        expect(new URLSearchParams(mocks.direct.mock.calls[1][1].body).get('CurrentPage')).toBe('2');
        expect(mocks.clientOptions).toHaveLength(1);
        expect(mocks.pushData.mock.calls.map(([batch]) => batch.length)).toEqual([100, 1]);
        expect(mocks.fail).not.toHaveBeenCalled();
    });

    it('keeps recovery finite when both request paths remain blocked', async () => {
        mocks.direct.mockResolvedValue(response({}, 403));
        mocks.browserFetch.mockResolvedValue({ ok: false, status: 403, text: '' });
        await import('./main.js');

        expect(mocks.direct).toHaveBeenCalledTimes(4);
        expect(mocks.browserFetch).toHaveBeenCalledTimes(4);
        expect(mocks.pushData).not.toHaveBeenCalled();
        expect(mocks.fail).toHaveBeenCalledWith(expect.stringContaining('HTTP 403'));
        expect(mocks.close).toHaveBeenCalledTimes(2);
    });

    it('aborts a stalled browser fallback and clears its timeout', async () => {
        mocks.direct.mockResolvedValue(response({}, 403));
        mocks.browserFetch
            .mockImplementationOnce(async (callback, args) => {
                const setTimer = vi.fn((onTimeout) => {
                    onTimeout();
                    return 123;
                });
                const clearTimer = vi.fn();
                vi.stubGlobal('setTimeout', setTimer);
                vi.stubGlobal('clearTimeout', clearTimer);
                vi.stubGlobal(
                    'fetch',
                    vi.fn(async (url, options) => {
                        expect(options.signal.aborted).toBe(true);
                        throw new Error('Request aborted');
                    }),
                );
                try {
                    await expect(callback(args)).rejects.toThrow('Request aborted');
                    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 30000);
                    expect(clearTimer).toHaveBeenCalledWith(123);
                } finally {
                    vi.unstubAllGlobals();
                }
                return { ok: false, status: 503, text: '' };
            })
            .mockResolvedValue({ ok: true, status: 200, text: JSON.stringify(payload(2)) });
        await import('./main.js');

        expect(mocks.goto).toHaveBeenCalledTimes(2);
        expect(mocks.direct).toHaveBeenCalledTimes(2);
        expect(mocks.pushData.mock.calls[0][0]).toHaveLength(2);
        expect(mocks.fail).not.toHaveBeenCalled();
    });
});
