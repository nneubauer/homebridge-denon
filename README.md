# A Plugin for hombridge to control a Denon AVR

This has been forked from https://github.com/nneubauer/homebridge-denon which has been forked from https://github.com/xkonni/homebridge-denon which unfortunatly uses a modified version of the node-denon-client and has little to no documentation.

## Install

The plugin registers as `hombridge-denon-avr` to avoid ambuigity with another plugin that already exists `homebridge-denon`,
which I found not to work with newer Denon AVR generations (mine is X1400). Until I find out how to publish node packages, use

`git clone`
`cd homebridge-denon`
`sudo npm -g install .`

## Idea

Since there is no HomeKit AVR accessory type, nneubauers idea was to create bunch of switches. Each switch signifies an input source.
He would have eg. one switch for DVD and one for MPLAY. The HomeKit switch should be "on" only if the AVR is powered AND the
correct input is set. Otherwise off.

This allows you to create one switch for each input source and switch between input sources when the AVR is powered by just tapping
the switch for that source. There is a polling loop embedded which checks every couple of seconds what input source is currently
selected and will update the switches accordingly. For a short period of time it will appear like both inputs are "on". I guess
that could be overcome by making this plugin a platform instead of an accessory. If you wanted to improve this, feel free to fork
and update accordingly.

I add the option to make a general switch that polls for the state no matter the selected input. With this option, it is possible to have one main switch to turn on and off the receiver. You can still choose the default input when turning on the receiver with this switch.

## Config

See sample-config.json.
`requireInput` can be (untested): 'CD', 'SPOTIFY', 'CBL/SAT', 'DVD', 'BD', 'GAME', 'GAME2', 'AUX1', 'MPLAY', 'USB/IPOD', 'TUNER', 'NETWORK', 'TV', 'IRADIO', 'SAT/CBL', 'DOCK', 'IPOD', 'NET/USB', 'RHAPSODY', 'PANDORA', 'LASTFM', 'IRP', 'FAVORITES', 'SERVER'.
`pollInputAll` make this value true if you want a main switch to turn of the receiver no matter the selected input. Default is false.

## Further Reading and Thanks

Thanks to nneubauer for making a stable version that worked with newer Denon models like my AVR x1400.

## Bugs

* Since based on polling, it appears that multiple inputs are set to "on" at the same time but that
  will heal with the next polling loop.
* Inputs with special chars CBL/SAT do not work.
