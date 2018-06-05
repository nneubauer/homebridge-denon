# A Plugin for hombridge to control a Denon AVR

This has been forked from https://github.com/xkonni/homebridge-denon which unfortunatly uses a modified version of
the node-denon-client and has little to no documentation.

# Install

The plugin registers as `hombridge-denon-avr` to avoid ambuigity with another plugin that already exists `homebridge-denon`,
which I found not to work with newer Denon AVR generations. Until I find out how to publish note packages use

`git clone`
`cd homebridge-denon`
`sudo npm -g install .`

## features
* rudimentary support for zone1,zone2 via homebridge

## bugs
* defaultVolume not yet working

## dependencies

Based on https://github.com/lmoe/node-denon-client
