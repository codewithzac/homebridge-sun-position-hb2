
'use strict';

const suncalc = require('suncalc');

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
        'homebridge-sun-position',
        'SunPosition',
        SunPositionAccessory
    );
};

function SunPositionAccessory(log, config) {
	this.log = log;
	this.config = config;
	this.name = config.name;

	if (!config.location || !Number.isFinite(config.location.lat) || !Number.isFinite(config.location.long))
		throw new Error("Missing or invalid location configuration");

	this.location = config.location;
	this.updatePeriod = config.updatePeriod || UpdatePeriod;
}

SunPositionAccessory.prototype.identify = function(callback) {
	this.log("Identify");
	callback();
}

SunPositionAccessory.prototype.getServices = function() {
	this.informationService = new Service.AccessoryInformation();
	this.informationService
		.setCharacteristic(Characteristic.Manufacturer, "github.com keybuk")
		.setCharacteristic(Characteristic.Model, "Sun Position")

    this.service = new Service.LightSensor("Sun");
    this.service.addCharacteristic(AltitudeCharacteristic);
    this.service.addCharacteristic(AzimuthCharacteristic);

    this.updatePosition();

    return [this.informationService, this.service];
}

SunPositionAccessory.prototype.updatePosition = function() {
	var now = new Date();
	var times = suncalc.getTimes(now, this.location.lat, this.location.long);

	// Arbitrary lux values for times.
	var lux = 0.0001;
	if (now >= times.sunrise && now <= times.sunriseEnd) {
		lux = 400;
	} else if (now > times.sunriseEnd && now <= times.goldenHourEnd) {
		lux = 20000;
	} else if (now >= times.goldenHour && times < times.sunsetStart) {
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

	this.service.setCharacteristic(Characteristic.CurrentAmbientLightLevel, lux);


	var position = suncalc.getPosition(now, this.location.lat, this.location.long);
	var altitude = position.altitude * 180 / Math.PI;
	var azimuth = (position.azimuth * 180 / Math.PI + 180) % 360;

	this.log("Sun is " + altitude + " high at " + azimuth);

	this.service.setCharacteristic(AltitudeCharacteristic, altitude);
	this.service.setCharacteristic(AzimuthCharacteristic, azimuth);

	setTimeout(this.updatePosition.bind(this), this.updatePeriod * 60 * 1000);
}
