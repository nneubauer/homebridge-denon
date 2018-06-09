# A Plugin for hombridge to control a Denon AVR

This has been forked from https://github.com/xkonni/homebridge-denon which unfortunatly uses a modified version of
the node-denon-client and has little to no documentation.

## Install

The plugin registers as `hombridge-denon-avr` to avoid ambuigity with another plugin that already exists `homebridge-denon`,
which I found not to work with newer Denon AVR generations (mine is X1400). Until I find out how to publish node packages, use

`git clone`
`cd homebridge-denon`
`sudo npm -g install .`

## Idea

Since there is no HomeKit AVR accessory type, my idea was to create bunch of switches. Each switch signifies an input source.
I would have eg. one switch for DVD and one for MPLAY. The HomeKit switch should be "on" only if the AVR is powered AND the
correct input is set. Otherwise off.

This allows you to create one switch for each input source and switch between input sources when the AVR is powered by just tapping
the switch for that source. There is a polling loop embedded which checks every couple of seconds what input source is currently
selected and will update the switches accordingly. For a short period of time it will appear like both inputs are "on". I guess
that could be overcome by making this plugin a platform instead of an accessory. If you wanted to improve this, feel free to fork
and update accordingly.

## Config

See sample-config.json. `requireInput` can be (untested): 'CD', 'SPOTIFY', 'CBL/SAT', 'DVD', 'BD', 'GAME', 'GAME2', 'AUX1', 'MPLAY', 'USB/IPOD', 'TUNER', 'NETWORK', 'TV', 'IRADIO', 'SAT/CBL', 'DOCK', 'IPOD', 'NET/USB', 'RHAPSODY', 'PANDORA', 'LASTFM', 'IRP', 'FAVORITES', 'SERVER'.

## Further Reading and Thanks

This is my first plugin and I created it based on stuff I found on the net (Thanks for that):

* https://github.com/k3erg/marantz-denon-telnet (client using Telnet, works but only supports a single switch)
* https://github.com/lmoe/node-denon-client (client using Telnet but seems defunct)
* http://blue-pc.net/2013/12/28/denon-av-reciever-ueber-http-steuern/ (info on controling the AVR using HTTP)

## Bugs

* Since based on polling, it appears that multiple inputs are set to "on" at the same time but that
  will heal with the next polling loop.
* Inputs with special chars CBL/SAT do not work.

## Disclaimer

This was initially forked from a project which I completly changed so probably the git history will not be really accurate.
Also, you use this at your own risk! ;)