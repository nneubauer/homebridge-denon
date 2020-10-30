# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Add
- Add option for auto discovery IP address.

### Change
- Improve volume control continuous pressing button for remote widget.

## [Released]
## [2.9.6] - 2020-10-28
### Fixed
- Fixed bug for homebridge 1.3
- Improved debug messages

## [2.9.3] - 2020-10-28
### Fixed
- Made config.schema more clear

## [2.9.2] - 2020-10-28
### Fixed
- Improved handling of having (and not having) multiple zones

## [2.9.1] - 2020-10-28
### Fixed
- Possible fix for handling cached accessories

## [2.9.0] - 2020-10-11
### Added
- Can set volume control now to a speaker type (not supported in native home app yet)
- New way to set the volume control type

### Fixed
- Fixed support for Zone 3

## [2.8.5] - 2020-06-24
### Added
- Support for receiver type in the Home app

## [2.8.3] - 2020-05-22
### Fixed
- Fixed second zone with same name UUID
- Fixed config volumeAsFan GUI X

## [2.8.1] - 2020-05-21
### Fixed
- Fixed wrong debug info

## [2.8.0] - 2020-05-21
### Added
- Support for volume control as fan instead of a lightbulb

### Fixed
- Improved handling of cached accessories

## [2.7.1] - 2020-05-18
### Added
- Support for a default input select TV client

## [2.6.2] - 2020-05-08
### Fixed
- Fixed setting input with switches and log update

## [2.6.0] - 2020-05-05
### Added
- Support for a second and third zone

## [2.5.4] - 2020-04-30
### Fixed
- Hotfix for crashing at startup

## [2.5.3] - 2020-04-30
### Fixed
- Fixed default values in config.schema

## [2.5.2] - 2020-04-27
### Fixed
- Fixed dependencies for validation process

## [2.5.1] - 2020-04-27
### Fixed
- Fixed starting wihout config setup

## [2.5.0] - 2020-04-27
### Added
- Support for Homebridge Config UI X

### Fixed
- Better exception handling

## [2.4.1] - 2020-04-26
### Fixed
- Fix for crash when running without config file.
- Fixed typo in plugin name. Might need some cache cleanup in homebridge folder.

## [2.4.0] - 2020-03-28
### Added
- Support for default volume levels on inputs.

## [2.3.6] - 2020-02-22
### Fixed
- Fix for support receiver without Relative/Absolute volume display support

## [2.3.5] - 2020-02-21
### Fixed
- Fix for setting volumes below 10
- Fix for force update input switches

## [2.3.4] - 2020-02-18
### Fixed
- Fix for not not functioning polling when setting port manually

## [2.3.2] - 2020-02-16
### Added
- Debug output of polled settings. Useful for testing input names

## [2.3.1] - 2020-02-16
### Fixed
- Fix for older Node versions

## [2.3.0] - 2020-02-16
### Added
- Support for Telnet communication in case of newer Denon receivers. 

### Changed
- Changed port and protocol detection for better auto discovery functionality.

## [2.2.1] - 2020-02-04
### Added
- Option to use debug log through config

## [2.2.0] - 2020-02-03
### Added
- Added the possibility to add a lightbulb which stands for the volume level of the receiver.

### Fixed
- Fix with cached accessories of changed config.json

## [2.1.1] - 2020-02-01
### Fixed
- Fix for appearing devices in Home app.

## [2.1.0] - 2020-01-30
### Added
- When changing the state of a switch, the new state is pushed to your other switches and tv accessories of the same receiver. This means a faster state update if you switch input with switches. 

### Changed
- A more sophisticated version of the polling method is implemented. Now only one polling loop is running for every receiver you configured. 

### Fixed
- Fixes of previous versions.

## [2.0.8] - 2020-01-27
### Fixed
- Fix for DDos the receiver if you have several switches of the same receiver. 
- Overall crash fixes.

## [2.0.7] - 2019-01-26
### Fixed
- Fix in auto-discovery of port settings. 
- Improved stability manual setting of port. 
- Fixed bug that the settings of the legacy switches were resetted after resetting homebridge.

## [2.0.6] - 2020-01-19
### Fixed
- Fix for wrong use of inputName

## [2.0.5] - 2020-01-19
### Changed
- Removed some error messages.

## [2.0.4] - 2020-01-19
### Fixed
- Fix for auto detect port if not supported by receiver.

## [2.0.3] - 2020-01-19
### Fixed
- Fix for not recognising input if input has special characters.

## [2.0.2] - 2020-01-19
### Fixed
- Fix for wrongfully selecting upper input when changing Volume or using automations. 

## [2.0.1] - 2020-01-19
### Added
- Correct API port for older receivers. 
- Auto detect and manual support. 
- Extract info from AVR and add it to the homebridge device information. 

## [2.0.0] - 2020-01-10
### Added
- Initial release with support for TV accessories and multiple switches in one platform.

## [1.0.0] - 2019-01-16
### Added
- Added function to poll even if wrong input is selected. 
