
'use strict';

const suncalc = require('suncalc');
const { version } = require('./package.json');

const ALTITUDE_UUID = 'a8af30e7-5c8e-43bf-bb21-3c1343229260';
const AZIMUTH_UUID = 'ace1dd10-2e46-4100-a74a-cc77f13f1bab';

const UpdatePeriod = 5;

let Service;
let Characteristic;
let AltitudeCharacteristic;
let AzimuthCharacteristic;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    const { Formats, Units, Perms } = homebridge.hap;

    AltitudeCharacteristic = class extends Characteristic {
        constructor() {
            super('Altitude', ALTITUDE_UUID);

            this.setProps({
                format: Formats.FLOAT,
                unit: Units.ARC_DEGREE,
                minValue: -90,
                maxValue: 90,
                minStep: 0.1,
                perms: [Perms.PAIRED_READ, Perms.NOTIFY]
            });

            this.value = this.getDefaultValue();
        }
    };

    AzimuthCharacteristic = class extends Characteristic {
        constructor() {
            super('Azimuth', AZIMUTH_UUID);

            this.setProps({
                format: Formats.FLOAT,
                unit: Units.ARC_DEGREE,
                minValue: 0,
                maxValue: 360,
                minStep: 0.1,
                perms: [Perms.PAIRED_READ, Perms.NOTIFY]
            });

            this.value = this.getDefaultValue();
        }
    };

    homebridge.registerAccessory(
        'homebridge-sun-position-hb2',
        'SunPosition',
        SunPositionAccessory
    );
};

function SunPositionAccessory(log, config, api) {
	this.log = log;
	this.config = config;
	this.name = config.name;

    if (
        !config.location ||
        typeof config.location.lat !== 'number' ||
        typeof config.location.long !== 'number' ||
        !Number.isFinite(config.location.lat) ||
        !Number.isFinite(config.location.long) ||
        config.location.lat < -90 ||
        config.location.lat > 90 ||
        config.location.long < -180 ||
        config.location.long > 180
    ) {
        throw new Error(
            'Invalid location: latitude must be between -90 and 90, ' +
            'and longitude must be between -180 and 180'
        );
    }

	this.location = config.location;

    const updatePeriod = config.updatePeriod ?? UpdatePeriod;

    if (
        typeof updatePeriod !== 'number' ||
        !Number.isFinite(updatePeriod) ||
        updatePeriod < 1 ||
        updatePeriod > 1440
    ) {
        throw new Error(
            'updatePeriod must be a number between 1 and 1440 minutes'
        );
    }

    this.updatePeriod = updatePeriod;

    this.updateTimer = null;
    this.stopped = false;

    if (api && typeof api.on === 'function') {
        api.on('shutdown', () => this.stop());
    }
}

SunPositionAccessory.prototype.stop = function() {
    this.stopped = true;

    if (this.updateTimer !== null) {
        clearTimeout(this.updateTimer);
        this.updateTimer = null;
    }
};

SunPositionAccessory.prototype.identify = function(callback) {
	this.log("Identify");
	callback();
}

SunPositionAccessory.prototype.getServices = function() {
    this.informationService = new Service.AccessoryInformation();

    this.informationService
        .setCharacteristic(
            Characteristic.Manufacturer,
            'github.com codewithzac'
        )
        .setCharacteristic(
            Characteristic.Model,
            'Sun Position'
        )
        .setCharacteristic(
            Characteristic.FirmwareRevision,
            version
        );

    this.service = new Service.LightSensor('Sun');
    this.service.addCharacteristic(AltitudeCharacteristic);
    this.service.addCharacteristic(AzimuthCharacteristic);

    this.updatePosition();

    return [this.informationService, this.service];
};

SunPositionAccessory.prototype.updatePosition = function() {
    if (this.stopped) {
        return;
    }

    var now = new Date();
	var times = suncalc.getTimes(now, this.location.lat, this.location.long);

	// Arbitrary lux values for times.
	var lux = 0.0001;
	if (now >= times.sunrise && now <= times.sunriseEnd) {
		lux = 400;
	} else if (now > times.sunriseEnd && now <= times.goldenHourEnd) {
		lux = 20000;
	} else if (now >= times.goldenHour && now < times.sunsetStart) {
		lux = 20000;
	} else if (now >= times.sunsetStart && now <= times.sunset) {
		lux = 400;
	} else if (now > times.sunset && now <= times.night) {
		lux = 40;
	} else if (now >= times.nightEnd && now < times.sunrise) {
		lux = 40;
	} else if (now > times.goldenHourEnd && now < times.goldenHour) {
		lux = 100000;
	}

    // Polar-day/night fallback:
    // SunCalc returns invalid sunrise/sunset dates when the sun
    // remains above or below the horizon throughout the day.
    // In those cases, estimate light levels from solar altitude.
    const hasValidSunrise = Number.isFinite(times.sunrise.getTime());
    const hasValidSunset = Number.isFinite(times.sunset.getTime());

    if (!hasValidSunrise || !hasValidSunset) {
        const solarPosition = suncalc.getPosition(
            now,
            this.location.lat,
            this.location.long
        );

        const solarAltitude = solarPosition.altitude * 180 / Math.PI;

        if (solarAltitude >= 6) {
            lux = 100000;
        } else if (solarAltitude >= 0) {
            lux = 20000;
        } else if (solarAltitude >= -6) {
            lux = 400;
        } else if (solarAltitude >= -18) {
            lux = 40;
        } else {
            lux = 0.0001;
        }
    }

    this.service.setCharacteristic(Characteristic.CurrentAmbientLightLevel, lux);


	var position = suncalc.getPosition(now, this.location.lat, this.location.long);
	var altitude = position.altitude * 180 / Math.PI;
	var azimuth = (position.azimuth * 180 / Math.PI + 180) % 360;

    if (typeof this.log.debug === 'function') {
        this.log.debug(
            `Sun altitude: ${altitude.toFixed(1)}°, azimuth: ${azimuth.toFixed(1)}°`
        );
    }

    this.service.setCharacteristic(AltitudeCharacteristic, altitude);
	this.service.setCharacteristic(AzimuthCharacteristic, azimuth);

    this.updateTimer = setTimeout(() => {
        this.updateTimer = null;
        this.updatePosition();
    }, this.updatePeriod * 60 * 1000);
}
