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
}));

vi.mock('apify', () => ({
    Actor: {
        init: vi.fn(),
        getInput: async () => mocks.input,
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
        launchPersistentContext: async () => ({
            pages: () => [{
                goto: mocks.goto,
                getByRole: () => ({ isVisible: async () => false }),
                waitForTimeout: async () => {},
                evaluate: async (callback, args) => {
                    if (args) return mocks.browserFetch(callback, args);
                    if (callback.toString().includes('navigator.userAgent')) return 'Chrome/151.0.0.0';
                    return { title: 'REALTOR.ca', text: 'Map search' };
                },
            }],
            cookies: async () => mocks.cookies,
            close: mocks.close,
        }),
    },
}));

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
    mocks.direct.mockReset();
    mocks.browserFetch.mockReset();
    mocks.close.mockResolvedValue(undefined);
    mocks.input = { location: 'Toronto', results_wanted: 2, max_pages: 1 };
    mocks.cookies = [{ domain: '.realtor.ca', name: 'cf_clearance', value: 'initial' }];
    mocks.clientOptions.length = 0;
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('browser bootstrap and direct request handoff', () => {
    it('starts at document commit and uses Impit without browser fetch on a healthy session', async () => {
        mocks.direct.mockResolvedValue(response(payload(2)));
        await import('./main.js');

        expect(mocks.goto).toHaveBeenCalledWith(expect.stringContaining('LatitudeMax=43.85546'), {
            waitUntil: 'commit', timeout: 60000,
        });
        expect(mocks.clientOptions).toHaveLength(1);
        expect(mocks.clientOptions[0].browser).toBe('chrome151');
        expect(mocks.browserFetch).not.toHaveBeenCalled();
        expect(mocks.pushData.mock.calls[0][0]).toHaveLength(2);
        expect(mocks.fail).not.toHaveBeenCalled();
        expect(mocks.close).toHaveBeenCalledOnce();
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
        mocks.browserFetch.mockImplementationOnce(async (callback, args) => {
            const setTimer = vi.fn((onTimeout) => {
                onTimeout();
                return 123;
            });
            const clearTimer = vi.fn();
            vi.stubGlobal('setTimeout', setTimer);
            vi.stubGlobal('clearTimeout', clearTimer);
            vi.stubGlobal('fetch', vi.fn(async (url, options) => {
                expect(options.signal.aborted).toBe(true);
                throw new Error('Request aborted');
            }));
            try {
                await expect(callback(args)).rejects.toThrow('Request aborted');
                expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 30000);
                expect(clearTimer).toHaveBeenCalledWith(123);
            } finally {
                vi.unstubAllGlobals();
            }
            return { ok: false, status: 503, text: '' };
        }).mockResolvedValue({ ok: true, status: 200, text: JSON.stringify(payload(2)) });
        await import('./main.js');

        expect(mocks.goto).toHaveBeenCalledTimes(2);
        expect(mocks.direct).toHaveBeenCalledTimes(2);
        expect(mocks.pushData.mock.calls[0][0]).toHaveLength(2);
        expect(mocks.fail).not.toHaveBeenCalled();
    });
});
