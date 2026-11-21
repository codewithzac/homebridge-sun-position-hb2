
'use strict';

const assert = require('node:assert/strict');

const { createRequire } = require('node:module');

// Resolve HAP-NodeJS from Homebridge's own module location.
const homebridgeRequire = createRequire(require.resolve('homebridge'));
const hap = homebridgeRequire('@homebridge/hap-nodejs');

let AccessoryConstructor;

const mockApi = {
    hap,
    registerAccessory(pluginName, accessoryName, constructor) {
        assert.equal(pluginName, 'homebridge-sun-position-hb2');
        assert.equal(accessoryName, 'SunPosition');
        AccessoryConstructor = constructor;
    }
};

// Load and register the plugin.
require('./index.js')(mockApi);

assert.ok(AccessoryConstructor, 'Plugin did not register an accessory');

// Instantiate the accessory using a sample location.
const accessory = new AccessoryConstructor(
    console.log,
    {
        name: 'Sun Position Test',
        location: {
            lat: -37.81,
            long: 144.96
        },
        updatePeriod: 5
    }
);

// Prevent the test from remaining alive because of the update timer.
const originalSetTimeout = global.setTimeout;
global.setTimeout = () => 0;

let services;

try {
    services = accessory.getServices();
} finally {
    global.setTimeout = originalSetTimeout;
}

assert.equal(services.length, 2);

const information = services.find(
    service => service.UUID === hap.Service.AccessoryInformation.UUID
);

assert.ok(information, 'AccessoryInformation service not found');

assert.equal(
    information.getCharacteristic(hap.Characteristic.Manufacturer).value,
    'github.com codewithzac'
);

assert.equal(
    information.getCharacteristic(hap.Characteristic.FirmwareRevision).value,
    require('./package.json').version
);

console.log('PASS: Manufacturer and firmware metadata are correct');

const lightSensor = services.find(
    service => service.UUID === hap.Service.LightSensor.UUID
);

assert.ok(lightSensor, 'LightSensor service not found');

const altitude = lightSensor.characteristics.find(
    characteristic =>
        characteristic.UUID === 'a8af30e7-5c8e-43bf-bb21-3c1343229260'
);

const azimuth = lightSensor.characteristics.find(
    characteristic =>
        characteristic.UUID === 'ace1dd10-2e46-4100-a74a-cc77f13f1bab'
);

assert.ok(altitude, 'Altitude characteristic not found');
assert.ok(azimuth, 'Azimuth characteristic not found');

assert.ok(Number.isFinite(altitude.value));
assert.ok(Number.isFinite(azimuth.value));

console.log('PASS: Plugin registered successfully');
console.log('PASS: LightSensor service created');
console.log('PASS: Altitude:', altitude.value);
console.log('PASS: Azimuth:', azimuth.value);


//
// Regression test: evening golden hour
//

const suncalc = require('suncalc');

// Use a fixed date so the test is repeatable.
const testDate = new Date('2026-11-21T02:00:00Z');

const solarTimes = suncalc.getTimes(
    testDate,
    -37.81,
    144.96
);

// Choose a time halfway between the beginning of
// evening golden hour and the beginning of sunset.
const goldenHourTime = new Date(
    (solarTimes.goldenHour.getTime() +
     solarTimes.sunsetStart.getTime()) / 2
);

assert.ok(
    solarTimes.goldenHour < solarTimes.sunsetStart,
    'Invalid golden-hour test interval'
);

// Temporarily replace the clock used by the plugin.
const OriginalDate = global.Date;
const originalTimer = global.setTimeout;

global.Date = class extends OriginalDate {
    constructor(...args) {
        if (args.length === 0) {
            super(goldenHourTime.getTime());
        } else {
            super(...args);
        }
    }

    static now() {
        return goldenHourTime.getTime();
    }
};

// Prevent the plugin from scheduling another update.
global.setTimeout = () => 0;

try {
    accessory.updatePosition();

    const lightLevel = lightSensor.getCharacteristic(
        hap.Characteristic.CurrentAmbientLightLevel
    ).value;

    assert.equal(
        lightLevel,
        20000,
        'Evening golden hour should report 20000 lux'
    );

    console.log(
        'PASS: Evening golden hour reports 20000 lux'
    );
} finally {
    global.Date = OriginalDate;
    global.setTimeout = originalTimer;
}


// Configuration validation tests

const validLocation = {
    lat: -37.81,
    long: 144.96
};

for (const invalidPeriod of [
    0,
    -1,
    0.5,
    1441,
    '5',
    NaN,
    Infinity
]) {
    assert.throws(
        () => new AccessoryConstructor(
            () => {},
            {
                name: 'Invalid Configuration Test',
                location: validLocation,
                updatePeriod: invalidPeriod
            }
        ),
        /updatePeriod must be a number between 1 and 1440 minutes/
    );
}

const defaultAccessory = new AccessoryConstructor(
    () => {},
    {
        name: 'Default Configuration Test',
        location: validLocation
    }
);

assert.equal(defaultAccessory.updatePeriod, 5);

console.log('PASS: Invalid update intervals are rejected');
console.log('PASS: Default update interval is 5 minutes');


// Timer lifecycle tests

const { EventEmitter } = require('node:events');

const testApi = new EventEmitter();
const scheduledTimers = [];
const cancelledTimers = [];

const realSetTimeout = global.setTimeout;
const realClearTimeout = global.clearTimeout;

global.setTimeout = (callback, delay) => {
    const timer = { callback, delay };
    scheduledTimers.push(timer);
    return timer;
};

global.clearTimeout = (timer) => {
    cancelledTimers.push(timer);
};

try {
    const timedAccessory = new AccessoryConstructor(
        () => {},
        {
            name: 'Timer Test',
            location: validLocation,
            updatePeriod: 5
        },
        testApi
    );

    timedAccessory.getServices();

    assert.equal(scheduledTimers.length, 1);
    assert.equal(scheduledTimers[0].delay, 300000);

    console.log('PASS: Update scheduled after 5 minutes');

    // Simulate the first five-minute timer firing.
    scheduledTimers[0].callback();

    // The plugin should schedule another update.
    assert.equal(scheduledTimers.length, 2);
    assert.equal(scheduledTimers[1].delay, 300000);
    assert.equal(
        timedAccessory.updateTimer,
        scheduledTimers[1]
    );

    console.log('PASS: Timer schedules recurring updates');

    // Simulate Homebridge shutting down.
    testApi.emit('shutdown');

    assert.equal(cancelledTimers.length, 1);
    assert.equal(cancelledTimers[0], scheduledTimers[1]);
    assert.equal(timedAccessory.updateTimer, null);
    assert.equal(timedAccessory.stopped, true);

    console.log('PASS: Timer cancelled on shutdown');

    // Confirm no new update is scheduled after shutdown.
    timedAccessory.updatePosition();

    assert.equal(scheduledTimers.length, 2);

    console.log('PASS: No updates scheduled after shutdown');
} finally {
    global.setTimeout = realSetTimeout;
    global.clearTimeout = realClearTimeout;
}

// Location validation tests

const invalidLocations = [
    { lat: 91, long: 144.96 },
    { lat: -91, long: 144.96 },
    { lat: -37.81, long: 181 },
    { lat: -37.81, long: -181 },
    { lat: 'Melbourne', long: 144.96 },
    { lat: NaN, long: 144.96 },
    { lat: Infinity, long: 144.96 },
    { lat: -37.81 },
    null
];

for (const location of invalidLocations) {
    assert.throws(
        () => new AccessoryConstructor(
            () => {},
            {
                name: 'Invalid Location Test',
                location
            }
        ),
        /Invalid location/
    );
}

const validBoundaryLocations = [
    { lat: 90, long: 180 },
    { lat: -90, long: -180 },
    { lat: 0, long: 0 }
];

for (const location of validBoundaryLocations) {
    assert.doesNotThrow(
        () => new AccessoryConstructor(
            () => {},
            {
                name: 'Valid Location Test',
                location
            }
        )
    );
}

console.log('PASS: Invalid geographic coordinates are rejected');
console.log('PASS: Valid geographic coordinates are accepted');

//
// International solar calculation tests
//

// Run a fresh accessory at a simulated date and location.
// This avoids altering the existing test accessory.
function solarReadingAt(location, date) {
    const RealDate = global.Date;
    const realTimeout = global.setTimeout;

    global.Date = class extends RealDate {
        constructor(...args) {
            super(...(args.length ? args : [date.getTime()]));
        }

        static now() {
            return date.getTime();
        }
    };

    // Don't schedule real timers during tests.
    global.setTimeout = () => 0;

    try {
        const testAccessory = new AccessoryConstructor(
            () => {},
            {
                name: 'International Solar Test',
                location: {
                    lat: location.lat,
                    long: location.long
                }
            }
        );

        const services = testAccessory.getServices();

        const sensor = services.find(
            service => service.UUID === hap.Service.LightSensor.UUID
        );

        assert.ok(sensor, 'LightSensor service missing');

        return {
            lux: sensor.getCharacteristic(
                hap.Characteristic.CurrentAmbientLightLevel
            ).value,
            altitude: sensor.characteristics.find(
                c => c.UUID ===
                    'a8af30e7-5c8e-43bf-bb21-3c1343229260'
            ).value,
            azimuth: sensor.characteristics.find(
                c => c.UUID ===
                    'ace1dd10-2e46-4100-a74a-cc77f13f1bab'
            ).value
        };
    } finally {
        global.Date = RealDate;
        global.setTimeout = realTimeout;
    }
}

// Calculate a point halfway between two events.
function solarMidpoint(start, end) {
    assert.ok(
        Number.isFinite(start.getTime()) &&
        Number.isFinite(end.getTime()) &&
        start < end,
        'Invalid solar event interval'
    );

    return new Date(
        (start.getTime() + end.getTime()) / 2
    );
}

// Each reference date is approximately local noon.
// This keeps SunCalc calculations on the intended day.
const internationalLocations = [
    {
        name: 'Melbourne',
        lat: -37.81,
        long: 144.96,
        dates: [
            '2026-01-15T01:00:00Z',
            '2026-07-15T02:00:00Z'
        ]
    },
    {
        name: 'London',
        lat: 51.51,
        long: -0.13,
        dates: [
            '2026-01-15T12:00:00Z',
            '2026-07-15T11:00:00Z'
        ]
    },
    {
        name: 'Singapore',
        lat: 1.35,
        long: 103.82,
        dates: [
            '2026-01-15T04:00:00Z',
            '2026-07-15T04:00:00Z'
        ]
    }
];

for (const location of internationalLocations) {
    for (const dateString of location.dates) {
        const referenceDate = new Date(dateString);

        const times = suncalc.getTimes(
            referenceDate,
            location.lat,
            location.long
        );

        const cases = [
            {
                phase: 'Sunrise',
                date: solarMidpoint(
                    times.sunrise,
                    times.sunriseEnd
                ),
                expected: 400
            },
            {
                phase: 'Morning golden hour',
                date: solarMidpoint(
                    times.sunriseEnd,
                    times.goldenHourEnd
                ),
                expected: 20000
            },
            {
                phase: 'Midday',
                date: times.solarNoon,
                expected: 100000
            },
            {
                phase: 'Evening golden hour',
                date: solarMidpoint(
                    times.goldenHour,
                    times.sunsetStart
                ),
                expected: 20000
            },
            {
                phase: 'Sunset',
                date: solarMidpoint(
                    times.sunsetStart,
                    times.sunset
                ),
                expected: 400
            }
        ];

        for (const test of cases) {
            const result = solarReadingAt(
                location,
                test.date
            );

            assert.equal(
                result.lux,
                test.expected,
                `${location.name}, ${dateString}, ` +
                `${test.phase}: expected ${test.expected} lux, ` +
                `received ${result.lux}`
            );

            assert.ok(Number.isFinite(result.altitude));
            assert.ok(Number.isFinite(result.azimuth));

            console.log(
                `PASS: ${location.name} ` +
                `${dateString.slice(0, 10)} — ${test.phase}`
            );
        }
    }
}

// Polar regions require special consideration.
// For now, check that sun-position calculations are finite.
const polarLocation = {
    name: 'Tromso',
    lat: 69.65,
    long: 18.96
};

for (const dateString of [
    '2026-06-21T10:00:00Z',
    '2026-12-21T10:00:00Z'
]) {
    const result = solarReadingAt(
        polarLocation,
        new Date(dateString)
    );

    assert.ok(
        Number.isFinite(result.altitude),
        'Polar altitude should be finite'
    );

    assert.ok(
        Number.isFinite(result.azimuth),
        'Polar azimuth should be finite'
    );

    assert.ok(
        Number.isFinite(result.lux),
        'Polar light level should be finite'
    );

    console.log(
        `PASS: Tromso ${dateString.slice(0, 10)} ` +
        `— calculations completed`
    );
}

// Nighttime and twilight regression tests

const nightTestLocation = {
    name: 'Melbourne',
    lat: -37.81,
    long: 144.96
};

const nightTestDate = new Date('2026-01-15T01:00:00Z');

const nightTimes = suncalc.getTimes(
    nightTestDate,
    nightTestLocation.lat,
    nightTestLocation.long
);

const nightTestCases = [
    {
        name: 'Evening twilight',
        date: solarMidpoint(
            nightTimes.sunset,
            nightTimes.night
        ),
        expected: 40
    },
    {
        name: 'Morning twilight',
        date: solarMidpoint(
            nightTimes.nightEnd,
            nightTimes.sunrise
        ),
        expected: 40
    },
    {
        name: 'Midnight',
        // Midnight AEDT, 16 January 2026
        date: new Date('2026-01-15T13:00:00Z'),
        expected: 0.0001
    }
];

for (const test of nightTestCases) {
    const result = solarReadingAt(
        nightTestLocation,
        test.date
    );

    assert.equal(
        result.lux,
        test.expected,
        `${test.name}: expected ${test.expected} lux, ` +
        `received ${result.lux}`
    );

    console.log(
        `PASS: ${test.name} reports ${result.lux} lux`
    );
}

// Polar-day regression test

const polarSummerLocation = {
    name: 'Tromso',
    lat: 69.65,
    long: 18.96
};

// Around local midnight during the midnight-sun season.
const polarSummerDate = new Date('2026-06-21T22:00:00Z');

const polarSummerReading = solarReadingAt(
    polarSummerLocation,
    polarSummerDate
);

// The sun should still be above the horizon.
assert.ok(
    polarSummerReading.altitude > 0,
    'Expected the sun to be above the horizon'
);

// A sunlit polar night should not report complete darkness.
assert.ok(
    polarSummerReading.lux > 0.0001,
    'Midnight sun should not report the nighttime fallback lux'
);

console.log(
    'PASS: Midnight sun does not report complete darkness'
);

// Polar-night regression test

// Around local midday during the polar-night season.
const polarWinterDate = new Date('2026-12-21T11:00:00Z');

const polarWinterReading = solarReadingAt(
    polarSummerLocation,
    polarWinterDate
);

// In Tromso in December, the sun remains below the horizon.
assert.ok(
    polarWinterReading.altitude < 0,
    'Expected the sun to remain below the horizon'
);

// At midday there should still be some twilight.
// The sun is below the horizon, but not far enough
// below it to produce complete darkness.
assert.ok(
    polarWinterReading.lux > 0.0001,
    'Polar winter midday should report twilight'
);

assert.ok(
    polarWinterReading.lux <= 400,
    'Polar winter midday should not report daylight'
);

console.log(
    'PASS: Polar winter midday reports twilight'
);

//
// Polar winter midnight regression test
//

// Midnight in Tromso on 22 December 2026
// (23:00 UTC on 21 December).
const polarWinterMidnight = new Date('2026-12-21T23:00:00Z');

const polarMidnightReading = solarReadingAt(
    polarSummerLocation,
    polarWinterMidnight
);

assert.ok(
    polarMidnightReading.altitude < -18,
    'Expected the sun below astronomical twilight'
);

assert.equal(
    polarMidnightReading.lux,
    0.0001,
    'Polar winter midnight should report darkness'
);

console.log(
    'PASS: Polar winter midnight reports darkness'
);
