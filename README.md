# homebridge-denon-heos

[![NPM version](https://badge.fury.io/js/homebridge-denon-heos.svg)](https://npmjs.org/package/homebridge-denon-heos)
![License](https://img.shields.io/badge/license-ISC-lightgrey.svg)
[![Downloads](https://img.shields.io/npm/dm/homebridge-denon-heos.svg)](https://npmjs.org/package/homebridge-denon-heos)

## A Plugin for homebridge to control a Denon AVR

This is a [Homebridge](https://github.com/nfarina/homebridge) plugin to control all types of [Denon AVRs](https://www.denon-hifi.nl/nl/product/homecinema/avreceiver). The plugin uses the http commands and not on the unstable telnet commands to control Denon AVRs. This git has been forked from [nneubauer/homebridge-denon](https://github.com/nneubauer/homebridge-denon) which was the basis for version 1 of this plugin.

Note: I'm not a javascript coder at all, so be easy on code improvements ;).


## Install

The plugin registers as [homebridge-denon-heos](https://www.npmjs.com/package/homebridge-denon-heos). I found that the original [homebridge-denon](https://www.npmjs.com/package/homebridge-denon) and all other plugins I tested were not working with newer Denon AVR generations (mine is X1400) or used the unstable telnet commands. I'm aksing you to post an issue if you have problems or an idea about this plugin. You can install the package with the following command:

```
(sudo) npm install -g homebridge-denon-heos
```

## Idea

Since there is no HomeKit AVR accessory type, [nneubauers](https://github.com/nneubauer) idea was to create bunch of switches. Each switch signifies an input source which I forked to a version I use now for over a year without any problems. Now with the TV accessories in Homekit, I wanted to make it possible to control my receiver with a TV accessory block and the control widget.


### TV Accessories
Since version 2.0, this plugin is extended with support for TV accessories. This means that you can add your receiver as a TV to your Homekit. This enables the possibility to change the input and the powerstate in one Homekit block. It also makes it possible to use the remote widget (or how it's called) to control the receiver and change the volume. This tv service is added to the plugin, so you can still use the switches if you want. An important note is that if you use the tv service, you have to add the them manually to your home app, after registering homebridge. This way it is possible to have more than one accessory which has remote widget support.

You can add multiple receivers by adding more than one `Device` in your config file. Every receiver must be registered manually ones after registering Homebridge. You can choose your input settings yourself. I added a list with all possible input settings I know of in Possible_inputs.json. You can add them all, but I only added the once I use, so the list stays short. It is also possible to change the name of the input to one with a personal touch ;).

A TV accessory has support for an info and a settings button. Normaly the settings button is accessible in the home app and the info button is accessible through the remote widget. As I don't use the info button but do use the settings button, I made it possible to switch the functionality of these buttons. This way you can have the settings menu under the `I` button in the remote widget. The volume control works in steps of 0.5. In the future, this must be update so you can hold the button to increase the volume by more.


### Switches
The standard switches, which are available for all different input types, are 'on' if the receiver is turned on and when the input is set to the specific switch. This allows you to create one switch for each input source and switch between input sources when the AVR is powered by just tapping the switch for that source. There is a polling loop embedded which checks every couple of seconds what input source is currently selected and will update the switches accordingly. For a short period of time it will appear like both inputs are "on". 

I add the option to make a general switch that polls for the state no matter the selected input. With this option, it is possible to have one main switch to turn on and off the receiver. You can still choose the default input when turning on the receiver with this switch. This functionality is configurable in the config with: `pollAllInput`.

### Demo images
<img src=https://raw.githubusercontent.com/Martvvliet/homebridge-denon-heos/tvService/images/SampleVid1.gif> <img src=https://raw.githubusercontent.com/Martvvliet/homebridge-denon-heos/tvService/images/SampleVid2.gif>

Left: Two times the same receiver as tv. Two separate switches added which also control a predefined input.
Right: When controlling the inputs with a tv tile, the separate switches are updated.

<img src=https://raw.githubusercontent.com/Martvvliet/homebridge-denon-heos/tvService/images/Sample_Inputs.png> <img src=https://raw.githubusercontent.com/Martvvliet/homebridge-denon-heos/tvService/images/Sample_Remote.png>

Left: The receiver added as tv. This enables the possibility to control the input and the power state in one tv block.
Right: When the receiver is added as tv, the receiver can be controlled with the remote. The volume buttons can be used to control the volumes. The info butten can be configured as info menu and settings menu.

<img src=https://raw.githubusercontent.com/Martvvliet/homebridge-denon-heos/tvService/images/Sample_Switches.png> <img src=https://raw.githubusercontent.com/Martvvliet/homebridge-denon-heos/tvService/images/Sample_Switches_2.png>

Left: A sample dedicated switch is added. This switch can be used to turn on the receiver and set it to the correct input.
Right: When settings the second dedicated switch, the input switches to Apple TV. The other switches is updated, and thus, turned off.




## Config

See sample-config.json for a complete sample json file. It is possible to add switches and tv services at the same time in one platform. One overall `pollInterval` must be set for all devices and switches. Default is 5. The following examples are given:

### TV Accessories
TV accessories are added as devices. The `switchInfoMenu` can be set to true if you want to switch the settings and info button functionality. Default is false. The inputs are automatically ordered alphabetically in homekit, so the order in the json doesn't matter. Check the `InputsSample.json` for the correct inputs ID's.

```json
{
	"platforms": [{
		"platform": "DenonAVR",
		"pollInterval": 3,
		"devices": [{
			"name": "Denon Receiver",
			"ip": "192.168.1.45",
			"switchInfoMenu": true,
			"inputs": [{
				"inputID": "MPLAY",
				"name": "Apple TV"
			},
			{
				"inputID": "GAME",
				"name": "iMac"
			},
			{
				"inputID": "TV",
				"name": "TV"
			},
			{
				"inputID": "AUX1",
				"name": "AUX"
			}]
		}]
	}]
}
```

### Switches
Set `pollAllInput` to true if you want a main switch to turn of the receiver no matter the selected input. Default is false.
```json
{
	"platforms": [{
		"platform": "DenonAVR",
		"pollInterval": 3,
		"switches": [{
			"name": "AVR on Apple TV",
			"ip": "192.168.1.45",
			"inputID": "MPLAY",
			"pollAllInput": false
		},
		{
			"name": "AVR on iMac",
			"ip": "192.168.1.45",
			"inputID": "GAME"
		}]
	}]
}
```


## Further Reading and Thanks

Thanks to [nneubauers](https://github.com/nneubauer) for making a stable version that worked with newer Denon models like my AVR x1400. Also thanks to Jer G who took the time to inform me on the volume control of Denon receivers and input settings with special characters.

## Future work

* Add volume control with a Light Bulb for Siri volume control.
* Improve updating state of the multiple switches when changing one.
* Improve volume control for remote widget.
* Improve polling code for more efficiency.

## Bugs

* Since based on polling, it appears that multiple inputs are set to "on" at the same time but that will heal with the next polling loop.
