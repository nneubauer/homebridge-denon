const request = require('request');
const parseString = require('xml2js').parseString;

const pluginName = 'hombridge-denon-heos';
const platformName = 'DenonAVR';

const infoRetDelay = 1000;
const traceOn = false;

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

		// configuration
		for (var i in this.switches) {
			this.legacyAccessories.push(new legacyClient(log, this.switches[i], api));
		}

		for (var i in this.devices) {
			this.tvAccessories.push(new tvClient(log, this.devices[i], api));
		}


		
		this.api.on('didFinishLaunching', this.didFinishLaunching.bind(this));
	}

	configureAccessory(){}
	removeAccessory(){}
	didFinishLaunching(){
		var that = this;
		setTimeout(function () { 
			that.log.debug('didFinishLaunching');
			for (var i in that.legacyAccessories) {
				that.api.registerPlatformAccessories(pluginName, platformName, [that.legacyAccessories[i].returnAccessory()]);
			}
		}, (this.devices.length + 1) * infoRetDelay);
	}
}

class tvClient {
	constructor(log, device, api) {
		this.log = log;
		this.port = 3000;
		this.api = api;

		this.devInfoSet = false;

		this.manufacturer = 'Denon';
		this.modelName = device.model || 'homebridge-denon-heos';
		this.serialNumber = 'MVV123';
		this.firmwareRevision = '0.0';

		// configuration
		this.name = device.name || 'Denon Receiver';
		this.ip = device.ip;

		this.webAPIPort = device.port || 'auto';

		this.retrieveDenonInformation();
		
		
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
		
		/* Delay to wait for retrieve device info */
		setTimeout(this.setupTvService.bind(this), infoRetDelay);
	}

	retrieveDenonInformation() {
		if (traceOn)
			this.log.debug('retrieveDenonInformation');

		var that = this;
		request('http://' + this.ip + ':60006/upnp/desc/aios_device/aios_device.xml', function(error, response, body) {
			if(error) {
				that.log.error("Error while getting information of receiver with IP: %s. %s", that.ip, error);
				that.webAPIPort = 8080;
			} else {
				body = body.replace(/:/g, '');
				parseString(body, function (err, result) {
					if(err) {
						that.log.debug("Error while parsing retrieveDenonInformation. %s", err);
					} else {
						try {
							that.manufacturer = result.root.device[0].manufacturer[0];
							that.modelName = (' ' + result.root.device[0].modelName[0]).slice(1);
							that.serialNumber = result.root.device[0].serialNumber[0];
							
							for (let i = 0; i < result.root.device[0].deviceList[0].device.length; i++){
								try {
									that.firmwareRevision = result.root.device[0].deviceList[0].device[i].firmware_version[0];
									break;
								} catch (error) {
									that.log.debug(error);
								}
							}

							if (that.webAPIPort === 'auto')
								that.webAPIPort = result.root.device[0].DMHX_WebAPIPort[0];

							that.log('----------TV Service----------');
							that.log('Manufacturer: %s', that.manufacturer);
							that.log('Model: %s', that.modelName);
							that.log('Serialnumber: %s', that.serialNumber);
							that.log('Firmware: %s', that.firmwareRevision);
							that.log('Port: %s', that.webAPIPort);
							that.log('------------------------------');
							that.devInfoSet = true;
						} catch (error) {
							that.log.debug('Receiver with IP %s not yet ready.', that.ip);
							that.log.debug(error);
						}
					}
				});
			}
		});
	}

	/*****************************************
	 * Start of TV integration service 
	 ****************************************/
	setupTvService() {
		if (traceOn)
			this.log.debug('setupTvService');
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
					if (!this.devInfoSet) 
						this.retrieveDenonInformation();
					else 
						request('http://' + this.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppDirect.xml?' + this.menuButton, function(error, response, body) {});
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

		/* start the polling */
		if (!this.checkAliveInterval) {
			this.checkAliveInterval = setInterval(this.checkReceiverState.bind(this, this.updateReceiverStatus.bind(this)), pollingInterval);
		} 
	}

	setupTvSpeakerService() {
		if (traceOn)
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
		if (traceOn)
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
		if (traceOn)
			this.log.debug('updateReceiverStatus');
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
		if (traceOn)
			this.log.debug('checkReceiverState');	
		var that = this;

		if (!this.devInfoSet) {
			this.retrieveDenonInformation();
		} else {
			request('http://' + this.ip + ':' + this.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
				if(error) {
					that.log.debug("Error while getting power state %s", error);
					that.connected = false;
				} else if (body.indexOf('Error 403: Forbidden') === 0) {
					that.log.error('Can not access receiver. Might be due to a wrong port in config file. Try 80 or 8080 manually');
				} else {
					parseString(body, function (err, result) {
					if(err) {
						that.log.debug("Error while parsing checkReceiverState. %s", err);
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
		}
		callback(null, this.connected, this.inputID);
	}


	getPowerState(callback) {
		if (traceOn)
			this.log.debug('getPowerState');
		callback(null, this.connected);
	}

	setPowerState(state, callback) {
		if (traceOn)
			this.log.debug('setPowerState state: %s', state ? 'On' : 'Off');
		var that = this;
	
		var stateString = (state ? 'On' : 'Standby');
	
		if (!this.devInfoSet) {
			this.retrieveDenonInformation();
		} else {
			request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppPower.xml?1+Power' + stateString, function(error, response, body) {
				if(error) {
					that.log.debug("Error while setting power state %s", error);
					callback(error);
				} else if (body.indexOf('Error 403: Forbidden') === 0) {
					that.log.error('Can not access receiver. Might be due to a wrong port in config file. Try 80 or 8080 manually');
				} else if(state) {
					that.connected = true;
					callback();
				} else {
					that.connected = false;
					callback();
				}
			});
		}
	}

	setVolume(level, callback) {
		if (traceOn)
			this.log.debug('setVolume');	
		if (this.connected) {
			callback();
		} else {
			callback();
		}
	}

	getVolumeSwitch(callback) {
		if (traceOn)
			this.log.debug('getVolumeSwitch');
		callback(null, false);
	}

	setVolumeSwitch(state, callback, isUp) {
		if (traceOn)
			this.log.debug('setVolumeSwitch');
		var that = this;
		if (this.connected) {
			var stateString = (isUp ? 'MVUP' : 'MVDOWN');
			
			if (!this.devInfoSet) {
				this.retrieveDenonInformation();
			} else {	
				request('http://' + this.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppDirect.xml?' + stateString, function(error, response, body) {
					if(error) {
						that.log.debug("Error while setting volume: %s", error);
					} else if (body.indexOf('Error 403: Forbidden') === 0) {
						that.log.error('Can not access receiver. Might be due to a wrong port in config file. Try 80 or 8080 manually');
					} 
				});
			}
		}
		callback();
	}

	getAppSwitchState(callback) {
		if (traceOn)
			this.log.debug('getAppSwitchState');
		if (this.connected) {
			var that = this;
			if (!this.devInfoSet) {
				this.retrieveDenonInformation();
			} else {
				request('http://' + this.ip + ':' + this.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
					if(error) {
						that.log.debug("Error while getting power state %s", error);
					} else if (body.indexOf('Error 403: Forbidden') === 0) {
						that.log.error('Can not access receiver. Might be due to a wrong port in config file. Try 80 or 8080 manually');
					} else {
						parseString(body, function (err, result) {
							if(err) {
								that.log.debug("Error while parsing getAppSwitchState. %s", err);
								callback(err);
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
			}
		} else {
			callback();
		}
	}

	setAppSwitchState(state, callback, inputName) {
		inputName = inputName.replace('/', '%2F');
		
		if (traceOn)
			this.log.debug('setAppSwitchState');
		if (this.connected) {
			if (state) {
				var that = this;
				that.inputIDSet = true;
				if (!this.devInfoSet) {
					this.retrieveDenonInformation();
				} else {
					request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppDirect.xml?SI' + inputName, function(error, response, body) {
						if(error) {
							that.log.debug("Error while switching input %s", error);
							if (callback)
								callback(error);

						} else if (body.indexOf('Error 403: Forbidden') === 0) {
							that.log.error('Can not access receiver. Might be due to a wrong port in config file. Try 80 or 8080 manually');
						} else {
							if (callback)
								callback();
						}
					});
				}
			}
		} else if (callback) {
			callback();
		}
	}

	remoteKeyPress(remoteKey, callback) {
		if (traceOn)
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
			if (!this.devInfoSet) {
				this.retrieveDenonInformation();
			} else {
				request('http://' + this.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppDirect.xml?' + ctrlString, function(error, response, body) {
				// callback();
				});
			}
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

		this.devInfoSet = false;

		this.manufacturer = 'Denon';
		this.modelName = switches.model || 'homebridge-denon-heos';
		this.serialNumber = 'MVV123';
		this.firmwareRevision = '0.0';

		// configuration
		this.name = switches.name || 'Denon Input';
		this.ip = switches.ip;

		this.webAPIPort = switches.port || 'auto';

		this.retrieveDenonInformation();

		this.inputID = switches.inputID;

		/* setup variables */
		this.connected = false;
		this.checkAliveInterval = null;
			
		this.pollAllInput = switches.pollAllInput || false;

		/* Delay to wait for retrieve device info */
		var uuid = UUIDGen.generate(this.name+this.ip);

		this.accessory =  new Accessory(this.name, uuid);
		this.api.unregisterPlatformAccessories(pluginName, platformName, [this.accessory]);

		setTimeout(this.setupLegacyService.bind(this), infoRetDelay);
	}

	/*****************************************
	 * Start of legacy service 
	 ****************************************/
	setupLegacyService() {
		if (traceOn)
			this.log.debug('setupLegacyService');

		this.accessory.reachable = true;
		this.accessory.context.model = 'model';
		this.accessory.context.url = 'url';
		this.accessory.context.name = 'name';
		this.accessory.context.displayName = 'displayName';
		
		this.switchService = new Service.Switch(this.name, 'legacyInput');
		this.switchService
			.getCharacteristic(Characteristic.On)
			.on('get', this.getPowerStateLeg.bind(this))
			.on('set', this.setPowerStateLeg.bind(this));

		this.accessory
			.getService(Service.AccessoryInformation)
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.modelName)
			.setCharacteristic(Characteristic.SerialNumber, this.serialNumber)
			.setCharacteristic(Characteristic.FirmwareRevision, this.firmwareRevision);

			this.accessory.addService(this.switchService);

		/* start the polling */
		if (!this.checkAliveInterval) {
			this.checkAliveInterval = setInterval(this.pollForUpdates.bind(this), pollingInterval);
		}
	}

	returnAccessory(){
		return this.accessory;
	}

	/*
	 * This will start a polling loop that goes on forever and updates
	 * the on characteristic periodically.
	 */
	pollForUpdates() {
		if (traceOn)
			this.log.debug('pollForUpdates');
		var that = this;

		if (!this.devInfoSet) {
			this.retrieveDenonInformation();
		} else {
			request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
				if(error) {
					that.log.debug("Error while getting power state %s", error);
					that.connected = false;
				} else if (body.indexOf('Error 403: Forbidden') === 0) {
					that.log.error('Can not access receiver. Might be due to a wrong port in config file. Try 80 or 8080 manually');
				} else {
					parseString(body, function (err, result) {
						if(err) {
							that.log.debug("Error while parsing pollForUpdates. %s", err);
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
	}

	getPowerStateLeg(callback) {
		if (traceOn)
			this.log.debug('getPowerStateLeg');
		var that = this;
		if (!this.devInfoSet) {
			this.retrieveDenonInformation();
		} else {
			request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formMainZone_MainZoneXmlStatusLite.xml', function(error, response, body) {
				if(error) {
					that.log.debug("Error while getting power state %s", error);
					that.connected = false;
				} else if (body.indexOf('Error 403: Forbidden') === 0) {
					that.log.error('Can not access receiver. Might be due to a wrong port in config file. Try 80 or 8080 manually');
				} else {
					parseString(body, function (err, result) {
						if(err) {
							that.log.debug("Error while parsing getPowerStateLeg. %s", err);
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
	}

	setPowerStateLeg(state, callback) {
		if (traceOn)
			this.log.debug('setPowerStateLeg state: %s', state ? 'On' : 'Off');
		var that = this;
	
		var stateString = (state ? 'On' : 'Standby');
	
		if (!this.devInfoSet) {
			this.retrieveDenonInformation();
		} else {
			request('http://' + that.ip + ':' + this.webAPIPort + '/goform/formiPhoneAppPower.xml?1+Power' + stateString, function(error, response, body) {
				if(error) {
					that.log.debug("Error while setting power state %s", error);
					callback(error);
				} else if (body.indexOf('Error 403: Forbidden') === 0) {
					that.log.error('Can not access receiver. Might be due to a wrong port in config file. Try 80 or 8080 manually');
				} else if(state) {
					/* Switch to correct input if switching on and legacy service */
						let inputName = that.inputID;
						inputName = inputName.replace('/', '%2F');
						request('http://' + that.ip + ':' + that.webAPIPort + '/goform/formiPhoneAppDirect.xml?SI' + inputID, function(error, response, body) {
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
	}

	retrieveDenonInformation() {
		if (traceOn)
			this.log.debug('retrieveDenonInformation');

		var that = this;
		request('http://' + this.ip + ':60006/upnp/desc/aios_device/aios_device.xml', function(error, response, body) {
			if(error) {
				that.log.error("Error while getting information of receiver with IP: %s. %s", that.ip, error);
				that.webAPIPort = 8080;
			} else {
				body = body.replace(/:/g, '');
				parseString(body, function (err, result) {
					if(err) {
						that.log.debug("Error while parsing retrieveDenonInformation. %s", err);
					} else {
						try {
							that.manufacturer = result.root.device[0].manufacturer[0];
							that.modelName = (' ' + result.root.device[0].modelName[0]).slice(1);
							that.serialNumber = result.root.device[0].serialNumber[0];
							
							for (let i = 0; i < result.root.device[0].deviceList[0].device.length; i++){
								try {
									that.firmwareRevision = result.root.device[0].deviceList[0].device[i].firmware_version[0];
									break;
								} catch (error) {
									that.log.debug(error);
								}
							}

							if (that.webAPIPort === 'auto')
								that.webAPIPort = result.root.device[0].DMHX_WebAPIPort[0];

							that.log('--------Legacy Service--------');
							that.log('Manufacturer: %s', that.manufacturer);
							that.log('Model: %s', that.modelName);
							that.log('Serialnumber: %s', that.serialNumber);
							that.log('Firmware: %s', that.firmwareRevision);
							that.log('Port: %s', that.webAPIPort);
							that.log('------------------------------');
							that.devInfoSet = true;
						} catch (error) {
							that.log.debug('Receiver with IP %s not yet ready.', that.ip);
							that.log.debug(error);
						}
					}
				});
			}
		});
	}

	/*****************************************
	 * End of legacy service 
	 ****************************************/
	
}

