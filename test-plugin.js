
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

