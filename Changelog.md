# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Add
- Add support for multi zone.
- Add default volume levels for specific inputs.
- Add option for auto discovery IP address.

### Change
- Improve volume control continuous pressing button for remote widget.

## [Released]
## [2.3.1] - 2019-02-16
### Fixed
- Fix for older Node versions

## [2.3.0] - 2019-02-16
### Added
- Support for Telnet communication in case of newer Denon receivers. 

### Changed
- Changed port and protocol detection for better auto discovery functionality.

## [2.2.1] - 2019-02-04
### Added
- Option to use debug log through config

## [2.2.0] - 2019-02-03
### Added
- Added the possibility to add a lightbulb which stands for the volume level of the receiver.

### Fixed
- Fix with cached accessories of changed config.json

## [2.1.1] - 2019-02-01
### Fixed
- Fix for appearing devices in Home app.

## [2.1.0] - 2019-01-30
### Added
- When changing the state of a switch, the new state is pushed to your other switches and tv accessories of the same receiver. This means a faster state update if you switch input with switches. 

### Changed
- A more sophisticated version of the polling method is implemented. Now only one polling loop is running for every receiver you configured. 

### Fixed
- Fixes of previous versions.

## [2.0.8] - 2019-01-27
### Fixed
- Fix for DDos the receiver if you have several switches of the same receiver. 
- Overall crash fixes.

## [2.0.7] - 2019-01-26
### Fixed
- Fix in auto-discovery of port settings. 
- Improved stability manual setting of port. 
- Fixed bug that the settings of the legacy switches were resetted after resetting homebridge.

## [2.0.6] - 2019-01-19
### Fixed
- Fix for wrong use of inputName

## [2.0.5] - 2019-01-19
### Changed
- Removed some error messages.

## [2.0.4] - 2019-01-19
### Fixed
- Fix for auto detect port if not supported by receiver.

## [2.0.3] - 2019-01-19
### Fixed
- Fix for not recognising input if input has special characters.

## [2.0.2] - 2019-01-19
### Fixed
- Fix for wrongfully selecting upper input when changing Volume or using automations. 

## [2.0.1] - 2019-01-19
### Added
- Correct API port for older receivers. 
- Auto detect and manual support. 
- Extract info from AVR and add it to the homebridge device information. 

## [2.0.0] - 2019-01-10
### Added
- Initial release with support for TV accessories and multiple switches in one platform.

### Changed

### Removed

## [Unreleased]: 