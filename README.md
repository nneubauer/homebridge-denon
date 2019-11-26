# hombridge-denon-heos

[![NPM version](https://badge.fury.io/js/hombridge-denon-heos.svg)](https://npmjs.org/package/hombridge-denon-heos)
![License](https://img.shields.io/badge/license-ISC-lightgrey.svg)
[![Downloads](https://img.shields.io/npm/dm/hombridge-denon-heos.svg)](https://npmjs.org/package/hombridge-denon-heos)

## A Plugin for hombridge to control a Denon AVR

This is a [Homebridge](https://github.com/nfarina/homebridge) plugin to control all types of [Denon AVRs](https://www.denon-hifi.nl/nl/product/homecinema/avreceiver). THe plugin uses the http commands and not on the unstable telnet commands to control Denon AVRs. This git has been forked from [nneubauer/homebridge-denon](https://github.com/nneubauer/homebridge-denon) which has been forked from [xkonni/homebridge-denon](https://github.com/xkonni/homebridge-denon) which unfortunately uses a modified version of the node-denon-client and has little to no documentation.

## Install

The plugin registers as [hombridge-denon-heos](https://www.npmjs.com/package/hombridge-denon-heos) as I found that the original [homebridge-denon](https://www.npmjs.com/package/homebridge-denon) and all other plugins I tested were not working with newer Denon AVR generations (mine is X1400) or used the unstable telnet commands. You can install the package with the following command:

```
(sudo) npm install -g hombridge-denon-heos.
```

## Idea

Since there is no HomeKit AVR accessory type, [nneubauers](https://github.com/nneubauer) idea was to create bunch of switches. Each switch signifies an input source which I forked to a version I use now for over a year without any problems.
The standard switches, which are available for all different input types, are 'on' if the receiver is turned on and when the input is set to the specific switch. This allows you to create one switch for each input source and switch between input sources when the AVR is powered by just tapping the switch for that source. There is a polling loop embedded which checks every couple of seconds what input source is currently selected and will update the switches accordingly. For a short period of time it will appear like both inputs are "on". I guess
that could be overcome by making this plugin a platform instead of an accessory. 

### Additional functionality

I add the option to make a general switch that polls for the state no matter the selected input. With this option, it is possible to have one main switch to turn on and off the receiver. You can still choose the default input when turning on the receiver with this switch. This functionality is configurable in the config with: `pollInputAll`

## Config

See sample-config.json.

`requireInput` can be (untested): `CD`, `SPOTIFY`, `CBL/SAT`, `DVD`, `BD`, `GAME`, `GAME2`, `AUX1`, `MPLAY`, `USB/IPOD`, `TUNER`, `NETWORK`, `TV`, `IRADIO`, `SAT/CBL`, `DOCK`, `IPOD`, `NET/USB`, `RHAPSODY`, `PANDORA`, `LASTFM`, `IRP`, `FAVORITES`, `SERVER`.

Set `pollInputAll` to true if you want a main switch to turn of the receiver no matter the selected input. Default is false.

## Further Reading and Thanks

Thanks to [nneubauers](https://github.com/nneubauer) for making a stable version that worked with newer Denon models like my AVR x1400.

## Future work

* In the future, I want to convert the package to a TV accessory, so it is possible to change the input of the receiver in the same way as the homekit enabled TV's do.

## Bugs

* Since based on polling, it appears that multiple inputs are set to "on" at the same time but that will heal with the next polling loop.
* Inputs with special chars CBL/SAT do not work.
