# Homebridge Sun Position — Homebridge 2

[![Tests](https://github.com/codewithzac/homebridge-sun-position-hb2/actions/workflows/test.yaml/badge.svg)](https://github.com/codewithzac/homebridge-sun-position-hb2/actions/workflows/test.yaml)

A Homebridge 2-compatible fork of [homebridge-sun-position](https://github.com/keybuk/homebridge-sun-position).

This plugin exposes the position of the sun as a HomeKit Light Sensor accessory, allowing automations based on solar altitude, azimuth and simulated ambient light levels.

It is particularly useful for controlling blinds and window coverings based on the sun's position rather than fixed times of day.

## Features

- Solar altitude in degrees (−90° to +90°).
- Solar azimuth in degrees (0° to 360°, clockwise from north).
- Simulated ambient light levels based on solar events.
- Support for polar day and polar night conditions.
- Configurable update interval (1–1440 minutes).
- Graceful shutdown handling.
- Homebridge 2 compatibility.
- Automated tests across Node.js 22, 24 and 26.

## Requirements

- Homebridge 2.5.0 or later, within the supported 2.x range.
- Node.js 22.12+, 24.x or 26.x.

## Installation

### Homebridge UI

Once the package is published, search for `homebridge-sun-position-hb2` in the Homebridge Plugins interface and install it.

### npm

```bash
npm install -g homebridge-sun-position-hb2
```

## Configuration

Add the following accessory to the `accessories` array in Homebridge's `config.json`:

```json
{
  "accessory": "SunPosition",
  "name": "Sun",
  "location": {
    "lat": -37.81,
    "long": 144.96
  },
  "updatePeriod": 5
}
```

### Configuration options

| Property | Required | Description |
|---|---|---|
| `accessory` | Yes | Must be `SunPosition` |
| `name` | Yes | Accessory display name |
| `location.lat` | Yes | Latitude, −90 to +90 |
| `location.long` | Yes | Longitude, −180 to +180 |
| `updatePeriod` | No | Update interval in minutes, 1–1440; defaults to 5 |

Coordinates must be expressed in decimal degrees. Southern latitudes and western longitudes are negative.

## Migrating from the original plugin

This package is a maintained fork of the original `homebridge-sun-position` plugin, updated for Homebridge 2.

The configuration format, accessory type (`SunPosition`), and custom altitude and azimuth characteristic UUIDs have been retained.

To migrate:

1. Back up your Homebridge configuration and accessory data.
2. Record any HomeKit automations that depend on the existing accessory.
3. Uninstall the original `homebridge-sun-position` plugin.
4. Install `homebridge-sun-position-hb2`.
5. Retain your existing accessory configuration.
6. Restart Homebridge and verify the accessory and its automations.

**Important:** Migration from an existing paired installation has not yet been fully verified. Preserving characteristic UUIDs does not guarantee that all HomeKit automations will survive migration.

Do not run both versions simultaneously.

## Ambient light levels

The plugin provides simulated light levels based on solar events rather than measurements from a physical light sensor.

| Solar phase | Simulated illuminance |
|---|---:|
| Full daylight | 100,000 lux |
| Golden hour | 20,000 lux |
| Sunrise and sunset | 400 lux |
| Twilight | 40 lux |
| Darkness | 0.0001 lux |

At locations where normal sunrise or sunset events do not occur, such as during polar day or polar night, the plugin uses an altitude-based fallback.

These values are intended for use in automations and should not be interpreted as actual environmental illuminance measurements.

## Development

Install dependencies:

```bash
npm ci
```

Run the automated tests:

```bash
npm test
```

The test suite covers Homebridge characteristic registration, configuration validation, timer lifecycle, seasonal solar calculations across multiple locations, and polar conditions.

Tests run automatically through GitHub Actions on Node.js 22, 24 and 26.

## Credits and licence

Based on the original [homebridge-sun-position](https://github.com/keybuk/homebridge-sun-position) project by [keybuk](https://github.com/keybuk).

This fork adds Homebridge 2 compatibility, improved configuration validation, lifecycle handling, solar calculation corrections and automated testing.

The project retains the original ISC licence.

## Screenshots

A single "Sun" accessory is added to your home, represented as a Light Sensor; the lux values are somewhat arbitrary and are based on the current phase of the day. HomeKit requires a recognized service for automation, and this seemed like the closest thing.

To use the Altitude and Azimuth characteristics, you will need an app such as Matthias Hochgatterer's [Home - Smart Home Automation](https://itunes.apple.com/us/app/home-smart-home-automation/id995994352?mt=8) app. Using this app you can see the current position of the sun, and create automations based on it:

![Characteristics](https://i.imgur.com/lRAdM0S.png)
![Automation](https://i.imgur.com/ZHUVaKQ.png?)

## Usage

To use this plugin you need to be reasonably comfortable with HomeKit automation, and understand the differences between Triggers and Conditions, and their limitations.

As of iOS 11.3, Threshold Range Event triggers do not seem to work with custom characteristics. Fortunately you can still check for *Any Change*, and combine that with conditions to verify the range.

If your HomeKit Automation app does not allow you to set two different conditions for the same characteristic, simply create two Sun accessories (Sun A and Sun B) in your `config.json`.

In addition, a trigger's End Event only seems to support Time Events, and not full characteristics as documented. You will need a second automation to "undo" the first, use a dummy switch such as from [homebridge-dummy](https://www.npmjs.com/package/homebridge-dummy) to track the state.

Here is an example of rules to close window blinds when the sun shines through a South-facing window, and open them again once it passes:

**Close Blinds**
> **Triggers:**<br>
> Sun Azimuth *Any Change*
> 
> **Conditions:**<br>
> Sun Azimuth &ge; 115.0&deg;<br>
> Sun Azimuth &lt; 235.0&deg;
> 
> **Actions:**<br>
> Set Scene *blinds down*<br>
> Set Dummy Switch *on*

**Open Blinds**
> **Triggers:**<br>
> Sun Azimuth *Any Change*
> 
> **Conditions:**<br>
> Sun Azimuth &ge; 235.0&deg;<br>
> Dummy Switch = on
> 
> **Actions:**<br>
> Set Scene *blinds up*<br>
> Set Dummy Switch *off*

More advanced rules can be created by combing the azimuth and altitude of the sun, and by combing weather information such as from [homebridge-weather-extended](https://www.npmjs.com/package/homebridge-weather-station-extended).

He is an example for west-facing blinds that, only on a sunny day, come down in two phases based on the altitude of the sun, and go back up again once it's behind the houses or hills.

**Half-close Blinds**
> **Triggers:**<br>
> Sun Azimuth *Any Change*
> 
> **Conditions:**<br>
> Weather Condition Category = 0<br>
> Sun Azimuth &ge; 220.0&deg;<br>
> Sun Altitude &le; 50.0&deg;<br>
> Sun Altitude &gt; 30.0&deg;
> 
> **Actions:**<br>
> Set Scene *blinds half down*<br>
> Set Dummy Switch *on*

**Fully-close Blinds**
> **Triggers:**<br>
> Sun Azimuth *Any Change*
> 
> **Conditions:**<br>
> Weather Condition Category = 0<br>
> Sun Azimuth &ge; 220.0&deg;<br>
> Sun Altitude &le; 30.0&deg;<br>
> Sun Altitude &gt; 10.0&deg;
> 
> **Actions:**<br>
> Set Scene *blinds fully down*<br>
> Set Dummy Switch *on*

**Open Blinds at Sunset**
> **Triggers:**<br>
> Sun Azimuth *Any Change*
> 
> **Conditions:**<br>
> Sun Azimuth &ge; 220.0&deg;<br>
> Sun Altitude &le; 10.0&deg;<br>
> Dummy Switch = on
> 
> **Actions:**<br>
> Set Scene *blinds up*<br>
> Set Dummy Switch *off*

**Open Blinds when Cloudy**
> **Triggers:**<br>
> Weather Condition Category *Any Change*
> 
> **Conditions:**<br>
> Weather Condition Category &gt; 0<br>
> Dummy Switch = on
> 
> **Actions:**<br>
> Set Scene *blinds up*<br>
> Set Dummy Switch *off*
