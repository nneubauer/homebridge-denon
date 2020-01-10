const request = require('request');
const parseString = require('xml2js').parseString;

const pluginName = 'hombridge-denon-heos';
const platformName = 'DenonAVR';

let Service;
let Characteristic;
let Accessory;
let UUIDGen;

var pollingInterval;
/* Setup settings button and info button */
var infoMenu = 'MNINF';
var settingsMenu = 'MNMEN ON';

module.exports = homebridge => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.platformAccessory;
	UUIDGen = homebridge.hap.uuid;

	homebridge.registerPlatform(pluginName, platformName, denonClient, true);
};


class denonClient {
	constructor(log, config, api) {
		this.log = log;
		this.port = 3000;
		this.api = api;

		this.tvAccessories = [];
		this.legacyAccessories = [];

		this.pollingInterval = config.pollInterval || 5;
		this.pollingInterval = this.pollingInterval * 1000;

		pollingInterval = this.pollingInterval;

		this.devices = config.devices || [];
		this.switches = config.switches || [];


		/* the services */
		// this.retrieveDenonInformation();

		// configuration
		for (var i in this.devices) {
			this.tvAccessories.push(new tvClient(log, this.devices[i], api));
		}


		for (var i in this.switches) {
			this.legacyAccessories.push(new legacyClient(log, this.switches[i], api));
		}
		
		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}

	configureAccessory(){}
	removeAccessory(){}
	didFinishLaunching(){

		this.log.debug('didFinishLaunching');
		for (var i in this.legacyAccessories) {
			this.api.registerPlatformAccessories(pluginName, platformName, [this.legacyAccessories[i].returnAccessory()]);
		}
	}

	/*****************************************
	* Start of Setup services
	****************************************/
	retrieveDenonInformation() {
		this.log.debug('retrieveDenonInformation');

		var that = this;
		request('http://' + this.ip + ':60006/upnp/desc/aios_device/aios_device.xml', function(error, response, body) {
			if(error) {
				that.log.debug("Error while getting power state %s", error);
			} else {
				parseString(body, function (err, result) {
					if(error) {
						that.log("Error while parsing %s", err);
					} else {
						var manufacturer = result.root.device[0].manufacturer[0];
						var modelName = (' ' + result.root.device[0].modelName[0]).slice(1);
						var serialNumber = result.root.device[0].serialNumber[0];
						var firmwareRevision = result.root.device[0].deviceList[0].device[3].firmware_version[0];

						that.log.debug('Manufacturer: %s', manufacturer);
						that.log.debug('Model: %s', modelName);
						that.log.debug('Serialnumber: %s', serialNumber);
						that.log.debug('Firmware: %s', firmwareRevision);
					}
				});
			}
		});
	}
	/*****************************************
	* End of Setup services
	****************************************/

}

class tvClient {
	constructor(log, device, api) {
		this.log = log;
		this.port = 3000;
		this.api = api;

		// configuration
		this.name = device.name || 'Denon Receiver';
		this.ip = device.ip;

		// this.volumeControl = device.volumeControlBulb;
		// if (this.volumeControl === undefined) {
		// 	this.volumeControl = false;
		// }
		// this.volumeLimit = device.volumeLimit;
		// if (this.volumeLimit === undefined || isNaN(this.volumeLimit) || this.volumeLimit < 0) {
		// 	this.volumeLimit = 100;
		// }

		this.inputs = device.inputs;

		this.switchInfoMenu = device.switchInfoMenu;
		if (this.switchInfoMenu === true) {
			this.infoButton = settingsMenu;
			this.menuButton = infoMenu;
		} else {
			this.infoButton = infoMenu;
			this.menuButton = settingsMenu;
		}

		/* setup variables */
		this.connected = false;
		this.inputIDSet = false;
		this.inputIDs = new Array();
		this.checkAliveInterval = null;
			
		this.manufacturer = 'Denon';
		this.modelName = device.model || 'homebridge-denon-heos';
		this.serialNumber = 'MVV123';
		this.firmwareRevision = '0.0';

		this.setupTvService();
		
		/* start the polling */
		if (!this.checkAliveInterval) {
			this.checkAliveInterval = setInterval(this.checkReceiverState.bind(this, this.updateReceiverStatus.bind(this)), pollingInterval);
		}


	}

	/*****************************************
	* Start of Setup services
	****************************************/
	retrieveDenonInformation() {
		this.log.debug('retrieveDenonInformation');

		var that = this;
		request('http://' + this.ip + ':60006/upnp/desc/aios_device/aios_device.xml', function(error, response, body) {
			if(error) {
				that.log.debug("Error while getting power state %s", error);
			} else {
				parseString(body, function (err, result) {
					if(error) {
						that.log("Error while parsing %s", err);
					} else {
						var manufacturer = result.root.device[0].manufacturer[0];
						var modelName = (' ' + result.root.device[0].modelName[0]).slice(1);
						var serialNumber = result.root.device[0].serialNumber[0];
						var firmwareRevision = result.root.device[0].deviceList[0].device[3].firmware_version[0];

						that.log.debug('Manufacturer: %s', manufacturer);
						that.log.debug('Model: %s', modelName);
						that.log.debug('Serialnumber: %s', serialNumber);
						that.log.debug('Firmware: %s', firmwareRevision);
					}
				});
			}
		});
	}
	/*****************************************
	* End of Setup services
	****************************************/

	/*****************************************
	 * Start of TV integration service 
	 ****************************************/
	setupTvService() {
		this.tvAccesory = new Accessory(this.name, UUIDGen.generate(this.ip + this.name));

		this.tvService = new Service.Television(this.name, 'tvService');
		this.tvService
			.setCharacteristic(Characteristic.ConfiguredName, this.name);
		this.tvService
			.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
		this.tvService
			.getCharacteristic(Characteristic.Active)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));
		this.tvService
			.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('set', (inputIdentifier, callback) => {
				this.setAppSwitchState(true, callback, this.inputIDs[inputIdentifier]);
			})
			.on('get', this.getAppSwitchState.bind(this));
		this.tvService
			.getCharacteristic(Characteristic.RemoteKey)
			.on('set', this.remoteKeyPress.bind(this));
		this.tvService
			.getCharacteristic(Characteristic.PowerModeSelection)
			.on('set', (newValue, callback) => {
				if (this.connected) {
					request('http://' + this.ip + ':8080/goform/formiPhoneAppDirect.xml?' + this.menuButton, function(error, response, body) {});
				} 
				callback();
			});

		
		this.tvAccesory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

		this.tvAccesory.addService(this.tvService);

		this.setupTvSpeakerService();
		this.setupInputSourcesService();


		this.log.debug('publishExternalAccessories');
		this.api.publishExternalAccessories(pluginName, [this.tvAccesory]);
	}

	setupTvSpeakerService() {
		this.log.debug('setupTvSpeakerService');
		this.tvSpeakerService = new Service.TelevisionSpeaker(this.name + ' Volume', 'tvSpeakerService');
		this.tvSpeakerService
			.setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
		this.tvSpeakerService
			.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', (state, callback) => {
				this.log.debug('Remote control (VolumeSelector), pressed: %s', state === 1 ? 'Down' : 'Up');
				this.setVolumeSwitch(state, callback, !state);
			});
		
		this.tvAccesory.addService(this.tvSpeakerService);
		this.tvService.addLinkedService(this.tvSpeakerService);
	}

	setupInputSourcesService() {
		this.log.debug('setupInputSourcesService');
		if (this.inputs === undefined || this.inputs === null || this.inputs.length <= 0) {
			return;
		}

		if (Array.isArray(this.inputs) === false) {
			this.inputs = [this.inputs];
		}

		let savedNames = {};

		this.inputs.forEach((value, i) => {

			// get inputID
			let inputID = null;

			if (value.inputID !== undefined) {
				inputID = value.inputID;
			} else {
				inputID = value;
			}

			// get name		
			let inputName = inputID;

			if (savedNames && savedNames[inputID]) {
				inputName = savedNames[inputID];
			} else if (value.name) {
				inputName = value.name;
			}

			// if inputID not null or empty add the input
			if (inputID !== undefined && inputID !== null && inputID !== '') {
				inputID = inputID.replace(/\s/g, ''); // remove all white spaces from the string

				let tempInput = new Service.InputSource(inputID, 'inputSource' + i);
				tempInput
					.setCharacteristic(Characteristic.Identifier, i)
					.setCharacteristic(Characteristic.ConfiguredName, inputName)
					.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
					.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.APPLICATION)
					.setCharacteristic(Characteristic.CurrentVisibilityState, Characteristic.CurrentVisibilityState.SHOWN);

				tempInput
					.getCharacteristic(Characteristic.ConfiguredName)
					.on('set', (name, callback) => {
						savedNames[inputID] = name;
						callback()
					});

				this.tvAccesory.addService(tempInput);
				if (!tempInput.linked)
					this.tvService.addLinkedService(tempInput);
				this.inputIDs.push(inputID);
			}

		});
	}	
	/*****************************************
	* End of TV integration service 
	****************************************/


	/*****************************************
	 * Start of helper methods
	 ****************************************/
	updateReceiverStatus(error, tvStatus, inputID) {
		if (!tvStatus) {
			if (this.powerService) 
				this.powerService
					.getCharacteristic(Characteristic.On)
					.updateValue(false);
			if (this.tvService) 
				this.tvService
					.getCharacteristic(Characteristic.Active)
					.updateValue(false); //tv service
			if (this.volumeService) 
				this.volumeService
					.getCharacteristic(Characteristic.On)
					.updateValue(false);
		} else {
			if (this.powerService) 
				this.powerService
					.getCharacteristic(Characteristic.On)
					.updateValue(true);
			if (this.tvService) {
				this.tvService
					.getCharacteristic(Characteristic.Active)
					.updateValue(true); //tv service
				}
		}
	}
	/*****************************************
	 * End of helper methods
	 ****************************************/

 	/*****************************************
	 * Start of Homebridge Setters/Getters
	 ****************************************/
	checkReceiverState(callback) {		
		var that = this;

		request('http://' + this.ip + ':8080/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
			if(error) {
				that.log.debug("Error while getting power state %s", error);
				that.connected = false;
			} else {
				parseString(body, function (err, result) {
				if(error) {
					that.log.debug("Error while parsing %s", err);
				}
				else {		
					//It is on if it is powered and the correct input is selected.
					if ( result.item.Power[0].value[0] === 'ON' ) {
						let inputName = result.item.InputFuncSelect[0].value[0];
							for (let i = 0; i < that.inputIDs.length; i++) {
								if (inputName === that.inputIDs[i]) {
									if (that.inputIDSet === false)
										that.tvService
											.getCharacteristic(Characteristic.ActiveIdentifier)
											.updateValue(i);
									else 
										that.inputIDSet = false;	
								}
							}
						that.connected = true;
					} else {
						that.connected = false;
					}
				}
				});
			}
		});
		callback(null, this.connected, this.inputID);
	}


	getPowerState(callback) {
		this.log.debug('getPowerState');
		callback(null, this.connected);
	}

	setPowerState(state, callback) {
		this.log.debug('setPowerState state: %s', state ? 'On' : 'Off');
		var that = this;
	
		var stateString = (state ? 'On' : 'Standby');
	
		request('http://' + that.ip + ':8080/goform/formiPhoneAppPower.xml?1+Power' + stateString, function(error, response, body) {
			if(error) {
				that.log.debug("Error while setting power state %s", error);
				callback(error);
			} else if(state) {
				/* Switch to correct input if switching on and legacy service */
				if (!this.isTvService && that.inputs.length > 0) {
					request('http://' + that.ip + ':8080/goform/formiPhoneAppDirect.xml?SI' + that.inputs[0].inputID, function(error, response, body) {
						if(error) {
						  	that.log("Error while switching input %s", error);
						  	callback(error);
						} else {
							that.connected = true;
						  	callback();
						}
					});
				} else {
					that.connected = true;
					callback();
				}
			} else {
				that.connected = false;
				callback();
			}
		});
	}

	setVolume(level, callback) {
		if (this.connected) {
			callback();
		} else {
			callback();
		}
	}

	getVolumeSwitch(callback) {
		callback(null, false);
	}

	setVolumeSwitch(state, callback, isUp) {
		var that = this;
		if (this.connected) {
			var stateString = (isUp ? 'MVUP' : 'MVDOWN');
	
			request('http://' + this.ip + ':8080/goform/formiPhoneAppDirect.xml?' + stateString, function(error, response, body) {
				if(error) {
					that.log.debug("Error while setting volume: %s", error);
				} 
			});
		}
		callback();
	}

	getAppSwitchState(callback) {
		this.log.debug('getAppSwitchState');
		if (this.connected) {
			var that = this;
			request('http://' + this.ip + ':8080/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
				if(error) {
					that.log.debug("Error while getting power state %s", error);
				} else {
					parseString(body, function (err, result) {
						if(error) {
							that.log.debug("Error while parsing %s", err);
							callback(error);
						}
						else {		
							let inputName = result.item.InputFuncSelect[0].value[0];
							for (let i = 0; i < that.inputIDs.length; i++) {
								if (inputName === that.inputIDs[i]) {
									that.tvService
										.getCharacteristic(Characteristic.ActiveIdentifier)
										.updateValue(i);
								}
							}
							callback();
						}
					});
				}
			});
		} else {
			callback();
		}
	}

	setAppSwitchState(state, callback, inputName) {
		this.log.debug('setAppSwitchState');
		if (this.connected) {
			if (state) {
				var that = this;
				that.inputIDSet = true;
				request('http://' + that.ip + ':8080/goform/formiPhoneAppDirect.xml?SI' + inputName, function(error, response, body) {
					if(error) {
						that.log.debug("Error while switching input %s", error);
						if (callback)
							callback(error);
					} else {
						if (callback)
							callback();
					}
				});
			}
		} else if (callback) {
			callback();
		}
	}

	remoteKeyPress(remoteKey, callback) {
		this.log.debug('Denon - remote key pressed: %d', remoteKey);
		var ctrlString = '';

		switch (remoteKey) {
			case Characteristic.RemoteKey.REWIND:
				break;
			case Characteristic.RemoteKey.FAST_FORWARD:
				break;
			case Characteristic.RemoteKey.NEXT_TRACK:
				break;
			case Characteristic.RemoteKey.PREVIOUS_TRACK:
				break;
			case Characteristic.RemoteKey.ARROW_UP:
				ctrlString = 'MNCUP';
				break;
			case Characteristic.RemoteKey.ARROW_DOWN:
				ctrlString = 'MNCDN';
				break;
			case Characteristic.RemoteKey.ARROW_LEFT:
				ctrlString = 'MNCLT';
				break;
			case Characteristic.RemoteKey.ARROW_RIGHT:
				ctrlString = 'MNCRT';
				break;
			case Characteristic.RemoteKey.SELECT:
				ctrlString = 'MNENT';
				break;
			case Characteristic.RemoteKey.BACK:
				ctrlString = 'MNRTN';
				break;
			case Characteristic.RemoteKey.EXIT:
				break;
			case Characteristic.RemoteKey.PLAY_PAUSE:
				break;
			case Characteristic.RemoteKey.INFORMATION:
				ctrlString = this.infoButton;
				break;
		}

		var that = this;
		if (this.connected) {
			request('http://' + this.ip + ':8080/goform/formiPhoneAppDirect.xml?' + ctrlString, function(error, response, body) {
				// callback();
			});
		}
		callback();
	}
	/*****************************************
	* End of Homebridge Setters/Getters
	****************************************/
}

class legacyClient {
	constructor(log, switches, api) {
		this.log = log;
		this.port = 3000;
		this.api = api;

		// configuration
		this.name = switches.name || 'Denon Input';
		this.ip = switches.ip;

		this.inputID = switches.inputID;

		/* setup variables */
		this.connected = false;
		this.checkAliveInterval = null;
			
		this.pollAllInput = switches.pollAllInput || false;

		this.manufacturer = 'Denon';
		this.modelName = switches.model || 'homebridge-denon-heos';
		this.serialNumber = 'MVV123';
		this.firmwareRevision = '0.0';

		this.setupLegacyService();

		if (!this.checkAliveInterval) {
			this.checkAliveInterval = setInterval(this.pollForUpdates.bind(this), pollingInterval);
		}
	}

	/*****************************************
	 * Start of legacy service 
	 ****************************************/
	setupLegacyService() {
		var uuid = UUIDGen.generate(this.name+this.ip);

		this.accessory =  new Accessory(this.name, uuid);
		this.api.unregisterPlatformAccessories(pluginName, platformName, [this.accessory]);

		this.accessory.reachable = true;
		this.accessory.context.model = 'model';
		this.accessory.context.url = 'url';
		this.accessory.context.name = 'name';
		this.accessory.context.displayName = 'displayName';
		
		this.switchService = new Service.Switch(this.name, 'legacyInput');
		this.switchService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getPowerState.bind(this))
			.on('set', this.setPowerState.bind(this));

		this.accessory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

			this.accessory.addService(this.switchService);


		this.log.debug('registerPlatformAccessories');
		// this.api.registerPlatformAccessories(pluginName, platformName, [this.accessory]);
	}

	returnAccessory(){
		return this.accessory;
	}

	/*
	 * This will start a polling loop that goes on forever and updates
	 * the on characteristic periodically.
	 */
	pollForUpdates() {
		var that = this;
		request('http://' + that.ip + ':8080/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
			if(error) {
				// that.log.debug("Error while getting power state %s", error);
				that.connected = false;
			} else {
				parseString(body, function (err, result) {
					if(error) {
						// that.log.debug("Error while parsing %s", err);
					}
					else {	
						// that.log.debug("Got power state to be %s", result.item.Power[0].value[0]);
						// that.log.debug("Got input state to be %s", result.item.InputFuncSelect[0].value[0]);

						//It is on if it is powered and the correct input is selected.
						if (result.item.Power[0].value[0] === 'ON' && (result.item.InputFuncSelect[0].value[0] == that.inputID || that.pollAllInput)) {
							that.connected = true;
						} else {
							that.connected = false;
						}
						if (that.accessory) {
								that.accessory
									.getService(Service.Switch)
									.getCharacteristic(Characteristic.On)
									.updateValue(that.connected);
						}
					}
				});
			}
		});
	}

	getPowerState(callback) {
		this.log.debug('getPowerState');
		var that = this;
		request('http://' + that.ip + ':8080/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
			if(!error) {
				parseString(body, function (err, result) {
					if(error) {
						// that.log.debug("Error while parsing %s", err);
					}
					else {	
						//It is on if it is powered and the correct input is selected.
						if (result.item.Power[0].value[0] === 'ON' && (result.item.InputFuncSelect[0].value[0] == that.inputID || that.pollAllInput)) {
							that.connected = true;
						} else {
							that.connected = false;
						}
						callback(null, that.connected);
					}
				});
			}
		});
	}

	setPowerState(state, callback) {
		this.log.debug('setPowerState state: %s', state ? 'On' : 'Off');
		var that = this;
	
		var stateString = (state ? 'On' : 'Standby');
	
		request('http://' + that.ip + ':8080/goform/formiPhoneAppPower.xml?1+Power' + stateString, function(error, response, body) {
			if(error) {
				that.log.debug("Error while setting power state %s", error);
				callback(error);
			} else if(state) {
				/* Switch to correct input if switching on and legacy service */
					request('http://' + that.ip + ':8080/goform/formiPhoneAppDirect.xml?SI' + that.inputID, function(error, response, body) {
						if(error) {
						  	that.log("Error while switching input %s", error);
						  	callback(error);
						} else {
							that.connected = true;
						  	callback();
						}
					});
			} else {
				that.connected = false;
				callback();
			}
		});
	}

	/*****************************************
	 * End of legacy service 
	 ****************************************/
}

